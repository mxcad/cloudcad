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

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Notice } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { NOTICE_EVENTS_CHANNEL, NOTICE_TICKET_PREFIX } from './notice.types';
import { NoticeCenterService } from './notice-center.service';

describe('NoticeCenterService', () => {
  let service: NoticeCenterService;

  const mockPrisma = {
    notice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    eval: jest.fn(),
    publish: jest.fn(),
  };

  const makeNotice = (
    over: Partial<Notice> = {}
  ): Notice =>
    ({
      id: 'notice_1',
      kind: 'system',
      level: 'info',
      title: '标题',
      body: '正文',
      userId: null,
      startAt: null,
      endAt: null,
      autoExpire: false,
      publishedAt: new Date('2026-09-17T10:00:00.000Z'),
      notifiedAt: null,
      retractedAt: null,
      publishedById: 'admin_1',
      createdAt: new Date('2026-09-17T10:00:00.000Z'),
      updatedAt: new Date('2026-09-17T10:00:00.000Z'),
      ...over,
    }) as Notice;

  beforeEach(async () => {
    jest.clearAllMocks();

    // clearAllMocks 会清掉 mock 实现，链式调用（getdel/setex/publish 返回值）
    // 会拿到 undefined。这里给所有 mock 设默认 resolved 值。
    mockPrisma.notice.findMany.mockResolvedValue([]);
    mockPrisma.notice.findUnique.mockResolvedValue(null);
    mockPrisma.notice.create.mockImplementation(async ({ data }) =>
      makeNotice(data as Partial<Notice>)
    );
    mockPrisma.notice.update.mockImplementation(async ({ data }) =>
      makeNotice(data as Partial<Notice>)
    );
    mockPrisma.notice.updateMany.mockResolvedValue({ count: 1 });
    mockRedis.publish.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticeCenterService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<NoticeCenterService>(NoticeCenterService);
  });

  describe('getEffective', () => {
    it('带 userId 时受众条件为广播或定向给该用户', async () => {
      await service.getEffective('u_1');
      const where = mockPrisma.notice.findMany.mock.calls[0][0].where;
      expect(where.publishedAt).toEqual({ not: null });
      expect(where.AND).toContainEqual({ OR: [{ userId: null }, { userId: 'u_1' }] });
    });

    it('不带 userId 时只返回广播通知', async () => {
      await service.getEffective();
      const where = mockPrisma.notice.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ userId: null });
    });

    it('startAt 用 OR 匹配 NULL（Prisma 的 lte 不匹配 NULL）', async () => {
      await service.getEffective();
      const where = mockPrisma.notice.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { startAt: null },
        { startAt: { lte: expect.any(Date) } },
      ]);
    });

    it('endAt 两分支包在同一个 OR 节点里（平铺进 AND 会变成合取，恒为假）', async () => {
      await service.getEffective();
      const where = mockPrisma.notice.findMany.mock.calls[0][0].where;
      // AND 是合取：平铺 { endAt: null } 与 { endAt: { gt } } 会同时要求
      // endAt 为空且晚于当前，任何记录都不满足 → getEffective 恒返回空数组，
      // 发布后前端永远收不到公告。必须包成单个 OR 节点作为 AND 片段。
      expect(where.AND).toContainEqual({
        OR: [{ endAt: null }, { endAt: { gt: expect.any(Date) } }],
      });
      expect(where.AND).not.toContainEqual({ endAt: null });
      expect(where.AND).not.toContainEqual({ endAt: { gt: expect.any(Date) } });
      expect(where.AND).toContainEqual({ userId: null });
    });
  });

  describe('create', () => {
    it('当前生效的通知发布后立即推送', async () => {
      await service.create({ kind: 'system', title: 't', body: 'b' }, 'admin_1');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        NOTICE_EVENTS_CHANNEL,
        expect.stringContaining('"type":"publish"')
      );
    });

    it('autoExpire=true 且未提供 endAt 时拒绝', async () => {
      await expect(
        service.create({ kind: 'system', title: 't', body: 'b', autoExpire: true }, 'a')
      ).rejects.toThrow(BadRequestException);
    });

    it('未知 kind 拒绝', async () => {
      await expect(
        service.create({ kind: 'unknown' as never, title: 't', body: 'b' }, 'a')
      ).rejects.toThrow(BadRequestException);
    });

    it('未知 level 拒绝', async () => {
      await expect(
        service.create({ kind: 'system', level: 'fatal' as never, title: 't', body: 'b' }, 'a')
      ).rejects.toThrow(BadRequestException);
    });

    it('publishNow=false 保存为草稿：不发布、不推送', async () => {
      const notice = await service.create(
        { kind: 'system', title: 't', body: 'b', publishNow: false },
        'admin_1'
      );
      expect(notice.publishedAt).toBeNull();
      expect(notice.publishedById).toBeNull();
      expect(mockRedis.publish).not.toHaveBeenCalled();
    });

    it('startAt 在未来的通知不立即推送（交给定时任务）', async () => {
      await service.create(
        {
          kind: 'system',
          title: 't',
          body: 'b',
          startAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        'admin_1'
      );
      expect(mockRedis.publish).not.toHaveBeenCalled();
    });

    it('推送失败不阻断创建（定时任务兜底重试）', async () => {
      mockRedis.publish.mockRejectedValue(new Error('redis down'));
      await expect(
        service.create({ kind: 'system', title: 't', body: 'b' }, 'admin_1')
      ).resolves.toEqual(expect.any(Object));
    });
  });

  describe('update', () => {
    it('不存在的通知抛 NotFound', async () => {
      await expect(service.update('missing', { title: 'x' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('已发布的通知更新后 emit update', async () => {
      mockPrisma.notice.findUnique.mockResolvedValue(makeNotice());
      await service.update('notice_1', { title: '新标题' });
      expect(mockRedis.publish).toHaveBeenCalledWith(
        NOTICE_EVENTS_CHANNEL,
        expect.stringContaining('"type":"update"')
      );
    });

    it('草稿更新不推送', async () => {
      mockPrisma.notice.findUnique.mockResolvedValue(makeNotice());
      mockPrisma.notice.update.mockResolvedValue(
        makeNotice({ publishedAt: null })
      );
      await service.update('notice_1', { title: '新标题' });
      expect(mockRedis.publish).not.toHaveBeenCalled();
    });

    it('非法 level 拒绝', async () => {
      await expect(
        service.update('notice_1', { level: 'fatal' as never })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('retract', () => {
    it('不存在的通知抛 NotFound', async () => {
      await expect(service.retract('missing')).rejects.toThrow(NotFoundException);
    });

    it('草稿不能下线', async () => {
      mockPrisma.notice.findUnique.mockResolvedValue(
        makeNotice({ publishedAt: null })
      );
      await expect(service.retract('notice_1')).rejects.toThrow(BadRequestException);
    });

    it('下线：置空 publishedAt + 记 retractedAt + 广播 retract', async () => {
      mockPrisma.notice.findUnique.mockResolvedValue(makeNotice());
      mockPrisma.notice.update.mockResolvedValue(
        makeNotice({ publishedAt: null, retractedAt: new Date() })
      );
      const result = await service.retract('notice_1');
      expect(result.publishedAt).toBeNull();
      expect(result.retractedAt).toBeInstanceOf(Date);
      expect(mockRedis.publish).toHaveBeenCalledWith(
        NOTICE_EVENTS_CHANNEL,
        expect.stringContaining('"type":"retract"')
      );
    });
  });

  describe('pushDueNotices', () => {
    it('CAS 抢占成功（count>0）才推送', async () => {
      mockPrisma.notice.findMany.mockResolvedValue([makeNotice()]);
      mockPrisma.notice.updateMany.mockResolvedValue({ count: 1 });
      await service.pushDueNotices();
      expect(mockPrisma.notice.updateMany).toHaveBeenCalledWith({
        where: { id: 'notice_1', notifiedAt: null },
        data: { notifiedAt: expect.any(Date) },
      });
      expect(mockRedis.publish).toHaveBeenCalledWith(
        NOTICE_EVENTS_CHANNEL,
        expect.stringContaining('"type":"publish"')
      );
    });

    it('CAS 抢占失败（count=0，别的实例已完成）跳过', async () => {
      mockPrisma.notice.findMany.mockResolvedValue([makeNotice()]);
      mockPrisma.notice.updateMany.mockResolvedValue({ count: 0 });
      await service.pushDueNotices();
      expect(mockRedis.publish).not.toHaveBeenCalled();
    });

    it('候选查询带 endAt 过滤与 notifiedAt=null', async () => {
      await service.pushDueNotices();
      const where = mockPrisma.notice.findMany.mock.calls[0][0].where;
      expect(where.notifiedAt).toBeNull();
      expect(where.publishedAt).toEqual({ not: null });
      expect(where.OR).toEqual([
        { startAt: null },
        { startAt: { lte: expect.any(Date) } },
      ]);
    });

    it('推送失败回滚 notifiedAt，下一分钟重试', async () => {
      mockPrisma.notice.findMany.mockResolvedValue([makeNotice()]);
      mockRedis.publish.mockRejectedValue(new Error('redis down'));
      await service.pushDueNotices();
      expect(mockPrisma.notice.update).toHaveBeenCalledWith({
        where: { id: 'notice_1' },
        data: { notifiedAt: null },
      });
    });
  });

  describe('expireDueNotices', () => {
    it('到期的自动下线并发 retract，不回滚', async () => {
      mockPrisma.notice.findMany.mockResolvedValue([makeNotice()]);
      mockPrisma.notice.updateMany.mockResolvedValue({ count: 1 });
      mockRedis.publish.mockRejectedValue(new Error('redis down'));
      await service.expireDueNotices();
      expect(mockPrisma.notice.updateMany).toHaveBeenCalledWith({
        where: { id: 'notice_1', publishedAt: { not: null } },
        data: { publishedAt: null, retractedAt: expect.any(Date) },
      });
      // DB 已下线是权威状态，推送失败不回滚（靠轮询兜底）
      expect(mockPrisma.notice.update).not.toHaveBeenCalled();
    });

    it('候选条件：已发布 + autoExpire + endAt 到期', async () => {
      await service.expireDueNotices();
      const where = mockPrisma.notice.findMany.mock.calls[0][0].where;
      expect(where.publishedAt).toEqual({ not: null });
      expect(where.autoExpire).toBe(true);
      expect(where.endAt).toEqual({ lte: expect.any(Date) });
    });
  });

  describe('ticket', () => {
    it('签发写入 Redis 且带 TTL', async () => {
      const ticket = await service.issueTicket('u_1');
      expect(mockRedis.set).toHaveBeenCalledWith(
        NOTICE_TICKET_PREFIX + ticket,
        'u_1',
        'EX',
        expect.any(Number)
      );
    });

    it('兑换走 Lua GETDEL 原子取用并返回 userId', async () => {
      mockRedis.eval.mockResolvedValue('u_1');
      await expect(service.redeemTicket('tk')).resolves.toBe('u_1');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('GET', KEYS[1])"),
        1,
        NOTICE_TICKET_PREFIX + 'tk'
      );
    });

    it('无效或空 ticket 返回 null', async () => {
      mockRedis.eval.mockResolvedValue(null);
      await expect(service.redeemTicket('bad')).resolves.toBeNull();
      await expect(service.redeemTicket('')).resolves.toBeNull();
    });
  });
});
