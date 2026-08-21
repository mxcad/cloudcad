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

/**
 * 协同（cooperate）集成测试 — issue #284
 *
 * 架构背景：
 * - 协同服务器（createWrok / joinWork / exitWork / 事件广播 / 会话内冲突检测）是
 *   外部服务（COOPERATE_URL，默认 http://localhost:3091）。后端仅提供
 *   「运行时配置检查 + 用户认证 + 反向代理」，见 src/main.ts:324-412。
 * - 因此本 spec 覆盖两层：
 *   1) 后端真实实现：/api/cooperate 代理认证门禁（CooperateAuthService 真实实例 +
 *      镜像 main.ts 的中间件组装，createCooperateProxyMiddleware 与
 *      src/main.ts:324-383 逐行对齐，main.ts 变更时需同步）以及协同保存乐观锁
 *      （MxcadSaveService.expectedTimestamp 过期 → ConflictException 409）。
 *   2) 外部协同服务协议语义：本地 MockCooperateServer 镜像 SDK 语义
 *      （createWrok 返回 workid>0 成功且自动加入；joinWork 0=成功 / 17=已恢复会话 /
 *      5=会话已关闭；edit 携带 rev 乐观锁，过期 rev → 409；exitWork 退出；
 *      无权限用户 joinWork → 拒绝）。字段为语义镜像，真实协议以协同服务文档为准。
 *
 * 需要真实环境（Docker / 私有化部署）验证的项见文件末尾「真实环境验证清单」。
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import session from 'express-session';
import request from 'supertest';
import http from 'http';
import { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

import { CooperateAuthService } from '../../src/cooperate/cooperate-auth.service';
import { TokenBlacklistService } from '../../src/auth/services/token-blacklist.service';
import { DatabaseService } from '../../src/database/database.service';
import { MxcadSaveService } from '../../src/mxcad/save/mxcad-save.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { VERSION_CONTROL_TOKEN } from '../../src/version-control/interfaces/version-control.interface';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { MXCAD_CONVERSION_SERVICE } from '../../src/mxcad/interfaces/mxcad-service-tokens';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

const JWT_SECRET = 'test-cooperate-jwt-secret';

const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_C = 'user-c';
const USER_D = 'user-d';

// ============================================================================
// 镜像 src/main.ts:388-401 的 parseCookie
// ============================================================================
function parseCookie(
  cookieHeader: string | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (key === name) return value;
  }
  return null;
}

interface RuntimeConfigLike {
  getValue: (key: string, defaultValue?: unknown) => Promise<unknown>;
}

/**
 * 镜像 src/main.ts:324-383 的 /api/cooperate 中间件组装：
 * 1. 运行时配置 collaborationEnabled 为 false → 403（实时协同只支持私有化部署）；
 * 2. Session 优先 → 其次 JWT（Authorization Bearer / auth_token cookie）；
 * 3. 认证失败 → 401；基础设施异常 → 500；
 * 4. 通过后注入 x-user-id 头并放行给反向代理。
 */
function createCooperateProxyMiddleware(
  runtimeConfig: RuntimeConfigLike,
  authService: CooperateAuthService
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. 运行时配置检查
    try {
      const enabled = await runtimeConfig.getValue('collaborationEnabled', false);
      if (!enabled) {
        res.status(403).json({ message: '实时协同只支持私有化部署' });
        return;
      }
    } catch {
      res.status(503).json({ message: '协同服务配置不可用' });
      return;
    }

    // 2. 用户认证检查（Session / JWT）
    let userId: string | null = null;
    try {
      const sessionUserId = (
        req as Request & { session?: { userId?: unknown } }
      ).session?.userId;
      if (sessionUserId) {
        await authService.authenticateSession(String(sessionUserId));
        userId = String(sessionUserId);
      } else {
        const token = req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : parseCookie(req.headers.cookie, 'auth_token');
        if (token) {
          userId = await authService.authenticateJwt(token);
        }
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.status(401).json({ message: error.message });
        return;
      }
      res.status(500).json({ message: '认证服务暂不可用' });
      return;
    }

    if (!userId) {
      res.status(401).json({ message: '需要登录才能使用协同功能' });
      return;
    }

    req.headers['x-user-id'] = userId;
    next();
  };
}

