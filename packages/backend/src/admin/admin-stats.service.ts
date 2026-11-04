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
  ActiveStatsDto,
  ActiveStatsPointDto,
  DailyPurchasesPointDto,
  DailyPurchasesStatsDto,
  DailyRegistrationsPointDto,
  DailyRegistrationsStatsDto,
  PurchasesTierBreakdownDto,
  PurchasesTotalsDto,
  StatsOverviewDto,
} from './dto/admin-stats.dto';

/** 统计切日固定按东八区（UTC+8）自然日 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** 缺省统计范围：最近 30 个自然日（含今天） */
const DEFAULT_RANGE_DAYS = 30;
/** MAU 滚动窗口：近 30 个自然日（含锚定日） */
const MAU_WINDOW_DAYS = 30;

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

interface OverviewCountRow {
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

interface ActiveStatsRow {
  date: string;
  dau: number;
  mau: number;
}

/**
 * 运营统计服务——总量概览、每日新增用户数、每日会员购买数、活跃用户（DAU/MAU）
 * 的实时聚合视图。
 *
 * 口径（CONTEXT.md）：
 * - 每日新增用户：users.createdAt 按日聚合，排除软删账号（deletedAt IS NULL）
 * - 购买数：PaymentOrder status=SUCCEEDED，按 paidAt 归日（回退 createdAt），
 *   三项计数（订单笔数 / 去重付费用户数 / 金额分值）；退款单单列不扣减
 * - 活跃用户：活跃行为 = 任意审计事件（audit_logs）或成功的高频操作
 *   （登录 / 上传 / 下载，ADR-0045 过滤出 audit_logs、降级记于 user_activity）；
 *   DAU = 当日产生事件的去重用户数（两表并集），MAU = 近 30 天滚动窗口（含锚定日）
 *   去重用户数；KPI 为当前实时值（与统计区间无关），序列按区间零填充
 * - 切日一律为东八区自然日；实时聚合，不落快照表
 * - 归日 SQL 惯用法：Prisma DateTime 落库为 timestamp without time zone（存 UTC 壁钟），
 *   故 `(x + INTERVAL '8 hours')::date` 即东八区自然日，且不依赖 PG 会话 TimeZone
 *   （会话时区随部署机 OS 时区变化，Windows 部署为 +08；若用
 *   `(x AT TIME ZONE 'UTC') + 8h` 再 `::date`，::date 会叠加会话时区造成双重偏移）
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 运营总量概览（与统计区间无关的当前存量）：
   * - totalUsers：当前用户总数（排除软删/注销账号）
   * - paidUsers：累计付费用户数（历史上任意成功支付过去重计数）
   */
  async getOverview(): Promise<StatsOverviewDto> {
    const userRows = await this.prisma.$queryRaw<OverviewCountRow[]>`
      SELECT COUNT(*)::int AS "count"
      FROM users
      WHERE "deletedAt" IS NULL
    `;
    const paidRows = await this.prisma.$queryRaw<OverviewCountRow[]>`
      SELECT COUNT(DISTINCT "userId")::int AS "count"
      FROM payment_orders
      WHERE "status" = ${OrderStatus.SUCCEEDED}
    `;

    return {
      totalUsers: userRows[0]?.count ?? 0,
      paidUsers: paidRows[0]?.count ?? 0,
    };
  }

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

