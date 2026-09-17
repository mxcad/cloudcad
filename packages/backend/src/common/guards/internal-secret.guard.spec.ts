import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalSecretGuard } from './internal-secret.guard';
import { INTERNAL_SERVICE_SECRET_HEADER } from '../utils/internal-service-auth';

// Express 将 header key 统一转小写存储，guard 亦按小写 key 读取——spec 须模拟该行为
const HEADER = INTERNAL_SERVICE_SECRET_HEADER.toLowerCase();

/**
 * 构造最小 ExecutionContext：仅需 switchToHttp().getRequest() 返回 headers/ip。
 */
function makeContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip: '10.0.0.1' }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalSecretGuard', () => {
  let guard: InternalSecretGuard;
  let mockConfigService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService = { get: jest.fn() };
    guard = new InternalSecretGuard(mockConfigService as never);
  });

  it('服务端未配置 secret 时 fail-close：即使请求头为空串也拒绝', () => {
    mockConfigService.get.mockReturnValue(undefined);
    expect(() =>
      guard.canActivate(makeContext({ [HEADER]: '' }))
    ).toThrow(UnauthorizedException);
  });

  it('请求头缺失时拒绝（secret 已配置）', () => {
    mockConfigService.get.mockReturnValue('s3cret');
    expect(() => guard.canActivate(makeContext({}))).toThrow(
      UnauthorizedException
    );
  });

  it('请求头与 secret 不一致时拒绝', () => {
    mockConfigService.get.mockReturnValue('s3cret');
    expect(() =>
      guard.canActivate(makeContext({ [HEADER]: 'wrong' }))
    ).toThrow(UnauthorizedException);
  });

  it('请求头与 secret 一致时放行', () => {
    mockConfigService.get.mockReturnValue('s3cret');
    expect(
      guard.canActivate(makeContext({ [HEADER]: 's3cret' }))
    ).toBe(true);
  });

  it('ConfigService.get 被调用且 key 为 INTERNAL_SERVICE_SECRET', () => {
    mockConfigService.get.mockReturnValue('s3cret');
    guard.canActivate(makeContext({ [HEADER]: 's3cret' }));
    expect(mockConfigService.get).toHaveBeenCalledWith('INTERNAL_SERVICE_SECRET');
  });
});
