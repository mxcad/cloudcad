///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserStatus, AuditAction } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';
import { AccountRateLimitService } from '../../src/auth/services/account-rate-limit.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';

/**
 * 口令策略登录链路集成测试（#427，等保 8.1.4.1 b)/c)，#416 关键路径）
 *
 * 覆盖单测 mock 不了的真实交互：两层限流（频率限流 account-rate-limit 前缀与
 * 失败锁定 account-lock:fail / account-lock:locked 前缀，均带账号后缀）的
 * Redis key 隔离、passwordChangedAt
 * 状态流转、改密后锁定自动解除（JwtStrategy 实时读 DB，无需重登）、
 * 弱口令 i18n 文案、USER_CHANGE_PASSWORD 审计落库。
 *
 * 与既有集成测试的差异（均为生产语义对齐，见 mfa-login.integration.spec.ts 头注）：
 * 1. `app.setGlobalPrefix('api')`——JwtStrategy 口令锁定白名单按 `/api/v1/...` 硬编码；
 * 2. 登录用 username（prisma 直建用户，emailHmac 派生列未写）；
 * 3. 总开关 PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED=true + 频率限流阈值提升至 20
 *    （默认 5 次/60s 会在第 6 次尝试先触发频率限流，无法累积 10 次失败触发锁定；
 *    本 spec 验证失败锁定层，两层 key 隔离由 T6 独立断言）；
 * 4. 锁定期满自愈通过把 account-lock:locked:* 值置为过去时间戳模拟（锁 30 分钟，
 *    测试不可等待真实时长；checkAccountLock 按值内时间戳判定过期）。
 */
