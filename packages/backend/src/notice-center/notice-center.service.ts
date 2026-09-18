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
 * 通用通知服务：发布 / 更新 / 下线 / 生效查询 / 一次性 SSE ticket。
 *
 * 多实例一致性不靠分布式锁，而靠数据库 compare-and-set：
 * `updateMany` 返回的 count 是原子抢占结果，count>0 的实例才 emit 事件。
 * 这样同一次「待推送 → 已推送」状态迁移只会被一个实例完成，没有锁 TTL 误释放的问题。
 *
 * 「定时发布提前推」的解法是 notifiedAt：startAt 在未来的公告发布时不推，
 * 交给 cron 到点 CAS 抢占后推送（见 notice-center.scheduler.ts）。
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import type { Notice } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import {
  NOTICE_EVENTS_CHANNEL,
  NOTICE_KINDS,
  NOTICE_LEVELS,
  NOTICE_TICKET_PREFIX,
  NOTICE_TICKET_TTL_SECONDS,
  type NoticeEvent,
} from './notice.types';
import type { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

/** Prisma 的 `lte` 不匹配 NULL，必须写成 OR 形式；拆成片段避免两个 AND 键互相覆盖 */
function startAtOr(now: Date): unknown[] {
  return [{ startAt: null }, { startAt: { lte: now } }];
}

/** 生效开始时间为空时视为「立即可生效」，等价于当前时刻 */
function startAtOrNow(startAt: Date | null): Date {
  return startAt ?? new Date();
}

/**
 * endAt 时间窗作为一个 AND 片段传入。两个分支必须包在同一个 OR 节点里：
 * 直接平铺进 AND 会变成「endAt 为 NULL」与「endAt 晚于当前」的合取，恒为假，
 * getEffective 会永远返回空列表（发布后前端永远收不到公告）。
 */
function endAtAnd(now: Date): unknown[] {
  return [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }];
}

function toDate(value: string | Date | undefined | null): Date | null {
  return value ? new Date(value) : null;
}

@Injectable()
export class NoticeCenterService {
  private readonly logger = new Logger(NoticeCenterService.name);

