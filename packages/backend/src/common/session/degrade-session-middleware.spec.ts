import { withSessionRedisFallback } from './degrade-session-middleware';

/**
 * session 中间件 Redis 故障降级（#490）：
 * Redis NOAUTH / 宕机 / 连接失败时 skip session 不 500，与「Redis 非必需」对齐。
 */
describe('withSessionRedisFallback', () => {
  const req = {} as any;
  const res = {} as any;

  it('Redis NOAUTH 错误时降级：next() 无 err + logger.warn 被调', () => {
    const warnMock = jest.fn();
    const sessionMiddleware = (_req, _res, next) =>
      next(new Error('NOAUTH Authentication required'));
    const wrap = withSessionRedisFallback(sessionMiddleware, { warn: warnMock });
    const nextMock = jest.fn();
    wrap(req, res, nextMock);

    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(nextMock.mock.calls[0]).toEqual([]); // next() 无参数（无 err）
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toContain('NOAUTH');
  });

  it('Redis ECONNREFUSED（宕机）错误时降级', () => {
    const warnMock = jest.fn();
    const sessionMiddleware = (_req, _res, next) =>
      next(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    const wrap = withSessionRedisFallback(sessionMiddleware, { warn: warnMock });
    const nextMock = jest.fn();
    wrap(req, res, nextMock);

    expect(nextMock.mock.calls[0]).toEqual([]);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it('非 Redis 错误透传：next(err) 原样 + logger.warn 不调', () => {
    const warnMock = jest.fn();
    const boom = new Error('some other error');
    const sessionMiddleware = (_req, _res, next) => next(boom);
    const wrap = withSessionRedisFallback(sessionMiddleware, { warn: warnMock });
    const nextMock = jest.fn();
    wrap(req, res, nextMock);

    expect(nextMock).toHaveBeenCalledWith(boom);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('无错误：next() 正常 + logger.warn 不调', () => {
    const warnMock = jest.fn();
    const sessionMiddleware = (_req, _res, next) => next();
    const wrap = withSessionRedisFallback(sessionMiddleware, { warn: warnMock });
    const nextMock = jest.fn();
    wrap(req, res, nextMock);

    expect(nextMock).toHaveBeenCalledTimes(1);
    expect(nextMock.mock.calls[0]).toEqual([]);
    expect(warnMock).not.toHaveBeenCalled();
  });
});
