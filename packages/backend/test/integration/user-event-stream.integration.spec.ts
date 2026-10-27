///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { IncomingMessage } from 'http';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, UserStatus, type Notice } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';
import { REDIS_CLIENT } from '../../src/redis/redis.module';
import { NoticeCenterService } from '../../src/notice-center/notice-center.service';
import { NoticeSseService } from '../../src/notice-center/notice-sse.service';
import {
  NOTICE_EVENTS_CHANNEL,
  NOTICE_REDIS_SUBSCRIBER,
} from '../../src/notice-center/notice.types';
import { ACCOUNT_EVENTS_CHANNEL } from '../../src/users/account-events-sse.constants';

/**
 * 统一用户事件流集成测试（ADR-0083，#284-296 规则：跨模块编排 + 真实基础设施）
 *
 * 覆盖单测 mock 不了的真实交互：
 * 1. ticket 签发（真 Redis 写键）→ 兑换（GETDEL）→ 开流全链路；
 * 2. 同一条 HTTP SSE 连接上同时收到两类命名帧：
 *    - `event: account`（进程内 EventEmitter2 真实 emit）
 *    - `event: notice`（真 Redis pub/sub 跨连接 fan-out 到 raw attach）
 * 3. 建连快照帧（event: notice，真 DB 查询）；
 * 4. 客户端断连 → 连接清理（NoticeSseService.activeConnections 回落）。
 */
describe('User Event Stream Integration (ADR-0083)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: { publish: (channel: string, message: string) => Promise<unknown> };
  let eventEmitter: EventEmitter2;
  let noticeService: NoticeCenterService;
  let noticeSse: NoticeSseService;

  const suffix = Date.now().toString().slice(-8);
  const username = `uev${suffix}`;
  let userId: string;

  /** 轮询等待条件成立（SSE 帧异步到达，不可用固定 sleep） */
  async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`waitFor 超时（${timeoutMs}ms）`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    await app.init();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    // 集成环境的 in-memory Redis mock 的 eval 是恒返 1 的桩（限流场景够用），
    // 执行不了 ticket 的 Lua GETDEL；用 mock 自身的 get/del（同一共享存储）补等价
    // 语义，使 ticket 兑换链路在集成环境与真实 Redis 行为一致。
    // 须同时补两个实例：NoticeCenterService 走 @InjectRedis()（NestRedisModule 客户端），
    // 其余服务走 REDIS_CLIENT token——两个 MockRedis 实例共享存储但各自持有 eval 桩。
    const patchEval = (client: {
      eval: (script: string, numKeys: number, ...keys: string[]) => Promise<unknown>;
      get: (key: string) => Promise<string | null>;
      del: (...keys: string[]) => Promise<unknown>;
    }) => {
      client.eval = async (_script: string, _numKeys: number, ...keys: string[]) => {
        const value = await client.get(keys[0]);
        if (value !== null) await client.del(keys[0]);
        return value;
      };
    };
    patchEval(app.get(REDIS_CLIENT) as never);
    patchEval(app.get(getRedisConnectionToken()) as never);
    redis = app.get(REDIS_CLIENT) as unknown as typeof redis;
    eventEmitter = app.get(EventEmitter2);
    noticeService = app.get(NoticeCenterService);
    noticeSse = app.get(NoticeSseService);

    const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });
    if (!userRole) {
      throw new Error('cloudcad_test 库缺少 USER 角色，请先执行 seed');
    }
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        password: null,
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      },
    });
    userId = user.id;
  }, 60000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await prisma.$disconnect();
    // Node 19+ 全局 agent 默认 keep-alive：supertest 的空闲连接会让
    // server.close() 一直等待；先掐掉空闲连接再关 app。
    (app.getHttpServer() as unknown as {
      closeIdleConnections?: () => void;
    }).closeIdleConnections?.();
    await app.close();
  });

  beforeEach(async () => {
    // 全局 setup 的 beforeEach 会清空 in-memory Redis mock 的 pub/sub 总线
    // （防失效广播跨用例泄漏），连带清掉 app 启动时 NoticeSseService 注册的
    // 通知频道订阅；重新订阅恢复（subscriber 实例的 message 处理器已在
    // onModuleInit 注册，仅总线条目被清）。
    const subscriber = app.get(NOTICE_REDIS_SUBSCRIBER) as unknown as {
      subscribe: (channel: string) => Promise<unknown>;
    };
    await subscriber.subscribe(NOTICE_EVENTS_CHANNEL);
  });

  it('无效 ticket → 401（不走异常过滤器）', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/users/events/stream')
      .query({ ticket: 'garbage-ticket' });
    expect(res.status).toBe(401);
  });

  it('有效 ticket：同一条流收到 account 与 notice 两类命名帧，断连后清理', async () => {
    const ticket = await noticeService.issueTicket(userId);
    const before = noticeSse.activeConnections;

    // SSE 长连接永不「完成」，supertest 的 end 回调不会触发；改用 superagent 的
    // response 事件（响应头到达即触发），buffer(false) 时 res 为原始流。
    const req = request(app.getHttpServer())
      .get('/v1/users/events/stream')
      .query({ ticket })
      .buffer(false);
    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      req.on('response', (r: IncomingMessage) => resolve(r));
      req.on('error', reject);
      req.end();
    });
    expect(res.headers['content-type']).toContain('text/event-stream');

    const chunks: string[] = [];
    res.on('data', (c: Buffer) => chunks.push(c.toString()));
    // 测试自身 abort 连接时响应流会收到 error/aborted，属预期，吞掉防未处理事件
    res.on('error', () => {});
    const buffer = () => chunks.join('');

    try {
      // 1) 建连快照帧（event: notice 命名帧，真 DB 查询）
      await waitFor(
        () =>
          buffer().includes('event: notice') &&
          buffer().includes('"type":"snapshot"')
      );

      // 2) account 命名帧：进程内 EventEmitter2 真实 emit
      eventEmitter.emit(ACCOUNT_EVENTS_CHANNEL(userId), {
        type: 'membership-changed',
      });
      await waitFor(
        () =>
          buffer().includes('event: account') &&
          buffer().includes('"type":"membership-changed"')
      );

      // 3) notice 命名帧：真 Redis pub/sub 跨连接 fan-out（广播公告对全员相关）
      const broadcast = {
        type: 'publish',
        notice: { id: `n-${suffix}`, userId: null } as unknown as Notice,
      };
      await redis.publish(NOTICE_EVENTS_CHANNEL, JSON.stringify(broadcast));
      await waitFor(
        () =>
          (buffer().match(/event: notice/g) || []).length >= 2 &&
          buffer().includes('"type":"publish"')
      );

      // 4) raw attach 计入连接数
      expect(noticeSse.activeConnections).toBe(before + 1);

      // 5) 客户端断连 → 清理（activeConnections 回落）
      req.abort();
      await waitFor(() => noticeSse.activeConnections === before);
    } finally {
      // 任一步失败也要断开 SSE 连接，否则 app.close() 会等这条长连接
      req.abort();
    }
  });
});
