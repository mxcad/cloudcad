/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////////

import { HttpException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * 端点分类与配额命中的回归测试。
 *
 * 背景：isLoginEndpoint 曾用 `path.includes()` 宽泛匹配，把 /auth/refresh
 * （高频保活）、/auth/send-*（验证码发送，已有独立限流）、/auth/bind-*（已登录
 * 绑定）全划进「登录端点」，与真正的登录爆破面共享 5 次/15 分钟配额。本机部署
 * 3 次正常登出重登即 429（2026-10-15 实跑）。分类改为精确白名单后，本文件守住
 * 边界：爆破面仍严格，保活/验证码/已登录态端点回归宽松配额。
 */
describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let multi: Record<string, jest.Mock>;
  let windowCount = 0;

  /** 配额定义表 defaultValue（运行时配置页未改时的取值） */
  const runtimeConfigDefaults: Record<string, number> = {
    rateLimitPublicWindowMs: 60000,
    rateLimitPublicMax: 100,
    rateLimitAuthMax: 300,
    rateLimitLoginMax: 30,
    rateLimitLoginWindowMs: 900000,
  };

  /** 按运行条件构造守卫（测试只关心端点分类与配额命中，不校验 DI 元数据） */
  const buildGuard = (opts: { ip?: string; nodeEnv?: string; isPublic?: boolean } = {}) =>
    new RateLimitGuard(
      { getAllAndOverride: jest.fn(() => opts.isPublic ?? false) } as any,
      { get: jest.fn(() => opts.ip ?? '10.0.0.5') } as any,
      { get: jest.fn(() => opts.nodeEnv ?? 'production') } as any,
      {
        getValue: jest.fn().mockImplementation(
          async (key: string) => runtimeConfigDefaults[key] ?? '',
        ),
      } as any,
      { multi: jest.fn(() => multi) } as any,
    );

  beforeEach(() => {
    multi = {
      zremrangebyscore: jest.fn(),
      zadd: jest.fn(),
      zcard: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn(),
    };
    // exec 返回 [zrem, zadd, zcard, expire]，zcard 位于下标 2，形如 [error, count]。
    // 用 mockImplementation 动态求值：windowCount 由各用例在调用前设置，
    // mockResolvedValue 会在 beforeEach 时即固定当时的值导致用例间串扰。
    multi.exec.mockImplementation(() =>
      Promise.resolve([null, null, [null, windowCount], null]),
    );

    guard = buildGuard();
  });

  const buildContext = (path: string, method = 'POST') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ path, method }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  describe('登录爆破面端点保持严格配额（30 次/15 分钟）', () => {
    it.each([
      ['/api/v1/auth/login'],
      ['/api/v1/auth/login-phone'],
      ['/api/v1/admin/auth/login'],
      ['/api/v1/auth/register'],
      ['/api/v1/auth/register-phone'],
      ['/api/v1/auth/forgot-password'],
      ['/api/v1/auth/reset-password'],
      ['/api/v1/auth/verify-email'],
      ['/api/v1/auth/verify-phone'],
      ['/api/v1/auth/verify-sms-code'],
      ['/api/v1/auth/wechat/login'],
      ['/api/v1/auth/wechat/callback'],
    ])('%s 超限时抛 429', async (path) => {
      windowCount = 31;
      await expect(guard.canActivate(buildContext(path))).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(multi.exec).toHaveBeenCalled();
    });

    it('未超限时放行', async () => {
      windowCount = 3;
      await expect(guard.canActivate(buildContext('/api/v1/auth/login'))).resolves.toBe(
        true,
      );
    });
  });

  describe('保活与验证码发送端点回归宽松配额（不再占登录额度）', () => {
    // 60 次：远超登录 30，但远低于已认证接口 300 / 公开接口 100
    it.each([
      ['/api/v1/auth/refresh'],
      ['/api/v1/auth/send-verification'],
      ['/api/v1/auth/resend-verification'],
      ['/api/v1/auth/send-sms-code'],
      ['/api/v1/auth/logout'],
    ])('%s 在 60 次/窗口时仍放行', async (path) => {
      windowCount = 60;
      await expect(guard.canActivate(buildContext(path))).resolves.toBe(true);
    });

    it('/auth/refresh 在 400 次/窗口时按已认证接口配额限流', async () => {
      windowCount = 400;
      await expect(
        guard.canActivate(buildContext('/api/v1/auth/refresh')),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('已登录态的绑定/解绑端点不再被误判为登录端点', () => {
    it.each([
      ['/api/v1/auth/bind-email'],
      ['/api/v1/auth/bind-phone'],
      ['/api/v1/auth/unbind-email'],
      ['/api/v1/auth/unbind-phone'],
      ['/api/v1/auth/rebind-email'],
      ['/api/v1/auth/verify-bind-email'],
      ['/api/v1/auth/wechat/poll-transaction'],
    ])('%s 在 60 次/窗口时仍放行', async (path) => {
      windowCount = 60;
      await expect(guard.canActivate(buildContext(path))).resolves.toBe(true);
    });

    it('含登录语义的绑定入口仍按爆破面限流', async () => {
      windowCount = 31;
      await expect(
        guard.canActivate(buildContext('/api/v1/auth/bind-phone-and-login')),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  it('开发环境本地 IP 豁免限流', async () => {
    guard = buildGuard({ ip: '127.0.0.1', nodeEnv: 'development' });
    windowCount = 999;
    await expect(guard.canActivate(buildContext('/api/v1/auth/login'))).resolves.toBe(
      true,
    );
    expect(multi.exec).not.toHaveBeenCalled();
  });

  it('Redis 故障时 fail-open 放行', async () => {
    multi.exec.mockRejectedValue(new Error('connection refused'));
    await expect(guard.canActivate(buildContext('/api/v1/auth/login'))).resolves.toBe(
      true,
    );
  });
});
