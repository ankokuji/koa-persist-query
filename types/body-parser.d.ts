import "koa";

declare module "koa" {
  interface Request {
    body: {} | null | undefined;
    rawBody: {} | null | undefined;
  }
}