  constructor(
    private readonly prisma: DatabaseService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  /**
   * 当前生效中的通知（时间窗内、已发布、面向该用户）。
   *
   * 受众条件：广播（userId=null）或定向给该用户。userId 为空时只返回广播通知，
   * 供未登录的首屏兜底轮询使用。
   */
  async getEffective(userId?: string): Promise<Notice[]> {
    const now = new Date();
    const audience = userId
      ? { OR: [{ userId: null }, { userId }] }
      : { userId: null };

    return this.prisma.notice.findMany({
      where: {
        publishedAt: { not: null },
        OR: startAtOr(now),
        AND: [...endAtAnd(now), audience],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 管理后台全量列表（含草稿与已下线） */
  async listAll(): Promise<Notice[]> {
    return this.prisma.notice.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateNoticeDto, publishedById: string): Promise<Notice> {
    this.assertKind(dto.kind);
    this.assertLevel(dto.level ?? 'info');
    const autoExpire = dto.autoExpire ?? false;
    const startAt = toDate(dto.startAt);
    const endAt = toDate(dto.endAt);
    if (autoExpire && !endAt) {
      throw new BadRequestException('autoExpire 为 true 时必须提供 endAt');
    }
    // 跨字段校验：UI 挡得住、直调 API 挡不住。endAt 落在过去时公告发布后永不
    // 生效（publishedAt 被置为 now 而 endAt <= now），下一分钟 cron 就自动下线，
    // 表现是「我发了公告但没人看到」
    if (endAt && endAt <= startAtOrNow(startAt)) {
      throw new BadRequestException('失效时间必须晚于当前时间');
    }
    if (startAt && endAt && endAt <= startAt) {
      throw new BadRequestException('失效时间必须晚于生效开始时间');
    }

    const publishNow = dto.publishNow ?? true;
    const now = new Date();

    const notice = await this.prisma.notice.create({
      data: {
        kind: dto.kind,
        level: dto.level ?? 'info',
        title: dto.title,
        body: dto.body,
        userId: dto.userId ?? null,
        startAt,
        endAt,
        autoExpire,
        publishedAt: publishNow ? now : null,
        publishedById: publishNow ? publishedById : null,
      },
    });

    // 只有「当前已生效」才推送；startAt 在未来时交给 cron 到点处理，
    // 否则 SSE 会提前把公告弹到用户脸上。
    if (publishNow && this.isWithinWindow(startAt, endAt, now)) {
      await this.publishEvent({ type: 'publish', notice });
    }

    return notice;
  }

  /**
   * 发布草稿。草稿只允许改文案、不可下线（retract 拒绝草稿），此前缺这个端点，
   * 草稿是「能保存、既发不出也撤不掉」的死分支。
   *
   * endAt 可能在草稿停留期间已过期，此时发布会让公告立即被 cron 下线，直接拒绝。
   * startAt 在未来时只落库不推送，交给 cron 到点处理（与 create 同语义）。
   */
  async publish(id: string, publishedById: string): Promise<Notice> {
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('通知不存在');
    if (existing.publishedAt !== null) {
      throw new BadRequestException('该通知已发布');
    }
    const now = new Date();
    if (existing.endAt && existing.endAt <= now) {
      throw new BadRequestException('失效时间已过，请先下线后重新发布');
    }

    const updated = await this.prisma.notice.update({
      where: { id },
      data: { publishedAt: now, publishedById },
    });

    if (this.isWithinWindow(updated.startAt, updated.endAt, now)) {
      await this.publishEvent({ type: 'publish', notice: updated });
    }
    return updated;
  }

  async update(id: string, dto: UpdateNoticeDto): Promise<Notice> {
    if (dto.level !== undefined) this.assertLevel(dto.level);
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('通知不存在');

    const updated = await this.prisma.notice.update({
      where: { id },
      data: {
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });

    if (updated.publishedAt !== null) {
      await this.publishEvent({ type: 'update', notice: updated });
    }
    return updated;
  }

  async retract(id: string): Promise<Notice> {
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('通知不存在');
    if (existing.publishedAt === null) {
      throw new BadRequestException('草稿不能下线');
    }

    const updated = await this.prisma.notice.update({
      where: { id },
      data: {
        publishedAt: null,
        retractedAt: new Date(),
      },
    });

    // 客户端收到后立即移除；正在弹的这条弹框会自动关闭。
    // 轮询兜底：GET /notices/current 已按 publishedAt 过滤，最坏 30s 内自行消失。
    await this.publishEvent({ type: 'retract', noticeId: id });
    return updated;
  }

  /**
   * 到点推送：publishedAt 非空、notifiedAt 为空、已到 startAt。
   *
   * CAS 抢占成功后推送失败则回滚 notifiedAt，让下一分钟 cron 重试。
   * 顺序刻意是「先 CAS、后推送」：并发下重复推送由客户端按 noticeId 去重，
   * 而「标记成功但推送失败」的窗口不存在。
   */
  async pushDueNotices(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.notice.findMany({
      where: {
        publishedAt: { not: null },
        notifiedAt: null,
        OR: startAtOr(now),
      },
    });

    for (const notice of due) {
      const { count } = await this.prisma.notice.updateMany({
        where: { id: notice.id, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (count === 0) continue;

      const ok = await this.publishEvent({ type: 'publish', notice });
      if (!ok) {
        await this.prisma.notice.update({
          where: { id: notice.id },
          data: { notifiedAt: null },
        });
      }
    }
  }

  /**
   * 到期自动下线。CAS 成功后不回滚 notifiedAt/publishedAt：
   * DB 已下线是权威状态，客户端残留由 retract 事件 + 轮询兜底清理。
   */
  async expireDueNotices(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.notice.findMany({
      where: {
        publishedAt: { not: null },
        autoExpire: true,
        endAt: { lte: now },
      },
    });

    for (const notice of expired) {
      const { count } = await this.prisma.notice.updateMany({
        where: { id: notice.id, publishedAt: { not: null } },
        data: { publishedAt: null, retractedAt: now },
      });
      if (count === 0) continue;
      await this.publishEvent({ type: 'retract', noticeId: notice.id });
    }
  }

  /** 签发一次性 SSE ticket：JWT 不进 URL，避免落浏览器历史与反代 access log */
  async issueTicket(userId: string): Promise<string> {
    const ticket = randomBytes(24).toString('base64url');
    await this.redis.set(
      NOTICE_TICKET_PREFIX + ticket,
      userId,
      'EX',
      NOTICE_TICKET_TTL_SECONDS
    );
    return ticket;
  }

  /**
   * Lua GETDEL：原子「读 + 删」，并发下仅首个请求能取到值（一次性）。
   * 不用原生 GETDEL 命令——部署环境存在 Redis < 6.2（无该命令，报
   * `ERR unknown command getdel`）；Lua 脚本在所有受支持版本上等价。
   */
  private static readonly REDEEM_LUA_SCRIPT = `
    local value = redis.call('GET', KEYS[1])
    if value then
      redis.call('DEL', KEYS[1])
    end
    return value
  `;

  /** 原子取用 ticket（Lua GETDEL 语义），无效或已消费返回 null */
  async redeemTicket(ticket: string): Promise<string | null> {
    if (!ticket) return null;
    const result = await this.redis.eval(
      NoticeCenterService.REDEEM_LUA_SCRIPT,
      1,
      NOTICE_TICKET_PREFIX + ticket
    );
    // Lua 返回 userId 字符串或 nil（ioredis 转 null）；eval 返回类型 unknown，按契约收窄
    return typeof result === 'string' ? result : null;
  }

  private async publishEvent(event: NoticeEvent): Promise<boolean> {
    try {
      await this.redis.publish(NOTICE_EVENTS_CHANNEL, JSON.stringify(event));
      return true;
    } catch (err) {
      // 推送失败不抛：定时任务会重试，手动发布会返回成功但延迟到 cron 兜底
      this.logger.warn(`通知事件发布失败: ${(err as Error).message}`);
      return false;
    }
  }

  private isWithinWindow(
    startAt: Date | null,
    endAt: Date | null,
    now: Date
  ): boolean {
    if (startAt && startAt > now) return false;
    return !endAt || now < endAt;
  }

  private assertKind(kind: string): void {
    if (!NOTICE_KINDS.includes(kind as (typeof NOTICE_KINDS)[number])) {
      throw new BadRequestException('未知的通知类型');
    }
  }

  private assertLevel(level: string): void {
    if (!NOTICE_LEVELS.includes(level as (typeof NOTICE_LEVELS)[number])) {
      throw new BadRequestException('未知的通知级别');
    }
  }
}
