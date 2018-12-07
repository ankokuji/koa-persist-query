import _ from "lodash/fp";
import { getCache } from "./cache";
import { Context as KoaContext } from "koa";
const cache = getCache();

/**
 * 定义配置
 *
 * @interface IPersistCacheConfig
 */
interface IPersistCacheConfig {
  path: string;
  map: IPersistMap
}

/**
 * GraphQL query 映射表接口
 *
 * @interface IPersistMap
 */
interface IPersistMap {
  [hash: string]: string
}

/**
 * 传入配置参数，然后返回中间件函数
 *
 * @param {IPersistCacheConfig} config 配置
 * @returns 中间件函数
 */
function persistCacheGenerate(config: IPersistCacheConfig): (ctx: KoaContext, next: Function) => void {

  const {
    path = "/graphql",
    map
  } = config;

  return async function persistCache(ctx: KoaContext, next: Function) {
    return conditionDo(
      shouldHandleByPath(ctx.path, path),
      _.partial(getQueryFromHash)([ctx, next, map]),
      _.partial(execDirectly)([ctx, next])
    );

    /**
     * 实际执行，将id映射到真正的query上。
     *
     * @param {KoaContext} ctx
     * @param {Function} next
     * @returns
     */
    async function getQueryFromHash(ctx: KoaContext, next: Function, map: IPersistMap) {
      let queryHashId;

      if (_.has("request.body")(ctx)) {
        // queryHashId = ctx.request.body.id
        queryHashId = 0;

        // 有cache情况下直接使用cache
        if (cache.has(queryHashId)) {
          ctx.response.body = cache.get(queryHashId);
          return;
        }

        // if (ctx.request.body.id && !ctx.request.body.query) {
        //   ctx.request.body.query = map[queryHashId];
        // }
      }

      await next();

      if (_.isNumber(queryHashId) && ctx.response.type === "application/json") {
        cache.set(queryHashId.toString(), ctx.body);
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

export default persistCacheGenerate;
