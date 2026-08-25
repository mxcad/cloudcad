import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtStrategyExecutor } from './jwt.strategy.executor';
import { SCRAPE_AUTH_KEY } from './decorators/scrape-auth.decorator';

describe('JwtStrategyExecutor - 抓取令牌认证（#315）', () => {
  const TOKEN = 'test-scrape-token';

  let reflector: { getAllAndOverride: jest.Mock };
  let configService: { get: jest.Mock };
  let executor: JwtStrategyExecutor;
  let request: Record<string, any>;

  const createContext = (): ExecutionContext =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    request = {
      method: 'GET',
      path: '/api/metrics',
      headers: {} as Record<string, string>,
    };
    reflector = { getAllAndOverride: jest.fn() };
    configService = { get: jest.fn() };

    executor = new JwtStrategyExecutor(
      reflector as unknown as Reflector,
      {} as any,
      {} as any,
      configService as unknown as ConfigService,
    );
  });

  it('未配置 SCRAPE_TOKEN 时直接返回 false 且不查询元数据', () => {
    configService.get.mockReturnValue(undefined);

    expect(executor['tryScrapeTokenAuth'](createContext(), request)).toBe(
      false,
    );
    expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
    expect(request.isScrapeAuth).toBeUndefined();
  });

  it('路由未声明 @ScrapeAuth 元数据时返回 false', () => {
    configService.get.mockReturnValue(TOKEN);
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(executor['tryScrapeTokenAuth'](createContext(), request)).toBe(
      false,
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SCRAPE_AUTH_KEY, [
      'handler',
      'class',
    ]);
    expect(request.isScrapeAuth).toBeUndefined();
  });

  it('Bearer 凭据匹配时放行并标记 isScrapeAuth', () => {
    configService.get.mockReturnValue(TOKEN);
    reflector.getAllAndOverride.mockReturnValue(true);
    request.headers.authorization = `Bearer ${TOKEN}`;

    expect(executor['tryScrapeTokenAuth'](createContext(), request)).toBe(true);
    expect(request.isScrapeAuth).toBe(true);
  });

  it('Basic 凭据密码字段匹配时放行并标记 isScrapeAuth', () => {
    configService.get.mockReturnValue(TOKEN);
    reflector.getAllAndOverride.mockReturnValue(true);
    const encoded = Buffer.from(`prometheus:${TOKEN}`, 'utf8').toString(
      'base64',
    );
    request.headers.authorization = `Basic ${encoded}`;

    expect(executor['tryScrapeTokenAuth'](createContext(), request)).toBe(true);
    expect(request.isScrapeAuth).toBe(true);
  });

  it('凭据不匹配时返回 false（交回原有 JWT/Session 流程以 401 拒绝）', () => {
    configService.get.mockReturnValue(TOKEN);
    reflector.getAllAndOverride.mockReturnValue(true);
    request.headers.authorization = 'Bearer wrong-token';

    expect(executor['tryScrapeTokenAuth'](createContext(), request)).toBe(
      false,
    );
    expect(request.isScrapeAuth).toBeUndefined();
  });
});