// ============================================================================
// Mock 协同服务器：镜像 SDK 语义（createWrok/joinWork/exitWork/事件/乐观锁/权限）
// ============================================================================

const COOPERATE_RESULT = {
  OK: 0,
  NO_PERMISSION: 3,
  CLOSED: 5,
  ALREADY_RESUMED: 17,
} as const;

interface CooperateEvent {
  id: number;
  workId: number;
  from: string;
  event: string;
  payload: unknown;
  rev: number;
}

interface CooperateWork {
  workid: number;
  rev: number;
  members: Set<string>;
  allowedUsers: Set<string>;
  events: CooperateEvent[];
}

class MockCooperateServer {
  private works = new Map<number, CooperateWork>();
  private nextWorkId = 1;
  private nextEventId = 1;
  requests: Array<{ method: string; url: string; userId: string | null }> = [];

  clear(): void {
    this.works.clear();
    this.nextWorkId = 1;
    this.nextEventId = 1;
    this.requests.length = 0;
  }

  createWork(userId: string, workData: Record<string, unknown>) {
    const work: CooperateWork = {
      workid: this.nextWorkId++,
      rev: 1,
      members: new Set([userId]), // createWrok 成功后自动加入（SDK 语义）
      allowedUsers: new Set([userId]),
      events: [],
    };
    const memberIds = workData.projectMemberIds;
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        if (typeof id === 'string') work.allowedUsers.add(id);
      }
    }
    this.works.set(work.workid, work);
    return { code: COOPERATE_RESULT.OK, workid: work.workid, message: '会话创建成功' };
  }

  joinWork(workId: number, userId: string) {
    const work = this.works.get(workId);
    if (!work) return { code: COOPERATE_RESULT.CLOSED, message: '会话不存在或已关闭' };
    if (!work.allowedUsers.has(userId)) {
      return { code: COOPERATE_RESULT.NO_PERMISSION, message: '无权限加入该会话' };
    }
    if (work.members.has(userId)) {
      return { code: COOPERATE_RESULT.ALREADY_RESUMED, message: '已恢复会话' };
    }
    work.members.add(userId);
    return { code: COOPERATE_RESULT.OK, message: '加入成功' };
  }

  exitWork(workId: number, userId: string) {
    const work = this.works.get(workId);
    if (!work) return { code: COOPERATE_RESULT.CLOSED, message: '会话不存在或已关闭' };
    work.members.delete(userId);
    return { code: COOPERATE_RESULT.OK, message: '已退出会话' };
  }

  loadFile(workId: number, userId: string, nodeId: string) {
    const work = this.works.get(workId);
    if (!work) return { code: COOPERATE_RESULT.CLOSED, message: '会话不存在或已关闭' };
    if (!work.members.has(userId)) {
      return { code: COOPERATE_RESULT.CLOSED, message: '未加入会话，无法加载文件' };
    }
    // 模拟 joinWork 的 SDK 自动加载文件行为
    return { code: COOPERATE_RESULT.OK, fileUrl: `/files/${nodeId}.mxweb`, rev: work.rev };
  }

  edit(workId: number, userId: string, ops: unknown, rev: number) {
    const work = this.works.get(workId);
    if (!work) return { code: COOPERATE_RESULT.CLOSED, message: '会话不存在或已关闭' };
    if (!work.members.has(userId)) {
      return { code: COOPERATE_RESULT.CLOSED, message: '未加入会话' };
    }
    // 乐观锁：客户端必须携带与服务器一致的 rev，否则视为并发冲突
    if (rev !== work.rev) {
      return {
        code: 409,
        serverRev: work.rev,
        message: '编辑冲突，请基于最新版本重试',
      };
    }
    work.rev += 1;
    const evt: CooperateEvent = {
      id: this.nextEventId++,
      workId,
      from: userId,
      event: 'edit',
      payload: ops,
      rev: work.rev,
    };
    work.events.push(evt);
    return { code: COOPERATE_RESULT.OK, rev: work.rev };
  }

  events(workId: number, since: number) {
    const work = this.works.get(workId);
    if (!work) return { code: COOPERATE_RESULT.CLOSED, events: [] };
    return {
      code: COOPERATE_RESULT.OK,
      events: work.events.filter((e) => e.id > since),
    };
  }

  getMembers(workId: number): string[] {
    return Array.from(this.works.get(workId)?.members ?? []);
  }
}

