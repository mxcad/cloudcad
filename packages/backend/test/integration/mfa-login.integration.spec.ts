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
import { RuntimeConfigService } from '../../src/runtime-config/runtime-config.service';
import { currentTotpCode } from '../../src/auth/services/totp';

/**
 * MFA（TOTP 双因素）管理员登录链路集成测试（#425，等保 8.1.4.1(d)）
 *
 * 覆盖单测 mock 不了的真实交互：IP 白名单 fail-close（环回恒放行）、
 * runtime config 总闸（mfaEnforceEnabled）、JwtStrategy 未绑定锁定、
 * 限流计数、MFA_BIND/ADMIN_LOGIN 审计与 security_access_attempts 落库。
 *
 * 与既有集成测试的差异（均为生产语义对齐）：
 * 1. 本 spec 额外 `app.setGlobalPrefix('api')`——main.ts 生产前缀为 `api`，
 *    而 JwtStrategy 的 MFA 锁定路径白名单按 `/api/v1/...` 书写；不设前缀时
 *    锁定会误拦 setup/bind 路径，语义与生产不一致；
 * 2. 登录用 username（测试用户经 prisma 直建，emailHmac 派生列未写，
 *    邮箱登录走 HMAC 索引查不到；username 精确匹配分支不受影响）；
 * 3. supertest 走环回地址（127.0.0.1），管理员 IP 白名单恒放行。
 */