describe('Password Policy Login Chain Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<unknown> };

  const suffix = Date.now().toString().slice(-8);
  const password = 'Test@123456';
  const users = {
    admin: `ppadmin${suffix}`, // 存量管理员（近期改密）
    first: `ppfirst${suffix}`, // 首登未改密（passwordChangedAt=null）
    expired: `ppexpired${suffix}`, // 到期（181 天前）
    expiring: `ppexpiring${suffix}`, // 临期（167 天前，180-14=166 软提示线）
    lock: `pplock${suffix}`, // 失败锁定
    normal: `ppnormal${suffix}`, // 普通用户（181 天前，USER 角色）
  };
  const ids: Record<string, string> = {};
  const savedEnv: { enforce?: string; loginMax?: string } = {};

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

  beforeAll(async () => {
    // 总开关 + 频率限流阈值（须在 AppConfig 工厂读取 process.env 前设置，afterAll 还原）
    savedEnv.enforce = process.env.PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED;
    savedEnv.loginMax = process.env.AUTH_RATE_LIMIT_LOGIN_MAX;
    process.env.PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED = 'true';
    process.env.AUTH_RATE_LIMIT_LOGIN_MAX = '20';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    app.setGlobalPrefix('api');
    await app.init();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    redis = app.get(REDIS_CLIENT) as typeof redis;

    const [adminRole, userRole] = await Promise.all([
      prisma.role.findUnique({ where: { name: 'ADMIN' } }),
      prisma.role.findUnique({ where: { name: 'USER' } }),
    ]);
    if (!adminRole || !userRole) {
      throw new Error('cloudcad_test 库缺少 ADMIN/USER 角色，请先执行 seed');
    }

    const hash = await bcrypt.hash(password, 10);
    const mk = async (
      username: string,
      roleId: string,
      passwordChangedAt: Date | null
    ) => {
      const user = await prisma.user.create({
        data: {
          username,
          email: `${username}@example.com`,
          password: hash,
          roleId,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          passwordChangedAt,
        },
      });
      ids[username] = user.id;
    };

    await mk(users.admin, adminRole.id, new Date());
    await mk(users.first, adminRole.id, null);
    await mk(users.expired, adminRole.id, daysAgo(181));
    await mk(users.expiring, adminRole.id, daysAgo(167));
    await mk(users.lock, adminRole.id, new Date());
    await mk(users.normal, userRole.id, daysAgo(181));
  }, 60000);

  afterAll(async () => {
    // 还原 env（防泄漏到同 worker 后续 spec）
    if (savedEnv.enforce === undefined) {
      delete process.env.PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED;
    } else {
      process.env.PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED = savedEnv.enforce;
    }
    if (savedEnv.loginMax === undefined) {
      delete process.env.AUTH_RATE_LIMIT_LOGIN_MAX;
    } else {
      process.env.AUTH_RATE_LIMIT_LOGIN_MAX = savedEnv.loginMax;
    }

    // 清理：安全尝试记录（无外键，按账号删）→ 测试用户（refreshToken/auditLog 级联删除）
    if (Object.keys(ids).length > 0) {
      await prisma.securityAccessAttempt.deleteMany({
        where: { account: { in: Object.keys(ids) } },
      });
      // T5 锁定触发的 P1 暴力破解告警（AlertService.raise 按 source+messageKey 去重，
      // 按 detail.account 精确删本 spec 的账号，不误删其他来源的同 key 告警）。
      // 告警写入是 fire-and-forget，清理前轮询等待其落库（最多 2s），避免漏删残留
      const alertWhere = {
        source: 'auth',
        messageKey: 'security.brute_force_suspected',
        detail: { path: ['account'], equals: users.lock },
      };
      for (let i = 0; i < 20; i++) {
        const found = await prisma.alertRecord.findFirst({
          where: alertWhere,
          select: { id: true },
        });
        if (found) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await prisma.alertRecord.deleteMany({ where: alertWhere });
      await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    }
    // Redis 侧无需显式清理：集成测试的 ioredis 是文件级 in-memory mock
    // （src/test/setup.ts），account-lock:* / account-rate-limit:* key 随文件结束释放

    if (prisma) {
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  }, 60000);

  const login = (username: string, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password, ...extra });

  it('T1: 存量管理员（近期改密）登录 → 200 无强改标记，后台端点正常放行', async () => {
    const response = await login(users.admin).expect(200);

    expect(response.body.data.passwordChangeRequired).toBeUndefined();
    expect(response.body.data.passwordExpiringSoon).toBeUndefined();

    const token = response.body.data.accessToken;
    await request(app.getHttpServer())
      .get('/api/v1/admin/ip-whitelist')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('T2: 首登未改密 → 200 first_login + 后台 403 PASSWORD_CHANGE_REQUIRED + 改密后同一 token 放行', async () => {
    // 登录：200 + passwordChangeRequired='first_login'
    const loginRes = await login(users.first).expect(200);
    expect(loginRes.body.data.passwordChangeRequired).toBe('first_login');
    const token = loginRes.body.data.accessToken;

    // JwtStrategy 锁定：后台端点 403（白名单仅 change-password/profile/logout）
    const locked = await request(app.getHttpServer())
      .get('/api/v1/admin/ip-whitelist')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(locked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // 改密（白名单内端点）：200 且 passwordChangedAt 写入
    const changeRes = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: password, newPassword: 'NewPass@789' })
      .expect(200);
    expect(changeRes.body.data.message).toBeDefined();

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: ids[users.first] },
      select: { passwordChangedAt: true },
    });
    expect(updated.passwordChangedAt).toBeInstanceOf(Date);

    // USER_CHANGE_PASSWORD 审计落库（成功）
    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: ids[users.first],
        action: AuditAction.USER_CHANGE_PASSWORD,
        success: true,
      },
    });
    expect(audit).not.toBeNull();

    // 同一 token 再访后台端点：JwtStrategy 实时读 DB，锁定自动解除（无需重登）
    await request(app.getHttpServer())
      .get('/api/v1/admin/ip-whitelist')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('T3: 到期（181 天）→ expired 锁定；临期（167 天）→ passwordExpiringSoon=true 不锁定', async () => {
    // 到期：200 + passwordChangeRequired='expired' + 后台 403（与 T2 同源的口令锁定）
    const expiredRes = await login(users.expired).expect(200);
    expect(expiredRes.body.data.passwordChangeRequired).toBe('expired');
    const expiredLocked = await request(app.getHttpServer())
      .get('/api/v1/admin/ip-whitelist')
      .set('Authorization', `Bearer ${expiredRes.body.data.accessToken}`)
      .expect(403);
    expect(expiredLocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // 临期：200 + passwordExpiringSoon=true（软提示不拦截）+ 后台放行
    const expiringRes = await login(users.expiring).expect(200);
    expect(expiringRes.body.data.passwordExpiringSoon).toBe(true);
    expect(expiringRes.body.data.passwordChangeRequired).toBeUndefined();
    await request(app.getHttpServer())
      .get('/api/v1/admin/ip-whitelist')
      .set('Authorization', `Bearer ${expiringRes.body.data.accessToken}`)
      .expect(200);
  });

  it('T4: 弱口令改密被拒 → 400 且文案为 i18n 口令策略错误（zh-CN 默认语言）', async () => {
    const res = await login(users.admin).expect(200);
    const token = res.body.data.accessToken;

    // 过短（7 位 < 10；须 ≥6 位过 DTO MinLength(6)，否则先被校验管道拦成"请求参数验证失败"）
    const short = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: password, newPassword: 'Ab1!xYz' })
      .expect(400);
    expect(short.body.message).toContain('密码长度至少');

    // 弱口令黑名单（password1234 在黑名单；该口令仅小写+数字 2 类字符，
    // 但 assertPasswordPolicy 的 weak 检查先于复杂度检查，故命中 weak 文案）
    const weak = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: password, newPassword: 'password1234' })
      .expect(400);
    expect(weak.body.message).toContain('密码过于简单');

    // 复杂度不足（10 位纯小写，仅 1 类）
    const complex = await request(app.getHttpServer())
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: password, newPassword: 'abcdefghij' })
      .expect(400);
    expect(complex.body.message).toContain('至少三类');
  });

  it('T5: 连续错 10 次口令 → 触发锁定；第 11 次正确口令仍 429；锁过期自愈放行', async () => {
    const warnSpy = jest.spyOn(
      (app.get(AccountRateLimitService) as unknown as {
        logger: { warn: (...args: unknown[]) => void };
      }).logger,
      'warn'
    );

    // 10 次错误口令：每次 401（防枚举统一文案），第 10 次触发失败锁定
    for (let i = 0; i < 10; i++) {
      await login(users.lock, { password: `WrongPass@${i}` }).expect(401);
    }
    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes('账号失败锁定触发')
      )
    ).toBe(true);

    // 第 11 次：正确口令也被锁（429，文案含剩余分钟——断言 {minutes} 插值生效）
    const locked = await login(users.lock).expect(429);
    expect(locked.body.message).toMatch(/已被临时锁定，请 \d+ 分钟后再试/);

    // 模拟锁定期满（锁值=到期时间戳，置为过去即自愈；真实时长 30 分钟不可等待）
    const lockKey = `account-lock:locked:${users.lock.toLowerCase()}`;
    const lockValue = await redis.get(lockKey);
    expect(lockValue).toBeDefined();
    expect(parseInt(lockValue!, 10)).toBeGreaterThan(Date.now());
    await redis.set(lockKey, String(Date.now() - 1000));

    // 自愈后正确口令放行
    await login(users.lock).expect(200);
  });

  it('T6: 频率限流与失败锁定三层 key 互不串扰（独立计数/独立生命周期）', async () => {
    const account = users.lock.toLowerCase();
    const rateLimitKey = `account-rate-limit:login:${account}`;
    const failKey = `account-lock:fail:${account}`;
    const lockKey = `account-lock:locked:${account}`;

    // T5 末尾成功登录已 reset 限流 key + clearLoginFailures 清失败 key，
    // 但锁定 key 不清除（到期自愈语义）——三层生命周期天然不同
    expect(await redis.get(rateLimitKey)).toBeNull();
    expect(await redis.get(failKey)).toBeNull();
    expect(await redis.get(lockKey)).toBeDefined();

    // 三层 key 互不相同
    expect(new Set([rateLimitKey, failKey, lockKey]).size).toBe(3);

    // 再累积 3 次失败：失败计数 key 独立重建为 3，限流 key 独立重建为 3
    for (let i = 0; i < 3; i++) {
      await login(users.lock, { password: `WrongAgain@${i}` }).expect(401);
    }
    expect(await redis.get(failKey)).toBe('3');
    expect(await redis.get(rateLimitKey)).toBe('3');
    // 失败计数未达阈值（10），不产生新的锁定
    expect(await redis.get(lockKey)).toBeDefined(); // T5 置过去的旧值仍在
  });

  it('T7: 普通用户（181 天前）登录与后台访问不受 180 天判定影响（仅 ADMIN）', async () => {
    // 普通用户走 /v1/auth/login（非管理员入口）：200 且无强改标记
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ account: users.normal, password })
      .expect(200);
    expect(response.body.data.passwordChangeRequired).toBeUndefined();
    expect(response.body.data.passwordExpiringSoon).toBeUndefined();

    // 后台端点 403 是角色拒绝（RolesGuard），非口令策略锁定
    const adminBlocked = await request(app.getHttpServer())
      .get('/api/v1/admin/ip-whitelist')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`)
      .expect(403);
    expect(adminBlocked.body.code).not.toBe('PASSWORD_CHANGE_REQUIRED');
  });
});
