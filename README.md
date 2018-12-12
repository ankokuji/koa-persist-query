# koa-persist-query

需要koa-bodyparser作为前置中间件

# Intallation

通过 `yarn` 或者 `npm` 安装:
```shell
yarn add koa-persist-query
```

# Usage

```javascript

import persistQuery from "koa-persist-query";
import Koa from "koa";
import bodyparser from "koa-bodyparser";
import invert from "lodash/invert";
import queryMap from '../extracted_queries.json';

const invertedMap = invert(queryMap);

const options = {
  path: "graphql",
  map: invertedMap
}

const app = new Koa();

app.use(bodyparser());

app.use(persistQuery(options));

```
需要前置使用 `bodyparser` 中间件，中间件会读取 post 请求 body 解析后的结构化数据。同时也需要传入options配置映射表等。

中间件会解析GraphQL相关请求信息，如果请求是通过persist query方式发送，则从传入的映射表中得到真正的queryString，提供给后续的GraphQL执行环境。同时，会对持久化的请求进行请求级别的缓存。

### Options
提供一个 `options` 参数进行配置，其中应该包含以下字段:

**path**

监听 `GrapQL` 请求等路径，如 `/graphql`。

**map**

`Graphql` hash映射表，如果使用工具生成，应该为表的反转。