describe('MFA Login Chain Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let runtimeConfig: RuntimeConfigService;

  const username = `mfatest${Date.now().toString().slice(-8)}`;
  const email = `mfa-${Date.now()}@example.com`;
  const password = 'MfaTest@123456';
  let userId: string;
  let originalMfaEnforce: boolean;
  let setupToken: string;
  let totpSecret: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    // 生产前缀对齐（main.ts setGlobalPrefix('api')），见文件头说明 1
    app.setGlobalPrefix('api');
    await app.init();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    runtimeConfig = app.get(RuntimeConfigService);

    // ADMIN 角色（seed 已建；缺失时兜底创建，保证测试自包含）
    let adminRole = await prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: { name: 'ADMIN', category: 'SYSTEM', isSystem: true },
      });
    }

    // 测试管理员：ACTIVE + 近期改过密（避免 #416 强制改密标记干扰 MFA 断言）
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: await bcrypt.hash(password, 10),
        roleId: adminRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        passwordChangedAt: new Date(),
      },
    });
    userId = user.id;

    // 记录总闸原值（清理时恢复）并开启
    originalMfaEnforce = await runtimeConfig.getValue<boolean>(
      'mfaEnforceEnabled',
      false
    );
    await runtimeConfig.set('mfaEnforceEnabled', true);
  }, 60000);

  afterAll(async () => {
    // 恢复总闸原值（beforeAll 在记录原值前失败时跳过，避免以 undefined 写配置）
    if (typeof originalMfaEnforce === 'boolean') {
      await runtimeConfig.set('mfaEnforceEnabled', originalMfaEnforce);
    }

    // 清理：安全尝试记录（无外键，按账号删）→ 测试用户（refreshToken/auditLog 级联删除）
    if (userId) {
      await prisma.securityAccessAttempt.deleteMany({ where: { account: username } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    if (prisma) {
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  }, 60000);

  it('T1: 未绑定管理员登录 → 200 + mfaSetupRequired=true，ADMIN_LOGIN 审计 loginMethod=admin_password_mfa_pending', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password })
      .expect(200);

    expect(response.body.data.mfaSetupRequired).toBe(true);
    expect(response.body.data.accessToken).toBeDefined();
    setupToken = response.body.data.accessToken;

    const audits = await prisma.auditLog.findMany({
      where: { userId, action: AuditAction.ADMIN_LOGIN },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.length).toBe(1);
    expect(audits[0].success).toBe(true);
    expect((audits[0].params as { loginMethod?: string }).loginMethod).toBe(
      'admin_password_mfa_pending'
    );
  });

  it('T2: setup → 200 返回 base32 secret 与 otpauth 链接（密文落库，明文不落）', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/mfa/setup')
      .set('Authorization', `Bearer ${setupToken}`)
      .expect(200);

    const { secret, otpauthUrl } = response.body.data as {
      secret: string;
      otpauthUrl: string;
    };
    // base32（RFC 4648 无填充）：A-Z2-7，160bit → 32 字符
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain(`secret=${secret}`);

    // 落库为 enc:v1 密文，非明文
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });
    expect(user.totpSecret).toMatch(/^enc:v1:/);
    expect(user.totpSecret).not.toContain(secret);
    expect(user.totpEnabled).toBe(false);

    totpSecret = secret;
  });

  it('T3: bind（当前时刻有效码）→ totpEnabled=true + MFA_BIND 审计落库', async () => {
    const code = currentTotpCode(totpSecret);
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/mfa/bind')
      .set('Authorization', `Bearer ${setupToken}`)
      .send({ code })
      .expect(200);

    expect(response.body.data.mfaSetupRequired).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabled: true },
    });
    expect(user.totpEnabled).toBe(true);

    const bindAudit = await prisma.auditLog.findFirst({
      where: { userId, action: AuditAction.MFA_BIND },
    });
    expect(bindAudit).not.toBeNull();
    expect(bindAudit!.success).toBe(true);
  });

  it('T4: 已绑定登录缺码 → 401 code=MFA_REQUIRED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password })
      .expect(401);

    expect(response.body.code).toBe('MFA_REQUIRED');
    expect(response.body.data).toBeUndefined();
  });

  it('T5: 已绑定登录错码 → 401 code=MFA_CODE_INVALID + security_access_attempts.reason=mfa_code_invalid', async () => {
    // 构造与 ±1 时间窗三码均不符的码：从当前码 +1 起递增，碰撞窗口码则继续 +1
    // （窗口码最多 3 个，循环至多 3 次必然终止，无碰撞概率）
    const epoch = Math.floor(Date.now() / 1000);
    const windowCodes = [epoch - 30, epoch, epoch + 30].map((e) =>
      currentTotpCode(totpSecret, { epoch: e })
    );
    let wrongCode = String((parseInt(currentTotpCode(totpSecret), 10) + 1) % 1000000).padStart(6, '0');
    while (windowCodes.includes(wrongCode)) {
      wrongCode = String((parseInt(wrongCode, 10) + 1) % 1000000).padStart(6, '0');
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password, totpCode: wrongCode })
      .expect(401);

    expect(response.body.code).toBe('MFA_CODE_INVALID');

    const attempt = await prisma.securityAccessAttempt.findFirst({
      where: { account: username, reason: 'mfa_code_invalid' },
    });
    expect(attempt).not.toBeNull();
    expect(attempt!.endpoint).toBe('/api/v1/admin/auth/login');

    // 失败审计（ADMIN_LOGIN success=false，reason=mfa_code_invalid）：
    // T4 缺码与 T5 错码各写一条 success=false 审计，须按 reason 精确取本用例行
    const failAudits = await prisma.auditLog.findMany({
      where: { userId, action: AuditAction.ADMIN_LOGIN, success: false },
    });
    const invalidAudit = failAudits.find(
      (a) => (a.params as { reason?: string })?.reason === 'mfa_code_invalid'
    );
    expect(invalidAudit).toBeDefined();
  });

  it('T6: 已绑定登录正确码 → 200 签发 token + ADMIN_LOGIN 审计 loginMethod=admin_password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password, totpCode: currentTotpCode(totpSecret) })
      .expect(200);

    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.mfaSetupRequired).toBeUndefined();

    // T1（未绑定）与 T6（带码）各写一条 success=true 审计，按 loginMethod 精确取本用例行
    const successAudits = await prisma.auditLog.findMany({
      where: { userId, action: AuditAction.ADMIN_LOGIN, success: true },
    });
    const passwordAudit = successAudits.find(
      (a) => (a.params as { loginMethod?: string })?.loginMethod === 'admin_password'
    );
    expect(passwordAudit).toBeDefined();
  });

  it('T7: 总闸关闭（mfaEnforceEnabled=false）→ 已绑定管理员无需动态码即登录成功', async () => {
    await runtimeConfig.set('mfaEnforceEnabled', false);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password })
      .expect(200);

    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.mfaSetupRequired).toBeUndefined();

    // 总闸关闭 = totpCode 被完全忽略：即使传入错误码也 200（后端仅在闸开分支读码）
    const ignored = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ account: username, password, totpCode: '000000' })
      .expect(200);
    expect(ignored.body.data.accessToken).toBeDefined();
  });
});
