import type { NextFunction, Request, Response } from 'express';

/** 最小 logger 接口（main.ts 的 winston.Logger 兼容此形状，避免耦合 winston 类型） */
export interface SessionFallbackLogger {
  warn: (message: string) => void;
}

/**
 * wrap session 中间件：Redis 故障（NOAUTH / 宕机 / 连接失败）时降级——
 * skip session（next 无 err）不 500，与「Redis 非必需」声明对齐。
 *
 * express-session 在 store.get 失败时把错误传给 next(err)；本 wrap 拦截：
 * - Redis 相关错误（NOAUTH/ECONNREFUSED/ECONNRESET/ETIMEDOUT/EAI_AGAIN/Redis）→
 *   记 WARN + next()（无 err），请求继续（session 未初始化，协同认证降级，非协同请求不受影响）。
 * - 其他错误 → next(err) 透传（正常错误处理）。
 * - 无错误 → next(undefined)，express-session 正常完成，行为不变。
 */
export function withSessionRedisFallback(
  sessionMiddleware: (req: Request, res: Response, next: NextFunction) => void,
  logger: SessionFallbackLogger
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (
        err &&
        /NOAUTH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|[Rr]edis/.test(
          err.message
        )
      ) {
        logger.warn(
          `Session store 降级（Redis 不可用，跳过 session）: ${err.message}`
        );
        next();
        return;
      }
      next(err);
    });
  };
}
