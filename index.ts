import _ from "lodash/fp";
import { getCache } from "./cache";
import { createHash } from "crypto";
import { HttpQueryError } from "./error";
import Koa from "koa";
const cache = getCache();

// 经过body parser的koa上下文
// type Koa.Context = KoaContext & { request: { body: any } };

/**
 * 定义配置
 *
 * @interface PersistCacheConfig
 */
interface PersistCacheConfig {
  path: string;
  map: PersistMap;
}

/**
 * GraphQL query 映射表接口
 *
 * @interface PersistMap
 */
interface PersistMap {
  [hash: string]: string;
}

/**
 * GraphQL 请求，其中包含了请求的查询字符串、变量、插件、查询hash等
 *
 * @interface GraphQLRequest
 */
interface GraphQLRequest {
  query: string | undefined;
  operationName: string;
  variables: any;
  extensions: any;
  persistHash: string;
}

/**
 * 传入配置参数，然后返回中间件函数
 *
 * @param {PersistCacheConfig} config 配置
 * @returns 中间件函数
 */
function persistCacheGenerate(
  config: PersistCacheConfig
): (ctx: Koa.Context, next: () => Promise<any>) => void {
  if (!isPersistCacheConfigValid(config)) {
    throw new Error("[persist-query-middleware] Invalid config for middleware");
  }

  const { path = "/graphql", map } = config;

  return async function persistCache(
    ctx: Koa.Context,
    next: () => Promise<any>
  ) {
    return conditionDo(
      shouldHandleByPath(ctx.path, path),
      _.partial(getQueryFromHash)([ctx as Koa.Context, next, map]),
      next
    );
  };
}

/**
 * 实际执行，将id映射到真正的query上。并挂载在body上。
 *
 * @param {Koa.Context} ctx
 * @param {Function} next
 * @returns
 */
async function getQueryFromHash(
  ctx: Koa.Context,
  next: Function,
  persistMap: PersistMap
) {
  const { query, variables, persistHash } = parseGraphQLRequest(ctx);

  const requestHash = generateRequestHash(persistHash, variables);

  const data = getResponseFromCache(requestHash);

  if (data) {
    ctx.response.body = data;
    return;
  } else {
    (ctx.request.body as any).query = persistMap[persistHash];
  }

  await next();

  cacheAfterExecutionGraphQL(ctx, {persistHash, requestHash});

}

/**
 * 获取缓存结果
 *
 * @param {string} key
 * @returns {*}
 */
function getResponseFromCache(key: string): any {
  // 有cache情况下直接使用cache
  return cache.get(key) || undefined;
}

/**
 * 在GraphQL计算完结果后，缓存结果body体
 *
 * @param {Koa.Context} ctx
 * @param {{ persistHash: string, requestHash: string}} config
 */
function cacheAfterExecutionGraphQL(ctx: Koa.Context, config: { persistHash: string, requestHash: string}) {

  const {persistHash, requestHash} = config;
  if (persistHash && ctx.response.type === "application/json") {
    cache.set(requestHash, ctx.body);
    // set memory cache
  }
}

/**
 * 从koa context请求中解析出查询字符串、变量、hash等，作为GraphQL请求
 *
 * @param {Koa.Context} ctx
 * @returns
 */
function parseGraphQLRequest(ctx: Koa.Context): GraphQLRequest {
  return _.compose(
    parseGraphQLRequestFromPayload,
    validateRequestPayload,
    parseQueryAndMethod
  )(ctx);
}

/**
 * 从请求上下文中获取
 *
 * @param {Koa.Context} ctx
 * @returns
 */
function parseQueryAndMethod(ctx: Koa.Context) {
  const query =
    ctx.request.method === "POST"
      ? // fallback to ctx.req.body for koa-multer support
        ctx.request.body || (ctx.req as any).body
      : ctx.request.query;

  return { query, method: ctx.request.method };
}

/**
 * 验证请求GraphQL相关参数是否有效
 *
 * @param {{method: string, query: any}} request 包含method和query的请求
 * @returns
 */