function startMockCooperateServer(
  mockServer: MockCooperateServer
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const httpServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const userId = (req.headers['x-user-id'] as string | undefined) ?? null;
        mockServer.requests.push({ method: req.method ?? '', url: req.url ?? '', userId });

        const raw = Buffer.concat(chunks).toString('utf8');
        let body: Record<string, unknown> = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          // ignore malformed body
        }

        const send = (status: number, data: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        };

        // 协同服务信任后端代理注入的认证身份；未经代理认证的请求直接拒绝
        if (!userId) {
          send(401, { message: '协同服务需要经过后端认证代理' });
          return;
        }

        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const workId = Number(body.workId ?? 0);
        let result: unknown;
        switch (url.pathname) {
          case '/createWork':
            result = mockServer.createWork(
              userId,
              (body.workData as Record<string, unknown>) ?? {}
            );
            break;
          case '/joinWork':
            result = mockServer.joinWork(workId, userId);
            break;
          case '/exitWork':
            result = mockServer.exitWork(workId, userId);
            break;
          case '/load':
            result = mockServer.loadFile(workId, userId, String(body.nodeId ?? ''));
            break;
          case '/edit':
            result = mockServer.edit(
              workId,
              userId,
              body.ops,
              Number(body.rev ?? 0)
            );
            break;
          case '/events':
            result = mockServer.events(workId, Number(url.searchParams.get('since') ?? 0));
            break;
          default:
            result = { code: 404, message: `未知协同接口: ${url.pathname}` };
        }
        send(200, result);
      });
    });
    httpServer.listen(0, '127.0.0.1', () => {
      const address = httpServer.address() as AddressInfo;
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => httpServer.close(() => done())),
      });
    });
  });
}

// ============================================================================
// 测试应用组装：镜像 main.ts 的「认证中间件 + 协同反向代理」两段挂载
// ============================================================================
interface BuildAppOptions {
  runtimeConfig: RuntimeConfigLike;
  authService: CooperateAuthService;
  proxyTarget: string;
  withSession?: boolean;
}

function buildApp(opts: BuildAppOptions): express.Express {
  const app = express();
  app.use(express.json());
  if (opts.withSession) {
    app.use(session({ secret: 'test-session-secret', resave: false, saveUninitialized: false }));
    // 模拟已登录的 Session 用户（浏览器同源 Cookie 场景）
    app.use((req, _res, next) => {
      (req as Request & { session: { userId?: string } }).session.userId = USER_A;
      next();
    });
  }
  app.use('/api/cooperate', createCooperateProxyMiddleware(opts.runtimeConfig, opts.authService));
  app.use(
    '/api/cooperate',
    createProxyMiddleware({
      target: opts.proxyTarget,
      changeOrigin: true,
      pathRewrite: { '^/api/cooperate': '' },
      // 官方修复：express.json() 消费请求流后，POST body 需经 fixRequestBody 重放，
      // 否则代理转发挂起（http-proxy-middleware 3.x + body-parser 前置，见 README
      // 「fixRequestBody」一节；生产 src/main.ts:404-411 未配置此项，见报告发现项）
      on: { proxyReq: fixRequestBody },
    })
  );
  return app;
}

