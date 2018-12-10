import _ from "lodash/fp";
import { getCache } from "./cache";
import { Context as KoaContext } from "koa";
import { createHash } from "crypto";
const cache = getCache();

// 经过body parser的koa上下文
type KoaContextAfterBodyParser = KoaContext & { request: { body: any } };

/**
 * 定义配置
 *
 * @interface IPersistCacheConfig
 */
interface IPersistCacheConfig {
  path: string;
  map: IPersistMap;
}

/**
 * GraphQL query 映射表接口
 *
 * @interface IPersistMap
 */
interface IPersistMap {
  [hash: string]: string;
}

/**
 * 传入配置参数，然后返回中间件函数
 *
 * @param {IPersistCacheConfig} config 配置
 * @returns 中间件函数
 */
function persistCacheGenerate(
  config: IPersistCacheConfig
): (ctx: KoaContext, next: Function) => void {

  if(!validation(config)) {
    throw new Error("[persist-query] invalid config for middleware")
  }

  const { path = "/graphql", map } = config;

  return async function persistCache(ctx: KoaContext, next: Function) {
    return conditionDo(
      shouldHandleByPath(ctx.path, path),
      _.partial(getQueryFromHash)([
        ctx as KoaContextAfterBodyParser,
        next,
        map
      ]),
      _.partial(execDirectly)([ctx, next])
    );

    /**
     * 实际执行，将id映射到真正的query上。并挂载在body上。
     *
     * @param {KoaContext} ctx
     * @param {Function} next
     * @returns
     */
    async function getQueryFromHash(
      ctx: KoaContextAfterBodyParser,
      next: Function,
      persistMap: IPersistMap
    ) {
      let queryHashId;
      let queryVariables;
      let requstHash;

      if (_.has("request.body")(ctx)) {
        // queryHashId = ctx.request.body.id
        // queryVariables = ctx.request.body.variate
        queryHashId = 0;

        requstHash = generateRequestHash(queryHashId, queryVariables);

        // 有cache情况下直接使用cache
        if (cache.has(requstHash)) {
          ctx.response.body = cache.get(requstHash);
          return;
        } else {
          ctx.request.body.query = persistMap[queryHashId]; 
        }
      }

      await next();

      if (queryHashId && ctx.response.type === "application/json") {
        cache.set(requstHash, ctx.body);
        // set memory cache
      }
    }

    /**
     * 不符合条件判断的跳过中间件。
     *
     * @param {KoaContext} ctx
     * @param {Function} next
     */
    async function execDirectly(ctx: KoaContext, next: Function) {
      next();
    }
  };
}

/**
 * 参数检查
 *
 * @param {*} config
 */
function validation(config: any): boolean {
  if(!_.isObject(config)) {
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
  queryVariables: undefined | object
): string {
  let variableStirng;
  if (!queryVariables || !_.isObject(queryVariables)) {
    variableStirng = "";
  } else {
    variableStirng = JSON.stringify(queryVariables);
  }
  return createHash("sha256")
    .update(queryHashId + variableStirng)
    .digest("hex");
}

export default persistCacheGenerate;
