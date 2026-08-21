import { WechatIpGuard } from './wechat-ip.guard';
import type { ExecutionContext } from '@nestjs/common';

function buildContext(ip: string): ExecutionContext {
  const req = {
    headers: { 'x-forwarded-for': ip },
    ip,
    connection: { remoteAddress: ip },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('WechatIpGuard', () => {
  const guard = new WechatIpGuard();

  afterEach(() => {
    delete process.env.WECHAT_IP_GUARD_ENFORCE;
    delete process.env.WECHAT_IP_WHITELIST;
  });

  it('should allow whitelisted IP without logging', () => {
    expect(guard.canActivate(buildContext('103.244.8.10'))).toBe(true);
  });

  // 回归：2026-08-19 生产故障——真实微信回调 IP 不在默认白名单（仅 2 个历史
  // 网段），Guard 返回 403 吞掉回调，订单停留 PENDING，用户已扣款会员未开通。
  it('should pass non-whitelisted IP in default log-only mode', () => {
    expect(guard.canActivate(buildContext('101.226.103.10'))).toBe(true);
  });

  it('should reject non-whitelisted IP when enforce mode enabled', () => {
    process.env.WECHAT_IP_GUARD_ENFORCE = 'true';
    expect(guard.canActivate(buildContext('101.226.103.10'))).toBe(false);
  });

  it('should allow IP matching custom whitelist from env', () => {
    process.env.WECHAT_IP_GUARD_ENFORCE = 'true';
    process.env.WECHAT_IP_WHITELIST = '101.226.103.0/24';
    expect(guard.canActivate(buildContext('101.226.103.200'))).toBe(true);
    expect(guard.canActivate(buildContext('101.226.104.1'))).toBe(false);
  });
});