function validateRequestPayload(request: { method: string; query: any }) {
  const { method, query } = request;
  let requestPayload;
  switch (method) {
    case "POST":
      if (!query || Object.keys(query).length === 0) {
        throw new HttpQueryError(
          500,
          "POST body missing. Did you forget use body-parser middleware?"
        );
      }

      requestPayload = query;
      break;
    case "GET":
      if (!query || Object.keys(query).length === 0) {
        throw new HttpQueryError(400, "GET query missing.");
      }

      requestPayload = query;
      break;

    default:
      throw new HttpQueryError(
        405,
        "Apollo Server supports only GET/POST requests.",
        false,
        {
          Allow: "GET, POST"
        }
      );
  }
  return requestPayload;
}

function parseGraphQLRequestFromPayload(
  requestParams: Record<string, any>
): GraphQLRequest {
  let queryString: string | undefined = requestParams.query;
  let extensions = requestParams.extensions;

  if (typeof extensions === "string") {
    // For GET requests, we have to JSON-parse extensions. (For POST
    // requests they get parsed as part of parsing the larger body they're
    // inside.)
    try {
      extensions = JSON.parse(extensions);
    } catch (error) {
      throw new HttpQueryError(400, "Extensions are invalid JSON.");
    }
  }

  if (queryString && typeof queryString !== "string") {
    // Check for a common error first.
    if ((queryString as any).kind === "Document") {
      throw new HttpQueryError(
        400,
        "GraphQL queries must be strings. It looks like you're sending the " +
          "internal graphql-js representation of a parsed query in your " +
          "request instead of a request in the GraphQL query language. You " +
          "can convert an AST to a string using the `print` function from " +
          "`graphql`, or use a client like `apollo-client` which converts " +
          "the internal representation to a string for you."
      );
    } else {
      throw new HttpQueryError(400, "GraphQL queries must be strings.");
    }
  }

  const operationName = requestParams.operationName;

  let variables = requestParams.variables;
  if (typeof variables === "string") {
    try {
      // XXX Really we should only do this for GET requests, but for
      // compatibility reasons we'll keep doing this at least for now for
      // broken clients that ship variables in a string for no good reason.
      variables = JSON.parse(variables);
    } catch (error) {
      throw new HttpQueryError(400, "Variables are invalid JSON.");
    }
  }

  const persistHash = requestParams.id;

  return {
    query: queryString,
    operationName,
    variables,
    extensions,
    persistHash
  };
}

/**
 * 检查生成中间件参数是否有效
 *
 * @param {*} config
 */
function isPersistCacheConfigValid(config: any): boolean {
  if (!_.isObject(config)) {
    return false;
  }

  return true;
}

/**
 * 在不同条件下执行两种函数
 *
 * @param {boolean} condition 条件
 * @param {Function} operation 条件为true时执行
 * @param {Function} elseOperation 条件为false时执行
 * @returns
 */
async function conditionDo(
  condition: boolean,
  operation: Function,
  elseOperation: Function
): Promise<void> {
  if (condition) {
    return operation();
  } else {
    return elseOperation();
  }
}

/**
 * 路由的简单判断，比较是否完全一致
 *
 * @param {string} path
 * @param {string} pattern
 * @returns
 */
function shouldHandleByPath(path: string, pattern: string) {
  return pattern === path;
}

/**
 * 通过query hash id和变量生成hash
 *
 * @param {any} queryHashId
 * @param {(undefined | object)} queryVariables
 * @returns {string}
 */
function generateRequestHash(
  queryHashId: string,
  queryVariables: object | undefined
): string {
  let variableStirng;
  if (!queryVariables || !_.isObject(queryVariables)) {
    variableStirng = "";
  } else {
    try {
      variableStirng = JSON.stringify(queryVariables);
    } catch (e) {
      throw new HttpQueryError(
        400,
        "[persist-query-middleware] Variables are invalid JSON"
      );
    }
  }
  return createHash("sha256")
    .update(queryHashId + variableStirng)
    .digest("hex");
}

export default persistCacheGenerate;