    // 归日惯用法：Prisma DateTime 落为 timestamp without time zone（存 UTC 壁钟），
    // 直接 (x + 8h)::date 即东八区自然日——不依赖 PG 会话 TimeZone；
    // 禁用 (x AT TIME ZONE 'UTC') + 8h 再 ::date 的形态（::date 会叠加会话时区，
    // 会话为 +08 时双重偏移，16:00-24:00 CST 时段事件被归入次日）
    const rows = await this.prisma.$queryRaw<DailyRegistrationRow[]>`
      SELECT to_char(("createdAt" + INTERVAL '8 hours')::date, 'YYYY-MM-DD') AS "date",
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
      SELECT to_char((COALESCE("paidAt", "createdAt") + INTERVAL '8 hours')::date, 'YYYY-MM-DD') AS "date",
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
   * 活跃用户统计（DAU / MAU / 粘性 + 区间日序列）。
   *
   * - KPI 为当前实时值，与统计区间无关：dau=今日 0 点至现在（东八区），
   *   mau=近 30 天滚动窗口（含今日）；stickiness=dau/mau（mau 为 0 时 null）
   * - series 按区间零填充：dau=当日去重活跃用户，mau=以该日为锚的近 30 天
   *   滚动窗口去重值（查询下界向前扩 29 天）
   * - 活跃口径=audit_logs 任意审计事件 ∪ user_activity 成功高频操作
   *   （登录/上传/下载，ADR-0086），按 userId+东八区自然日去重
   */
  async getActiveStats(
    options: { startDate?: string; endDate?: string } = {}
  ): Promise<ActiveStatsDto> {
    const range = this.resolveRange(options.startDate, options.endDate);

    // KPI：当前实时值（东八区今日零点 / 近 30 天窗口起点，均为 UTC 时刻）
    const todayStartUtc = new Date(
      this.parseDateToUtcMs(this.todayCstDateString()) - CST_OFFSET_MS
    );
    const mauWindowStartUtc = new Date(
      todayStartUtc.getTime() - (MAU_WINDOW_DAYS - 1) * MS_PER_DAY
    );

    const dauRows = await this.prisma.$queryRaw<OverviewCountRow[]>`
      SELECT COUNT(*)::int AS "count"
      FROM (
        SELECT DISTINCT "userId"
        FROM audit_logs
        WHERE "createdAt" >= ${todayStartUtc}
        UNION
        SELECT DISTINCT "userId"
        FROM user_activity
        WHERE "createdAt" >= ${todayStartUtc}
      ) u
    `;
    const mauRows = await this.prisma.$queryRaw<OverviewCountRow[]>`
      SELECT COUNT(*)::int AS "count"
      FROM (
        SELECT DISTINCT "userId"
        FROM audit_logs
        WHERE "createdAt" >= ${mauWindowStartUtc}
        UNION
        SELECT DISTINCT "userId"
        FROM user_activity
        WHERE "createdAt" >= ${mauWindowStartUtc}
      ) u
    `;

    const dau = dauRows[0]?.count ?? 0;
    const mau = mauRows[0]?.count ?? 0;
    const stickiness =
      mau > 0 ? Number((dau / mau).toFixed(4)) : null;

    // 序列：user_days 去重 (userId, 东八区自然日)，下界向前扩 29 天供 MAU 窗口；
    // 条件聚合一次算出每日的 dau（当日）与 mau（近 30 天窗口）。
    // 窗口天数是编译期常量，经 Prisma.raw 内联为字面量：Prisma 7 的类型化参数绑定
    // 在 PG 下无法解析 `date - $param`（42883 operator does not exist: date >= integer），
    // 日期参数不受影响（实测仅 date 运算位置的参数触发）
    const extendedStartUtc = new Date(
      range.startUtc.getTime() - (MAU_WINDOW_DAYS - 1) * MS_PER_DAY
    );
    const mauWindowOffset = Prisma.raw(String(MAU_WINDOW_DAYS - 1));
    const seriesRows = await this.prisma.$queryRaw<ActiveStatsRow[]>`
      WITH user_days AS (
        SELECT DISTINCT "userId",
               ("createdAt" + INTERVAL '8 hours')::date AS "day"
        FROM audit_logs
        WHERE "createdAt" >= ${extendedStartUtc}
          AND "createdAt" < ${range.endUtcExclusive}
        UNION
        SELECT DISTINCT "userId",
               ("createdAt" + INTERVAL '8 hours')::date AS "day"
        FROM user_activity
        WHERE "createdAt" >= ${extendedStartUtc}
          AND "createdAt" < ${range.endUtcExclusive}
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS "date",
             COUNT(DISTINCT CASE WHEN ud."day" = d.day THEN ud."userId" END)::int AS "dau",
             COUNT(DISTINCT CASE WHEN ud."day" BETWEEN d.day - ${mauWindowOffset} AND d.day THEN ud."userId" END)::int AS "mau"
      FROM (SELECT generate_series(${range.startDate}::date, ${range.endDate}::date, INTERVAL '1 day')::date AS day) d
      LEFT JOIN user_days ud ON ud."day" BETWEEN d.day - ${mauWindowOffset} AND d.day
      GROUP BY d.day
      ORDER BY d.day
    `;

    const pointByDate = new Map(
      seriesRows.map((r) => [r.date, { dau: r.dau, mau: r.mau }])
    );
    const series: ActiveStatsPointDto[] = this.eachDay(range).map((date) => {
      const point = pointByDate.get(date);
      return {
        date,
        dau: point?.dau ?? 0,
        mau: point?.mau ?? 0,
      };
    });

    return {
      dau,
      mau,
      stickiness,
      startDate: range.startDate,
      endDate: range.endDate,
      series,
    };
  }

  /**
   * 解析并校验统计区间：
   * - 参数必须为合法 YYYY-MM-DD（拒绝 2026-02-31 类溢出日期）
   * - start ≤ end（运营可查任意跨度，不设上限）
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
