///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

// 微信登录集成测试（issue #285）
// 运行前提：真实 PG + Redis（`pnpm test:db:up` 或 `node scripts/test-db.mjs run`，
// 本地无 Docker daemon 时无法执行，仅能 `pnpm jest --listTests` 确认收集）。
//
// 微信网关注入点：WechatService 由工厂 `createDefaultAuthProviders()` 以类 token 注册，
// 测试通过 `Test.createTestingModule().overrideProvider(WechatService)` 替换为内存 mock
// （code → openid 映射 + 用户资料表），流程编排（OssAuthProvider.loginByWechat →
// UserRepository → AuthTokenService 令牌签发 → Redis 事务）全部走真实模块。

import type { INestApplication } from '@nestjs/common';
import { InternalServerErrorException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { PrismaClient, UserStatus } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import type Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';
import { WechatService } from '../../src/auth/impl/services/wechat.service';

const RUN = Date.now();
const WECHAT_CALLBACK_URL =
  'http://localhost:3000/api/v1/auth/wechat/callback';
/** 非 qlogo.cn 域名头像 → syncWechatAvatar 立即降级跳过，保证离线安全 */
const DEFAULT_AVATAR = 'https://example.com/avatar.png';
/** 模拟微信返回无 openid 的 token 响应 */
const CODE_NO_OPENID = 'code-no-openid';

// ==================== 微信网关 mock（工厂注入点） ====================

interface GatewayUserInfo {
  openid?: string;
  nickname: string;
  headimgurl: string;
}

const wechatGateway = {
  /** code → openid（模拟微信 code 一次性换取 openid） */
  codes: new Map<string, string>(),
  /** openid → 微信用户资料 */
  users: new Map<string, GatewayUserInfo>(),
  // 断言用 spy：resetMocks 会清空实现，由 beforeEach 重新挂载
  validateState: jest.fn(),
  getAccessToken: jest.fn(),
  getUserInfo: jest.fn(),
  generateState: jest.fn(),
  getAuthUrl: jest.fn(),
  getMobileAuthUrl: jest.fn(),
  refreshAccessToken: jest.fn(),
  callbackUrlValue: WECHAT_CALLBACK_URL,
};

function registerWechatUser(
  code: string,
  openid: string,
  nickname: string
): void {
  wechatGateway.codes.set(code, openid);
  wechatGateway.users.set(openid, {
    openid,
    nickname,
    headimgurl: DEFAULT_AVATAR,
  });
}

/** 构造合法 state（base64(JSON)，含 64 位 csrf），与真实前端一致 */
function makeState(origin = 'http://localhost:3000'): string {
  return Buffer.from(
    JSON.stringify({
      csrf: 'c'.repeat(64),
      origin,
      isPopup: false,
      purpose: 'login',
      client: 'web',
    })
  ).toString('base64');
}

describe('WeChat Login Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: Redis;

  const testUserIds: string[] = [];
  const testWechatIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WechatService)
      .useValue(wechatGateway as unknown as WechatService)
      .compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    await app.init();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    // 应用内 Redis 与测试共享同一 in-memory store（setup.ts 的 ioredis mock）
    redis = moduleFixture.get(getRedisConnectionToken());

    // 运行时配置落库（wechatEnabled 等默认关闭，测试需要打开）
    await seedRuntimeConfig();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await restoreRuntimeConfig();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  beforeEach(() => {
    // resetMocks 会清空 jest.fn 的实现与调用记录，每个用例重新挂载网关行为
    wechatGateway.validateState.mockImplementation(
      (state: string) => typeof state === 'string' && state.length > 0
    );
    wechatGateway.getAccessToken.mockImplementation(async (code: string) => {
      // 微信授权服务拒绝无效 code（与真实 requestAccessToken 抛错一致）
      if (code === CODE_NO_OPENID) {
        return {
          access_token: 'at-no-openid',
          expires_in: 7200,
          refresh_token: 'rt-no-openid',
          scope: 'snsapi_login',
        };
      }
      const openid = wechatGateway.codes.get(code);
      if (!openid) {
        throw new InternalServerErrorException(
          `微信授权失败: invalid code ${code}`
        );
      }
      return {
        access_token: `at_${code}`,
        expires_in: 7200,
        refresh_token: `rt_${code}`,
        scope: 'snsapi_login',
        openid,
      };
    });
    wechatGateway.getUserInfo.mockImplementation(
      async (_accessToken: string, openid: string): Promise<GatewayUserInfo> => {
        // openid 缺失：返回无 openid 的用户资料，交由真实编排处理
        if (!openid) return { nickname: 'NoOpenidUser', headimgurl: DEFAULT_AVATAR };
        const cached = wechatGateway.users.get(openid);
        return (
          cached ?? {
            openid,
            nickname: `微信用户${openid.slice(-4)}`,
            headimgurl: DEFAULT_AVATAR,
          }
        );
      }
    );
    wechatGateway.generateState.mockImplementation(() => 'a'.repeat(64));
    wechatGateway.getAuthUrl.mockImplementation(
      (state: string, redirectUri?: string) =>
        `https://open.weixin.qq.com/connect/qrconnect?appid=wx_test&redirect_uri=${encodeURIComponent(
          redirectUri ?? WECHAT_CALLBACK_URL
        )}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
    );
    wechatGateway.getMobileAuthUrl.mockImplementation(
      (state: string, redirectUri?: string) =>
        `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx_test&redirect_uri=${encodeURIComponent(
          redirectUri ?? WECHAT_CALLBACK_URL
        )}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`
    );
    wechatGateway.refreshAccessToken.mockImplementation(async () => ({
      access_token: 'at-refreshed',
      expires_in: 7200,
      refresh_token: 'rt-refreshed',
      openid: 'o_refreshed',
      scope: 'snsapi_login',
    }));
  });

  // ==================== 工具函数 ====================

  /** 走真实回调路由完成一次微信登录，返回 hash 携带的 token */
  async function wechatLogin(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const res = await request(app.getHttpServer())
      .get('/auth/wechat/callback')
      .query({ code, state: makeState('http://localhost:3000') })
      .expect(302);
    const result = parseWechatHash(res.headers.location as string);
    expect(result.action).toBe('login');
    expect(result.accessToken).toBeTruthy();
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  function parseWechatHash(location: string): Record<string, any> {
    const marker = '#wechat_result=';
    const idx = location.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    return JSON.parse(decodeURIComponent(location.slice(idx + marker.length)));
  }

  async function getProfile(accessToken: string) {
    return request(app.getHttpServer())
      .get('/v1/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  }

  function trackUser(userId: string, openid?: string): void {
    if (!testUserIds.includes(userId)) testUserIds.push(userId);
    if (openid && !testWechatIds.includes(openid)) testWechatIds.push(openid);
  }

  async function createWechatTransaction(): Promise<{
    authUrl: string;
    state: string;
    transactionId: string;
  }> {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/wechat/login')
      .query({
        origin: 'http://localhost:3000',
        isPopup: 'false',
        client: 'web',
        purpose: 'login',
        txn: '',
      })
      .expect(200);
    const { authUrl, state, transactionId } = res.body.data;
    expect(transactionId).toBeTruthy();
    return { authUrl, state, transactionId };
  }

  async function seedRuntimeConfig(): Promise<void> {
    const defs: Array<[string, string | number | boolean]> = [
      ['wechatEnabled', true],
      ['wechatAutoRegister', true],
      ['mailEnabled', true],
      ['allowRegister', true],
      ['requireEmailVerification', false],
      ['requirePhoneVerification', false],
    ];
    for (const [key, value] of defs) {
      await prisma.runtimeConfig.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: {
          key,
          value: JSON.stringify(value),
          type: 'boolean',
          category: 'test',
          description: `integration test seed: ${key}`,
          isPublic: false,
        },
      });
    }
  }

  async function restoreRuntimeConfig(): Promise<void> {
    const defaults: Array<[string, string | number | boolean]> = [
      ['wechatEnabled', false],
      ['wechatAutoRegister', false],
      ['mailEnabled', false],
      ['allowRegister', true],
      ['requireEmailVerification', false],
      ['requirePhoneVerification', false],
    ];
    for (const [key, value] of defaults) {
      await prisma.runtimeConfig.updateMany({
        where: { key },
        data: { value: JSON.stringify(value) },
      });
    }
  }

  async function cleanupTestData(): Promise<void> {
    if (testUserIds.length > 0 || testWechatIds.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: {
          user: {
            OR: [
              { id: { in: testUserIds } },
              { wechatId: { in: testWechatIds } },
            ],
          },
        },
      });
      await prisma.fileSystemNode.deleteMany({
        where: { ownerId: { in: testUserIds } },
      });
      await prisma.user.deleteMany({
        where: {
          OR: [
            { id: { in: testUserIds } },
            { wechatId: { in: testWechatIds } },
          ],
        },
      });
    }
    testUserIds.length = 0;
    testWechatIds.length = 0;
  }

  // ==================== T1: 授权回调 → 自动注册/登录 ====================

  describe('T1: 授权回调（code 换取 openid）→ 自动注册/登录', () => {
    it('T1-S1: 首次微信授权自动注册并登录成功', async () => {
      const code = 'code_t1_auto_register';
      const openid = `o_${RUN}_t1`;
      registerWechatUser(code, openid, 'T1 微信用户');

      const res = await request(app.getHttpServer())
        .get('/auth/wechat/callback')
        .query({ code, state: makeState('http://localhost:3000') })
        .expect(302);

      // 重定向回前端，hash 携带登录结果（action=login + 双 token）
      const location = res.headers.location as string;
      expect(location.startsWith('http://localhost:3000/login#wechat_result=')).toBe(true);
      const result = parseWechatHash(location);
      expect(result.action).toBe('login');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.purpose).toBe('login');

      // 网关被真实编排调用：code → access_token → openid
      expect(wechatGateway.getAccessToken).toHaveBeenCalledWith(code);
      expect(wechatGateway.getUserInfo).toHaveBeenCalledWith(
        `at_${code}`,
        openid
      );

      // 自动注册用户落库（username 生成规则 wechat_<openid前8位>）
      const user = await prisma.user.findUnique({ where: { wechatId: openid } });
      expect(user).not.toBeNull();
      expect(user!.provider).toBe('WECHAT');
      expect(user!.status).toBe(UserStatus.ACTIVE);
      expect(user!.username).toBe(`wechat_${openid.slice(0, 8)}`);
      expect(user!.nickname).toBe('T1 微信用户');

      // 签发 token 真实可用
      const profile = await getProfile(result.accessToken);
      expect(profile.body.data.id).toBe(user!.id);

      trackUser(user!.id, openid);
    });
  });

  // ==================== T2: 已存在用户 → 直接登录 ====================

  describe('T2: 已存在用户（同 openid）→ 直接登录', () => {
    it('T2-S1: 已存在 openid 直接登录同一账号，不重复注册', async () => {
      const code = 'code_t2_existing';
      const openid = `o_${RUN}_t2`;
      registerWechatUser(code, openid, 'T2 老用户');

      const first = await wechatLogin(code);
      const firstUserId = (await getProfile(first.accessToken)).body.data.id;

      const second = await wechatLogin(code);
      const secondUserId = (await getProfile(second.accessToken)).body.data.id;

      expect(secondUserId).toBe(firstUserId);
      expect(second.accessToken).not.toBe(first.accessToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      // 同 openid 只存在一个账号
      const count = await prisma.user.count({ where: { wechatId: openid } });
      expect(count).toBe(1);

      // 登录同步微信资料：昵称/头像刷新
      wechatGateway.users.set(openid, {
        openid,
        nickname: 'T2 新昵称',
        headimgurl: DEFAULT_AVATAR,
      });
      const third = await wechatLogin(code);
      const profile = await getProfile(third.accessToken);
      expect(profile.body.data.id).toBe(firstUserId);
      expect(profile.body.data.nickname).toBe('T2 新昵称');

      trackUser(firstUserId, openid);
    });
  });

  // ==================== T3: 邮箱绑定后登录态统一 ====================

  describe('T3: 邮箱绑定后微信与邮箱登录态统一', () => {
    it('T3-S1: 邮箱注册用户绑定微信后，微信登录进入同一账号', async () => {
      const email = `wechat-${RUN}-t3a@example.com`;
      const username = `wechatt3a${RUN.toString().slice(-6)}`;
      const password = 'Wechat@123456';
      const code = 'code_t3_bind_a';
      const openid = `o_${RUN}_t3a`;
      registerWechatUser(code, openid, 'T3A 微信用户');

      // 1. 邮箱注册
      const reg = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email,
          username,
          password,
          nickname: 'T3A 邮箱用户',
        })
        .expect(201);
      const userId = reg.body.data.user.id;
      const regToken = reg.body.data.accessToken;

      // 2. 邮箱账号绑定微信（真实 bindWechat 编排）
      const bind = await request(app.getHttpServer())
        .post('/v1/auth/wechat/bind')
        .set('Authorization', `Bearer ${regToken}`)
        .send({ code, state: makeState('http://localhost:3000') })
        .expect(200);
      expect(bind.body.data.success).toBe(true);

      // 3. 微信登录 → 同一账号
      const wx = await wechatLogin(code);
      expect((await getProfile(wx.accessToken)).body.data.id).toBe(userId);

      // 4. 邮箱密码登录 → 同一账号（微信与邮箱登录态统一）
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ account: email, password })
        .expect(200);
      expect(login.body.data.user.id).toBe(userId);

      trackUser(userId, openid);
    });

    it('T3-S2: 微信自动注册用户绑定邮箱后，邮箱登录进入同一账号', async () => {
      const email = `wechat-${RUN}-t3b@example.com`;
      const password = 'WechatBind@123456';
      const code = 'code_t3_bind_b';
      const openid = `o_${RUN}_t3b`;
      registerWechatUser(code, openid, 'T3B 微信用户');

      // 1. 微信自动注册并登录
      const wx = await wechatLogin(code);
      const userId = (await getProfile(wx.accessToken)).body.data.id;

      // 2. 绑定邮箱：发送验证码 → 从真实 EmailVerificationService 的内存 Redis 取码 → 验证绑定
      await request(app.getHttpServer())
        .post('/v1/auth/bind-email')
        .set('Authorization', `Bearer ${wx.accessToken}`)
        .send({ email })
        .expect(200);
      const storedCode = await redis.get(`email_verification:code:${email}`);
      expect(storedCode).toBeTruthy();
      await request(app.getHttpServer())
        .post('/v1/auth/verify-bind-email')
        .set('Authorization', `Bearer ${wx.accessToken}`)
        .send({ email, code: storedCode })
        .expect(200);

      // 3. 微信自动注册用户无密码，补设密码后验证邮箱登录路径
      const hashed = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashed },
      });

      // 4. 邮箱密码登录 → 同一账号（微信与邮箱登录态统一）
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ account: email, password })
        .expect(200);
      expect(login.body.data.user.id).toBe(userId);

      // 5. 微信登录依然进入同一账号
      const wx2 = await wechatLogin(code);
      expect((await getProfile(wx2.accessToken)).body.data.id).toBe(userId);

      trackUser(userId, openid);
    });

    it('T3-S3: 绑定微信时 token 响应缺 openid → 400 拒绝，不落库', async () => {
      const email = `wechat-${RUN}-t3c@example.com`;
      const username = `wechatt3c${RUN.toString().slice(-6)}`;
      const password = 'Wechat@123456';

      // 1. 邮箱注册
      const reg = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email,
          username,
          password,
          nickname: 'T3C 邮箱用户',
        })
        .expect(201);
      const userId = reg.body.data.user.id;
      const regToken = reg.body.data.accessToken;

      // 2. 用 CODE_NO_OPENID 绑定 → 400（显式拒绝，而非 Prisma 校验 500）
      const bind = await request(app.getHttpServer())
        .post('/v1/auth/wechat/bind')
        .set('Authorization', `Bearer ${regToken}`)
        .send({ code: CODE_NO_OPENID, state: makeState('http://localhost:3000') })
        .expect(400);
      expect(bind.body.code).toBe('BAD_REQUEST');
      expect(bind.body.message).toContain('缺少 openid');

      // 3. 绑定失败不落库：用户 wechatId 保持为空
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.wechatId).toBeNull();
      expect(user!.provider).not.toBe('WECHAT');

      // 4. 同一用户随后可用合法 code 正常绑定（失败路径无副作用）
      const okCode = 'code_t3_bind_ok';
      const okOpenid = `o_${RUN}_t3c`;
      registerWechatUser(okCode, okOpenid, 'T3C 微信用户');
      const bindOk = await request(app.getHttpServer())
        .post('/v1/auth/wechat/bind')
        .set('Authorization', `Bearer ${regToken}`)
        .send({ code: okCode, state: makeState('http://localhost:3000') })
        .expect(200);
      expect(bindOk.body.data.success).toBe(true);
      expect((await getProfile(regToken)).body.data.id).toBe(userId);

      trackUser(userId, okOpenid);
    });
  });

  // ==================== T4: 双实例/多端会话 ====================

  describe('T4: 双实例/多端会话（AuthContext.wechatDualInstance 场景的后端支撑）', () => {
    it('T4-S1: 事务轮询双实例：实例 A 轮询 → 实例 B 回调完成 → A 拿到登录态', async () => {
      const code = 'code_t4_txn';
      const openid = `o_${RUN}_t4txn`;
      registerWechatUser(code, openid, 'T4 事务用户');

      // 实例 A（桌面 EXE / 手机浏览器）：获取授权 URL，创建真实 Redis 事务
      const { authUrl, state, transactionId } = await createWechatTransaction();
      expect(authUrl).toContain('state=');
      expect(authUrl).toContain('appid=wx_test');

      // 实例 B（微信回调）：完成登录并写入事务结果，同时种下 httpOnly cookie
      const cb = await request(app.getHttpServer())
        .get('/auth/wechat/callback')
        .query({ code, state, txn: transactionId })
        .expect(302);
      expect(cb.headers.location).toContain(`wechat_txn=${transactionId}`);
      const setCookie = (cb.headers['set-cookie'] ?? []) as string[];
      expect(setCookie.some((c) => c.startsWith('auth_token='))).toBe(true);

      // 实例 A：轮询拿到 completed 登录态
      const poll = await request(app.getHttpServer())
        .get('/v1/auth/wechat/poll-transaction')
        .query({ txn: transactionId })
        .expect(200);
      expect(poll.body.data.status).toBe('completed');
      expect(poll.body.data.action).toBe('login');
      expect(poll.body.data.accessToken).toBeTruthy();
      expect(poll.body.data.refreshToken).toBeTruthy();
      expect(poll.body.data.user).toBeTruthy();

      // 轮询拿到的 token 真实可用
      const profile = await getProfile(poll.body.data.accessToken);
      expect(profile.body.data.id).toBe(poll.body.data.user.id);

      // 事务一次性：完成即删除，再次轮询返回 expired
      const pollAgain = await request(app.getHttpServer())
        .get('/v1/auth/wechat/poll-transaction')
        .query({ txn: transactionId })
        .expect(200);
      expect(pollAgain.body.data.status).toBe('expired');

      trackUser(poll.body.data.user.id, openid);
    });

    it('T4-S2: 多端会话：双会话 refresh token 相互独立、互不失效', async () => {
      const openid = `o_${RUN}_t4multi`;
      registerWechatUser('code_t4_m1', openid, 'T4 多端用户');
      registerWechatUser('code_t4_m2', openid, 'T4 多端用户');

      // 两台设备（两个实例）各自完成登录，各持一对 token
      const s1 = await wechatLogin('code_t4_m1');
      const s2 = await wechatLogin('code_t4_m2');
      const userId = (await getProfile(s1.accessToken)).body.data.id;
      expect((await getProfile(s2.accessToken)).body.data.id).toBe(userId);
      expect(s1.refreshToken).not.toBe(s2.refreshToken);

      // 两个会话在 DB 中各有一条 refresh token
      const tokens = await prisma.refreshToken.findMany({
        where: { userId },
      });
      expect(tokens.length).toBe(2);

      // 会话 1 刷新（旋转）后，会话 2 的 refresh token 依然有效
      const refresh1 = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: s1.refreshToken })
        .expect(200);
      const refresh2 = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: s2.refreshToken })
        .expect(200);
      expect(refresh1.body.data.accessToken).toBeTruthy();
      expect(refresh2.body.data.accessToken).toBeTruthy();

      // 两个会话的 access token 均真实可用
      expect(
        (await getProfile(refresh1.body.data.accessToken)).body.data.id
      ).toBe(userId);
      expect(
        (await getProfile(refresh2.body.data.accessToken)).body.data.id
      ).toBe(userId);

      trackUser(userId, openid);
    });
  });

  // ==================== T5: 失败路径 ====================

  describe('T5: 失败路径', () => {
    it('T5-S1: 无 code（非事务）→ 重定向登录页并携带错误', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/wechat/callback')
        .query({ state: makeState('http://localhost:3000') })
        .expect(302);

      const location = res.headers.location as string;
      expect(location.startsWith('http://localhost:3000/login#wechat_result=')).toBe(true);
      const result = parseWechatHash(location);
      expect(result.action).toBe('error');
      expect(result.error).toContain('缺少 code');
    });

    it('T5-S2: 无 code（事务模式）→ 事务标记失败，轮询返回错误', async () => {
      const { transactionId, state } = await createWechatTransaction();

      const res = await request(app.getHttpServer())
        .get('/auth/wechat/callback')
        .query({ state, txn: transactionId })
        .expect(302);
      expect(res.headers.location).toContain(`wechat_txn=${transactionId}`);
      expect(res.headers.location).toContain('wechat_error=');

      const poll = await request(app.getHttpServer())
        .get('/v1/auth/wechat/poll-transaction')
        .query({ txn: transactionId })
        .expect(200);
      expect(poll.body.data.status).toBe('completed');
      expect(poll.body.data.error).toContain('缺少 code');
    });

    it('T5-S3: openid 缺失 → 显式拒绝（400 语义），错误重定向且不创建用户', async () => {
      const before = await prisma.user.count({
        where: { provider: 'WECHAT' },
      });

      // 非事务模式：重定向登录页并携带错误（与无 code 分支一致）
      const res = await request(app.getHttpServer())
        .get('/auth/wechat/callback')
        .query({ code: CODE_NO_OPENID, state: makeState('http://localhost:3000') })
        .expect(302);

      // 回调以错误重定向收场（openid 缺失 → 回调层显式拒绝 400 语义），不再泄漏 Prisma 校验 500
      const location = res.headers.location as string;
      expect(location.startsWith('http://localhost:3000/login#wechat_result=')).toBe(true);
      const result = parseWechatHash(location);
      expect(result.action).toBe('error');
      expect(result.error).toContain('缺少 openid');

      // 没有用户被创建
      const after = await prisma.user.count({
        where: { provider: 'WECHAT' },
      });
      expect(after).toBe(before);
      const noOpenidUser = await prisma.user.findFirst({
        where: { nickname: 'NoOpenidUser' },
      });
      expect(noOpenidUser).toBeNull();

      // 事务模式：事务标记失败，轮询返回错误（与无 code 事务分支一致）
      const { transactionId, state } = await createWechatTransaction();
      const resTxn = await request(app.getHttpServer())
        .get('/auth/wechat/callback')
        .query({ code: CODE_NO_OPENID, state, txn: transactionId })
        .expect(302);
      expect(resTxn.headers.location).toContain(`wechat_txn=${transactionId}`);
      expect(resTxn.headers.location).toContain('wechat_error=');

      const poll = await request(app.getHttpServer())
        .get('/v1/auth/wechat/poll-transaction')
        .query({ txn: transactionId })
        .expect(200);
      expect(poll.body.data.status).toBe('completed');
      expect(poll.body.data.error).toContain('缺少 openid');

      const afterTxn = await prisma.user.count({
        where: { provider: 'WECHAT' },
      });
      expect(afterTxn).toBe(before);
    });
  });
});
