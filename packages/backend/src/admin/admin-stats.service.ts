///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, OrderStatus } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import {
  DailyPurchasesPointDto,
  DailyPurchasesStatsDto,
  DailyRegistrationsPointDto,
  DailyRegistrationsStatsDto,
  PurchasesTierBreakdownDto,
  PurchasesTotalsDto,
} from './dto/admin-stats.dto';

/** 统计切日固定按东八区（UTC+8）自然日 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** 区间上限：365 个自然日（含首尾） */
const MAX_RANGE_DAYS = 365;
/** 缺省统计范围：最近 30 个自然日（含今天） */
const DEFAULT_RANGE_DAYS = 30;

interface ResolvedRange {
  startDate: string;
  endDate: string;
  /** 东八区 startDate 当日零点对应的 UTC 时刻（闭区间下界） */
  startUtc: Date;
  /** 东八区 endDate 次日零点对应的 UTC 时刻（开区间上界） */
  endUtcExclusive: Date;
}

interface DailyRegistrationRow {
  date: string;
  count: number;
}

interface DailyPurchaseRow {
  date: string;
  orderCount: number;
  userCount: number;
  amount: number | bigint;
}

interface RefundCountRow {
  count: number;
}

interface PurchaseTotalsRow {
  orderCount: number;
  userCount: number;
  amount: number | bigint;
}

interface TierBreakdownRow {
  tierId: string | null;
  tierLevel: number | null;
  tierName: string | null;
  orderCount: number;
  userCount: number;
  amount: number | bigint;
}