const signAccessToken = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET);

const signRefreshToken = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET);

const createTokenBlacklistMock = () => ({
  isBlacklisted: jest.fn().mockResolvedValue(false),
  isUserBlacklisted: jest.fn().mockResolvedValue(false),
});

const createDatabaseMock = () => ({
  user: {
    findUnique: jest.fn().mockResolvedValue({ id: USER_A, status: 'ACTIVE' }),
  },
});

function createAuthService(
  tokenBlacklist: ReturnType<typeof createTokenBlacklistMock>,
  database: ReturnType<typeof createDatabaseMock>
): CooperateAuthService {
  return new CooperateAuthService(
    tokenBlacklist as unknown as TokenBlacklistService,
    database as unknown as DatabaseService,
    JWT_SECRET
  );
}

describe('协同 cooperate 集成测试 (#284)', () => {
  const runtimeConfig: RuntimeConfigLike = {
    getValue: jest.fn().mockResolvedValue(true),
  };
  let mockServer: MockCooperateServer;
  let mockServerPort: number;
  let mockServerClose: () => Promise<void>;

  beforeAll(async () => {
    mockServer = new MockCooperateServer();
    const server = await startMockCooperateServer(mockServer);
    mockServerPort = server.port;
    mockServerClose = server.close;
  }, 60000);

  afterAll(async () => {
    if (mockServerClose) await mockServerClose();
  }, 60000);

  beforeEach(() => {
    mockServer.clear();
    (runtimeConfig.getValue as jest.Mock).mockResolvedValue(true);
  });

  describe('T1: /api/cooperate 代理认证与权限门禁（真实后端实现）', () => {
    let tokenBlacklist: ReturnType<typeof createTokenBlacklistMock>;
    let database: ReturnType<typeof createDatabaseMock>;
    let authService: CooperateAuthService;

    beforeEach(() => {
      tokenBlacklist = createTokenBlacklistMock();
      database = createDatabaseMock();
      authService = createAuthService(tokenBlacklist, database);
    });

    const app = () =>
      buildApp({
        runtimeConfig,
        authService,
        proxyTarget: `http://127.0.0.1:${mockServerPort}`,
      });

    it('T1-S1: 无 token 请求 → 401（需要登录才能使用协同功能）', async () => {
      const res = await request(app())
        .post('/api/cooperate/createWork')
        .send({ workData: { name: '协同图纸' } });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('需要登录');
      expect(mockServer.requests).toHaveLength(0);
    });

    it('T1-S2: 有效 access JWT → 放行并注入 x-user-id 转发到协同服务', async () => {
      const res = await request(app())
        .post('/api/cooperate/createWork')
        .set('Authorization', `Bearer ${signAccessToken(USER_A)}`)
        .send({ workData: { name: '协同图纸' } });

      expect(res.status).toBe(200);
      expect(res.body.workid).toBeGreaterThan(0);
      // 认证身份经代理注入 x-user-id 头到达协同服务
      expect(mockServer.requests).toHaveLength(1);
      expect(mockServer.requests[0].userId).toBe(USER_A);
      // 路径重写：/api/cooperate/createWork → /createWork
      expect(mockServer.requests[0].url).toBe('/createWork');
    });

    it('T1-S3: Session 登录用户 → 放行（authenticateSession 真实校验用户状态）', async () => {
      const res = await request(
        buildApp({
          runtimeConfig,
          authService,
          proxyTarget: `http://127.0.0.1:${mockServerPort}`,
          withSession: true,
        })
      )
        .post('/api/cooperate/joinWork')
        .send({ workId: 1 });

      expect(res.status).toBe(200);
      expect(mockServer.requests[0].userId).toBe(USER_A);
    });

    it('T1-S4: refresh token 不能用于协同 → 401', async () => {
      const res = await request(app())
        .post('/api/cooperate/createWork')
        .set('Authorization', `Bearer ${signRefreshToken(USER_A)}`)
        .send({ workData: {} });

      expect(res.status).toBe(401);
      expect(mockServer.requests).toHaveLength(0);
    });

    it('T1-S5: 已拉黑 token → 401', async () => {
      tokenBlacklist.isBlacklisted.mockResolvedValue(true);

      const res = await request(app())
        .post('/api/cooperate/createWork')
        .set('Authorization', `Bearer ${signAccessToken(USER_A)}`)
        .send({ workData: {} });

      expect(res.status).toBe(401);
      expect(mockServer.requests).toHaveLength(0);
    });

    it('T1-S6: 用户被禁用/删除 → 401', async () => {
      database.user.findUnique.mockResolvedValue({
        id: USER_A,
        status: 'DISABLED',
      });

      const res = await request(app())
        .post('/api/cooperate/createWork')
        .set('Authorization', `Bearer ${signAccessToken(USER_A)}`)
        .send({ workData: {} });

      expect(res.status).toBe(401);
      expect(mockServer.requests).toHaveLength(0);
    });

    it('T1-S7: collaborationEnabled=false → 403（实时协同只支持私有化部署）', async () => {
      (runtimeConfig.getValue as jest.Mock).mockResolvedValue(false);

      const res = await request(app())
        .post('/api/cooperate/createWork')
        .set('Authorization', `Bearer ${signAccessToken(USER_A)}`)
        .send({ workData: {} });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('私有化部署');
      expect(mockServer.requests).toHaveLength(0);
    });

    it('T1-S8: 运行时配置读取异常 → 503（不伪装成登录过期）', async () => {
      (runtimeConfig.getValue as jest.Mock).mockRejectedValue(
        new Error('config-store unavailable')
      );

      const res = await request(app())
        .post('/api/cooperate/createWork')
        .set('Authorization', `Bearer ${signAccessToken(USER_A)}`)
        .send({ workData: {} });

      expect(res.status).toBe(503);
      expect(mockServer.requests).toHaveLength(0);
    });
  });

  describe('T2: 协同会话生命周期协议（mock 协同服务器 + 后端代理透传）', () => {
    let tokenBlacklist: ReturnType<typeof createTokenBlacklistMock>;
    let database: ReturnType<typeof createDatabaseMock>;
    let authService: CooperateAuthService;
    let workId: number;

    beforeEach(() => {
      tokenBlacklist = createTokenBlacklistMock();
      database = createDatabaseMock();
      database.user.findUnique.mockImplementation(({ where }) =>
        Promise.resolve({
          id: String(where?.id),
          status: 'ACTIVE',
        })
      );
      authService = createAuthService(tokenBlacklist, database);
    });

    const app = () =>
      buildApp({
        runtimeConfig,
        authService,
        proxyTarget: `http://127.0.0.1:${mockServerPort}`,
      });

    const post = (path: string, token: string, body: Record<string, unknown>) =>
      request(app())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    it('T2-S1: createWrok 创建会话 → 自动加入 → 加载文件', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B, USER_D] } }
      );

      // workid > 0 表示创建成功（SDK 语义）
      expect(createRes.status).toBe(200);
      expect(createRes.body.workid).toBeGreaterThan(0);
      workId = createRes.body.workid;

      // createWrok 成功后自动加入会话
      expect(mockServer.getMembers(workId)).toEqual([USER_A]);

      // 加载文件（joinWork/创建后自动加载文件，SDK 语义）
      const loadRes = await post('/api/cooperate/load', signAccessToken(USER_A), {
        workId,
        nodeId: 'file-node-1',
      });
      expect(loadRes.body.code).toBe(0);
      expect(loadRes.body.fileUrl).toContain('file-node-1');
    });

    it('T2-S2: 第二用户 joinWork 加入同一会话（多成员）', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B, USER_D] } }
      );
      workId = createRes.body.workid;

      const joinB = await post('/api/cooperate/joinWork', signAccessToken(USER_B), {
        workId,
      });
      expect(joinB.body.code).toBe(0);

      const joinD = await post('/api/cooperate/joinWork', signAccessToken(USER_D), {
        workId,
      });
      expect(joinD.body.code).toBe(0);

      expect(mockServer.getMembers(workId)).toEqual([USER_A, USER_B, USER_D]);
    });

    it('T2-S3: 事件广播 — 编辑同步分发到多客户端', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B, USER_D] } }
      );
      workId = createRes.body.workid;
      await post('/api/cooperate/joinWork', signAccessToken(USER_B), { workId });
      await post('/api/cooperate/joinWork', signAccessToken(USER_D), { workId });

      // userA 编辑（rev=1，与服务器初始版本一致）
      const editRes = await post('/api/cooperate/edit', signAccessToken(USER_A), {
        workId,
        rev: 1,
        ops: [{ type: 'add', entity: 'LINE', points: [0, 0, 10, 10] }],
      });
      expect(editRes.body.code).toBe(0);
      expect(editRes.body.rev).toBe(2);

      // userB / userD 两个客户端都收到 userA 的编辑事件（多客户端分发）
      for (const client of [USER_B, USER_D]) {
        const eventsRes = await post(
          '/api/cooperate/events',
          signAccessToken(client),
          { workId, since: 0 }
        );
        expect(eventsRes.body.code).toBe(0);
        expect(eventsRes.body.events).toHaveLength(1);
        expect(eventsRes.body.events[0]).toMatchObject({
          from: USER_A,
          event: 'edit',
          rev: 2,
        });
        expect(eventsRes.body.events[0].payload).toEqual([
          { type: 'add', entity: 'LINE', points: [0, 0, 10, 10] },
        ]);
      }
    });

    it('T2-S4: 冲突/并发编辑 — 过期 rev 返回 409，基于最新 rev 重试成功', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B] } }
      );
      workId = createRes.body.workid;
      await post('/api/cooperate/joinWork', signAccessToken(USER_B), { workId });

      // userA 先编辑（rev 1 → 2）
      const firstEdit = await post('/api/cooperate/edit', signAccessToken(USER_A), {
        workId,
        rev: 1,
        ops: [{ type: 'modify', entity: 'LINE', id: 'L1' }],
      });
      expect(firstEdit.body.rev).toBe(2);

      // userB 基于过期 rev=1 编辑 → 409 冲突（乐观锁语义）
      const conflictRes = await post(
        '/api/cooperate/edit',
        signAccessToken(USER_B),
        { workId, rev: 1, ops: [{ type: 'delete', entity: 'LINE', id: 'L1' }] }
      );
      expect(conflictRes.body.code).toBe(409);
      expect(conflictRes.body.serverRev).toBe(2);
      expect(conflictRes.body.message).toContain('冲突');

      // userB 同步最新 rev=2 后重试 → 成功
      const retryRes = await post('/api/cooperate/edit', signAccessToken(USER_B), {
        workId,
        rev: 2,
        ops: [{ type: 'delete', entity: 'LINE', id: 'L1' }],
      });
      expect(retryRes.body.code).toBe(0);
      expect(retryRes.body.rev).toBe(3);
    });

    it('T2-S5: exitWork 退出会话 → 成员移除，退出后无法再同步', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B] } }
      );
      workId = createRes.body.workid;
      await post('/api/cooperate/joinWork', signAccessToken(USER_B), { workId });

      const exitRes = await post('/api/cooperate/exitWork', signAccessToken(USER_B), {
        workId,
      });
      expect(exitRes.body.code).toBe(0);
      expect(mockServer.getMembers(workId)).toEqual([USER_A]);

      // 退出后编辑被拒绝（回退本地状态，前端 SDK 负责后续处理）
      const editAfterExit = await post(
        '/api/cooperate/edit',
        signAccessToken(USER_B),
        { workId, rev: 1, ops: [] }
      );
      expect(editAfterExit.body.code).toBe(5);
    });

    it('T2-S6: 权限校验 — 无权限用户 joinWork 被拒绝', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B] } }
      );
      workId = createRes.body.workid;

      // userC 不在项目成员（allowedUsers）中 → 拒绝加入
      const joinC = await post('/api/cooperate/joinWork', signAccessToken(USER_C), {
        workId,
      });
      expect(joinC.body.code).toBe(3);
      expect(joinC.body.message).toContain('无权限');
      expect(mockServer.getMembers(workId)).toEqual([USER_A]);
    });

    it('T2-S7: 重复 joinWork 已加入的会话 → 返回 17（已恢复会话）', async () => {
      const createRes = await post(
        '/api/cooperate/createWork',
        signAccessToken(USER_A),
        { workData: { name: '协同图纸', projectMemberIds: [USER_B] } }
      );
      workId = createRes.body.workid;
      await post('/api/cooperate/joinWork', signAccessToken(USER_B), { workId });

      const again = await post('/api/cooperate/joinWork', signAccessToken(USER_B), {
        workId,
      });
      expect(again.body.code).toBe(17);
    });
  });

  describe('T3: 协同保存乐观锁（真实 MxcadSaveService，409 冲突语义）', () => {
    // 参照 test/integration/cad-concurrent-save-optimistic-lock.integration.spec.ts
    // 的 mock 栈：协同编辑后保存文件时，过期 expectedTimestamp → ConflictException
    const mockVersionControl = {
      isReady: jest.fn().mockReturnValue(true),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      isFirstCommit: jest.fn().mockResolvedValue(true),
      commitNodeDirectory: jest.fn().mockResolvedValue({
        success: true,
        message: '提交成功',
        revision: 1,
      }),
    };

    const mockFileSystemNodeService = {
      findById: jest.fn(),
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
    };

    const mockStorageManager = {
      getFullPath: jest.fn(),
      allocateNodeStorage: jest.fn(),
    };

    const mockMxcadConversionService = {
      generateBinFiles: jest.fn(),
    };

    const mockFileTreeService = {
      getProjectId: jest.fn().mockResolvedValue('project-456'),
      getNode: jest.fn(),
      createFileNode: jest.fn(),
      updateNodePath: jest.fn(),
    };

    const mockRestrictionEngine = {
      checkQuota: jest.fn().mockResolvedValue(undefined),
      reserveConversionCountOrThrow: jest.fn().mockResolvedValue(undefined),
      releaseConversionCount: jest.fn().mockResolvedValue(undefined),
    };

    const mockDatabaseService = {
      fileSystemNode: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { create: jest.fn() },
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'mxcadUploadPath') return '/fake/upload';
        return undefined;
      }),
    };

    const mockNodeMutationGuard = {
      assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
      assertProjectQuota: jest.fn().mockResolvedValue(undefined),
      assertByteQuota: jest.fn().mockResolvedValue(undefined),
      invalidateQuotaAfterMutation: jest.fn().mockResolvedValue(undefined),
      resolveProjectContext: jest.fn(),
    };

    let mxCadSaveService: MxcadSaveService;
    let tempDir: string;
    let tempFilePath: string;

    beforeAll(async () => {
      tempDir = path.join(
        process.cwd(),
        'temp-test-cooperate-save-' + Date.now()
      );
      await fsPromises.mkdir(tempDir, { recursive: true });
      tempFilePath = path.join(tempDir, 'test.mxweb');
    });

    afterAll(async () => {
      try {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // 清理失败不影响测试结果
      }
    });

    beforeEach(async () => {
      await fsPromises
        .writeFile(tempFilePath, 'test mxweb content')
        .catch(() => {});

      mockVersionControl.isReady.mockReturnValue(true);
      mockVersionControl.ensureInitialized.mockResolvedValue(undefined);
      mockVersionControl.isFirstCommit.mockResolvedValue(true);
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: true,
        message: '提交成功',
        revision: 1,
      });
      mockFileSystemNodeService.getMimeType.mockReturnValue('application/dwg');
      mockFileTreeService.getProjectId.mockResolvedValue('project-456');
      mockRestrictionEngine.checkQuota.mockResolvedValue(undefined);
      mockRestrictionEngine.reserveConversionCountOrThrow.mockResolvedValue(
        undefined
      );
      mockRestrictionEngine.releaseConversionCount.mockResolvedValue(undefined);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(undefined);
      mockDatabaseService.fileSystemNode.update.mockResolvedValue(undefined);
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      mockStorageManager.getFullPath.mockReturnValue(tempFilePath);
      mockStorageManager.allocateNodeStorage.mockResolvedValue({
        nodeDirectoryPath: tempDir,
        nodeDirectoryRelativePath: 'test/node',
      });

      const moduleFixture: TestingModule = await Test.createTestingModule({
        providers: [
          MxcadSaveService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
          { provide: StorageManager, useValue: mockStorageManager },
          { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
          { provide: DatabaseService, useValue: mockDatabaseService },
          { provide: FileTreeService, useValue: mockFileTreeService },
          { provide: RestrictionEngine, useValue: mockRestrictionEngine },
          { provide: NodeMutationGuard, useValue: mockNodeMutationGuard },
          {
            provide: MXCAD_CONVERSION_SERVICE,
            useValue: mockMxcadConversionService,
          },
        ],
      }).compile();

      mxCadSaveService = moduleFixture.get<MxcadSaveService>(MxcadSaveService);
    });

    const mockFile = (): Express.Multer.File => ({
      path: tempFilePath,
      originalname: 'test.mxweb',
      mimetype: 'application/octet-stream',
      size: 1024,
      fieldname: 'file',
      encoding: '7bit',
      destination: tempDir,
      filename: 'test.mxweb',
      buffer: Buffer.from('test content'),
      stream: null as unknown as Readable,
    });

    it('T3-S1: 协同会话中 userA 先保存 → userB 用过期时间戳保存 → 409 冲突', async () => {
      const firstSaveTime = new Date(Date.now() - 30000);
      const secondSaveTime = new Date(Date.now() - 15000);

      const testNodeV1 = {
        id: 'test-node-id',
        name: 'test.dwg',
        nodeType: 'FILE',
        path: 'test/path/test.dwg.mxweb',
        updatedAt: firstSaveTime,
      };
      const testNodeV2 = { ...testNodeV1, updatedAt: secondSaveTime };

      // userA 保存（协同会话中的首次落盘）
      mockFileSystemNodeService.findById.mockResolvedValueOnce(testNodeV1);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(
        testNodeV1
      );
      mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce(testNodeV2);

      const firstSave = await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile(),
        USER_A,
        'User A',
        '协同编辑保存'
      );
      expect(firstSave.success).toBe(true);

      // userB 基于过期时间戳保存 → 乐观锁冲突 409
      mockFileSystemNodeService.findById.mockResolvedValueOnce(testNodeV2);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(
        testNodeV2
      );

      await expect(
        mxCadSaveService.saveMxwebFile(
          'test-node-id',
          mockFile(),
          USER_B,
          'User B',
          '协同编辑保存',
          false,
          firstSaveTime.toISOString()
        )
      ).rejects.toThrow(ConflictException);

      // userB 刷新获取最新时间戳后重试 → 成功
      const latestTime = new Date();
      const testNodeV3 = { ...testNodeV2, updatedAt: latestTime };
      mockFileSystemNodeService.findById.mockResolvedValueOnce(testNodeV3);
      mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(
        testNodeV3
      );
      mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce(testNodeV3);
      await fsPromises.writeFile(tempFilePath, 'test mxweb content');

      const retry = await mxCadSaveService.saveMxwebFile(
        'test-node-id',
        mockFile(),
        USER_B,
        'User B',
        '刷新后的保存',
        false,
        latestTime.toISOString()
      );
      expect(retry.success).toBe(true);
    });
  });
});