/**
 * 运营统计服务——每日新增用户数、每日会员购买数的实时聚合视图。
 *
 * 口径（CONTEXT.md）：
 * - 每日新增用户：users.createdAt 按日聚合，排除软删账号（deletedAt IS NULL）
 * - 购买数：PaymentOrder status=SUCCEEDED，按 paidAt 归日（回退 createdAt），
 *   三项计数（订单笔数 / 去重付费用户数 / 金额分值）；退款单单列不扣减
 * - 切日一律为东八区自然日；实时聚合，不落快照表
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 每日新增用户统计。provider 可选过滤注册来源。
   */
  async getDailyRegistrations(
    options: { startDate?: string; endDate?: string; provider?: string } = {}
  ): Promise<DailyRegistrationsStatsDto> {
    const range = this.resolveRange(options.startDate, options.endDate);
    const providerFilter = options.provider
      ? Prisma.sql`AND "provider" = ${options.provider}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<DailyRegistrationRow[]>`
      SELECT to_char((("createdAt" AT TIME ZONE 'UTC') + INTERVAL '8 hours')::date, 'YYYY-MM-DD') AS "date",
             COUNT(*)::int AS "count"
      FROM users
      WHERE "deletedAt" IS NULL
        AND "createdAt" >= ${range.startUtc}
        AND "createdAt" < ${range.endUtcExclusive}
        ${providerFilter}
      GROUP BY 1
    `;

    const countByDate = new Map(rows.map((r) => [r.date, r.count]));
    let total = 0;
    const series: DailyRegistrationsPointDto[] = this.eachDay(range).map(
      (date) => {
        const count = countByDate.get(date) ?? 0;
        total += count;
        return { date, count };
      }
    );

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      series,
      total,
    };
  }

  /**
   * 每日会员购买统计。tierId 可选过滤，仅作用于 series 与 totals；byTier 始终返回全量档位分布。
   */
  async getDailyPurchases(
    options: { startDate?: string; endDate?: string; tierId?: string } = {}
  ): Promise<DailyPurchasesStatsDto> {
    const range = this.resolveRange(options.startDate, options.endDate);
    const tierFilter = options.tierId
      ? Prisma.sql`AND "vipTierId" = ${options.tierId}`
      : Prisma.empty;

    const seriesRows = await this.prisma.$queryRaw<DailyPurchaseRow[]>`
      SELECT to_char(((COALESCE("paidAt", "createdAt") AT TIME ZONE 'UTC') + INTERVAL '8 hours')::date, 'YYYY-MM-DD') AS "date",
             COUNT(*)::int AS "orderCount",
             COUNT(DISTINCT "userId")::int AS "userCount",
             COALESCE(SUM("amount"), 0)::bigint AS "amount"
      FROM payment_orders
      WHERE "status" = ${OrderStatus.SUCCEEDED}
        AND COALESCE("paidAt", "createdAt") >= ${range.startUtc}
        AND COALESCE("paidAt", "createdAt") < ${range.endUtcExclusive}
        ${tierFilter}
      GROUP BY 1
    `;

    // 退款单口径：区间内成功支付（paidAt 锚定归日）、当前状态为 REFUNDED 的订单，
    // 单列展示且 ⊆ orderCount，不从购买数中扣减
    const refundRows = await this.prisma.$queryRaw<RefundCountRow[]>`
      SELECT COUNT(*)::int AS "count"
      FROM payment_orders
      WHERE "status" = ${OrderStatus.REFUNDED}
        AND COALESCE("paidAt", "createdAt") >= ${range.startUtc}
        AND COALESCE("paidAt", "createdAt") < ${range.endUtcExclusive}
        ${tierFilter}
    `;

    // 区间去重付费用户数必须整区间 COUNT(DISTINCT)，不能按日累加（跨日重复计数）
    const totalsRows = await this.prisma.$queryRaw<PurchaseTotalsRow[]>`
      SELECT COUNT(*)::int AS "orderCount",
             COUNT(DISTINCT "userId")::int AS "userCount",
             COALESCE(SUM("amount"), 0)::bigint AS "amount"
      FROM payment_orders
      WHERE "status" = ${OrderStatus.SUCCEEDED}
        AND COALESCE("paidAt", "createdAt") >= ${range.startUtc}
        AND COALESCE("paidAt", "createdAt") < ${range.endUtcExclusive}
        ${tierFilter}
    `;

    // byTier 不受 tierId 过滤（始终返回全量档位分布）
    const tierRows = await this.prisma.$queryRaw<TierBreakdownRow[]>`
      SELECT po."vipTierId" AS "tierId",
             vt."level" AS "tierLevel",
             vt."name" AS "tierName",
             COUNT(*)::int AS "orderCount",
             COUNT(DISTINCT po."userId")::int AS "userCount",
             COALESCE(SUM(po."amount"), 0)::bigint AS "amount"
      FROM payment_orders po
      LEFT JOIN vip_tiers vt ON vt."id" = po."vipTierId"
      WHERE po."status" = ${OrderStatus.SUCCEEDED}
        AND COALESCE(po."paidAt", po."createdAt") >= ${range.startUtc}
        AND COALESCE(po."paidAt", po."createdAt") < ${range.endUtcExclusive}
      GROUP BY po."vipTierId", vt."level", vt."name"
      ORDER BY vt."level" ASC NULLS LAST
    `;

    const pointByDate = new Map(
      seriesRows.map((r) => [
        r.date,
        {
          orderCount: r.orderCount,
          userCount: r.userCount,
          amount: Number(r.amount),
        },
      ])
    );

    const series: DailyPurchasesPointDto[] = this.eachDay(range).map((date) => {
      const point = pointByDate.get(date);
      return {
        date,
        orderCount: point?.orderCount ?? 0,
        userCount: point?.userCount ?? 0,
        amount: point?.amount ?? 0,
      };
    });

    const totalsRow = totalsRows[0];
    const totals: PurchasesTotalsDto = {
      orderCount: Number(totalsRow?.orderCount ?? 0),
      userCount: Number(totalsRow?.userCount ?? 0),
      amount: Number(totalsRow?.amount ?? 0),
      refundedCount: Number(refundRows[0]?.count ?? 0),
    };

    const byTier: PurchasesTierBreakdownDto[] = tierRows.map((r) => ({
      tierId: r.tierId,
      tierLevel: r.tierLevel ?? -1,
      tierName: r.tierName,
      orderCount: r.orderCount,
      userCount: r.userCount,
      amount: Number(r.amount),
    }));

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      series,
      totals,
      byTier,
    };
  }

  /**
   * 解析并校验统计区间：
   * - 参数必须为合法 YYYY-MM-DD（拒绝 2026-02-31 类溢出日期）
   * - start ≤ end，跨度 ≤ 365 天
   * - 缺省 endDate=今天（东八区）；缺省 startDate=end-29 天
   */
  private resolveRange(startDate?: string, endDate?: string): ResolvedRange {
    if (startDate && !DATE_PATTERN.test(startDate)) {
      throw new BadRequestException('startDate 必须是 YYYY-MM-DD 格式');
    }
    if (endDate && !DATE_PATTERN.test(endDate)) {
      throw new BadRequestException('endDate 必须是 YYYY-MM-DD 格式');
    }

    const todayCst = this.todayCstDateString();
    const effectiveEnd = endDate ?? todayCst;
    const endDayUtcMs = this.parseDateToUtcMs(effectiveEnd);
    const effectiveStart =
      startDate ??
      this.utcMsToDateString(
        endDayUtcMs - (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY
      );
    const startDayUtcMs = this.parseDateToUtcMs(effectiveStart);

    if (startDayUtcMs > endDayUtcMs) {
      throw new BadRequestException('startDate 不能晚于 endDate');
    }

    const spanDays = (endDayUtcMs - startDayUtcMs) / MS_PER_DAY + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(`统计区间不能超过 ${MAX_RANGE_DAYS} 天`);
    }

    return {
      startDate: effectiveStart,
      endDate: effectiveEnd,
      startUtc: new Date(startDayUtcMs - CST_OFFSET_MS),
      endUtcExclusive: new Date(endDayUtcMs + MS_PER_DAY - CST_OFFSET_MS),
    };
  }

  /** 今天在东八区的日期字符串（YYYY-MM-DD） */
  private todayCstDateString(): string {
    return this.utcMsToDateString(Date.now() + CST_OFFSET_MS);
  }

  private utcMsToDateString(utcMs: number): string {
    return new Date(utcMs).toISOString().slice(0, 10);
  }

  /**
   * 严格解析 YYYY-MM-DD 为该日 UTC 零点毫秒值。
   * 通过 Date.UTC 往返校验拒绝溢出日期（如 2026-02-31）。
   */
  private parseDateToUtcMs(dateStr: string): number {
    const [year, month, day] = dateStr.split('-').map(Number);
    const utcMs = Date.UTC(year, month - 1, day);
    if (this.utcMsToDateString(utcMs) !== dateStr) {
      throw new BadRequestException(`非法日期：${dateStr}`);
    }
    return utcMs;
  }

  /** 枚举 [startDate, endDate] 内的每个日期字符串（东八区自然日） */
  private eachDay(range: ResolvedRange): string[] {
    const dates: string[] = [];
    const startMs = this.parseDateToUtcMs(range.startDate);
    const endMs = this.parseDateToUtcMs(range.endDate);
    for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
      dates.push(this.utcMsToDateString(ms));
    }
    return dates;
  }
}
