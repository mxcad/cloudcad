import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import type { IMembershipService, VipTierActivateInput } from '@cloudcad/contracts';
import { membershipTierOf } from './membership-tier';
import {
  IQuotaCacheInvalidator,
  type QuotaCacheInvalidator,
} from '../common/interfaces/quota-cache-invalidator';

type PrismaTx = Prisma.TransactionClient;

/** "月 = 30 天"约定单点定义（写侧/读侧共用）：billing 等消费者引用本常量，禁止各自手写 months * 30 */
export const MONTH_DAYS = 30;

export const DAY_MS = 86400000;

export interface MembershipResult {
  tierLevel: number;
  expiresAt: Date | null;
  daysRemaining: number;
}

export interface EffectiveMembership {
  tierLevel: number;
  configs: Record<string, unknown>;
}

/** 有效会员判定（"有效"语义单点，ADR-0036）：expiresAt 为空视为永久有效，仅 expiresAt 为过去时间才算过期 */
export const isActiveMembership = (
  m: { tierLevel: number; expiresAt: Date | null } | null
): boolean => {
  return !!m && !(m.expiresAt && m.expiresAt <= new Date());
};

/**
 * 有效会员行 → 扁平展示投影（读侧单点，取代各消费方内联重算）：
 * 有效 = membership 存在 && (expiresAt 为 null 永久 || 未过期)；过期/失效统一降级为 0/null。
 * 消费方（user-crud / users）禁止再各自内联该判定——历史漂移：users 侧曾漏 `tier` 字段，
 * 桌面客户端契约在 updateProfile 响应上取不到 membershipTier。
 */
export const projectMembership = (
  row: { tierLevel: number; expiresAt: Date | null } | null,
): {
  tierLevel: number;
  expiresAt: Date | null;
  isVip: boolean;
  tier: string;
} => {
  const valid = isActiveMembership(row);
  const tierLevel = valid ? row!.tierLevel : 0;
  return {
    tierLevel,
    expiresAt: valid ? row!.expiresAt : null,
    isVip: tierLevel > 0,
    tier: membershipTierOf(tierLevel),
  };
};

/** 退款重算入参：billing 查询 paymentOrder 后映射传入（数据获取留 billing，数学归位 membership） */
export interface RecalculateOrderInput {
  vipTierLevel: number;
  months: number;
  paidAt: Date | null;
}

@Injectable()
export class MembershipService implements IMembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private prisma: DatabaseService,
    // 配额缓存失效 seam（@Optional：未接线 StorageQuotaModule 的模块降级为 no-op）
    @Optional()
    @Inject(IQuotaCacheInvalidator)
    private readonly quotaCacheInvalidator?: QuotaCacheInvalidator
  ) {}

  /**
   * 激活会员（写侧唯一入口，ADR-0036）：内部完成旧等级价格查询 → 升级折算 → 续期/永久保持/等级 max。
   * billing 只做 "months → 天" 换算后调用本方法。
   */
  async activate(
    tx: PrismaTx,
    userId: string,
    vipTier: VipTierActivateInput,
    purchasedDays: number
  ): Promise<Prisma.UserMembershipGetPayload<object>> {
    const existing = await tx.userMembership.findUnique({ where: { userId } });
    const now = new Date();

    const effectiveDays = await this.calculateUpgradeExtraDays(
      tx,
      existing,
      vipTier,
      purchasedDays
    );

    // 永久会员（expiresAt 为 null 且等级 >0）保持永久，仅提升等级，不覆盖为有时限
    let updated: Prisma.UserMembershipGetPayload<object>;
    if (existing && !existing.expiresAt && existing.tierLevel > 0) {
      updated = await tx.userMembership.update({
        where: { userId },
        data: { tierLevel: Math.max(existing.tierLevel, vipTier.level) },
      });
    } else {
      const existingActive =
        existing && existing.expiresAt && existing.expiresAt > now;
      const base =
        existing?.expiresAt && existing.expiresAt > now
          ? existing.expiresAt
          : now;
      const newExpiresAt = new Date(base.getTime() + effectiveDays * DAY_MS);

      const effectiveTierLevel = existingActive
        ? Math.max(existing.tierLevel, vipTier.level)
        : vipTier.level;

      updated = await tx.userMembership.upsert({
        where: { userId },
        create: { userId, tierLevel: vipTier.level, expiresAt: newExpiresAt },
        update: { tierLevel: effectiveTierLevel, expiresAt: newExpiresAt },
      });
    }

    // 配额变更后失效配额缓存（seam 避免 vip→file-system 依赖环；
    // 此前 activate 从不失效，非 billing 路径激活后旧配额最长滞留 5min TTL）
    await this.quotaCacheInvalidator?.invalidateQuotaCache(userId);
    return updated;
  }

  /**
   * 升级折算（自 billing 迁入，数学归位）：旧等级剩余天数 × 旧月价 / 新月价，向下取整。
   * 仅"升档且旧会员仍有效"时折算；新档月价 <= 0（除零保护）、旧等级价格缺失、同档/降档、
   * 过期会员一律原样返回 purchasedDays。
   */
  private async calculateUpgradeExtraDays(
    tx: PrismaTx,
    existing: Prisma.UserMembershipGetPayload<object> | null,
    newTier: VipTierActivateInput,
    purchasedDays: number
  ): Promise<number> {
    // 新档位月价 <= 0 时避免除零（剩余天数折算会产生 Infinity → Invalid Date）
    if (newTier.baseMonthlyPrice <= 0) return purchasedDays;

    if (
      !existing ||
      existing.tierLevel >= newTier.level ||
      !existing.expiresAt ||
      existing.expiresAt <= new Date()
    ) {
      return purchasedDays;
    }
    const oldTier = await tx.vipTier.findUnique({
      where: { level: existing.tierLevel },
    });
    if (!oldTier || oldTier.baseMonthlyPrice <= 0) return purchasedDays;

    const remainingMs = existing.expiresAt.getTime() - Date.now();
    const remainingDays = remainingMs / DAY_MS;
    const extraDays = Math.floor(
      (remainingDays * oldTier.baseMonthlyPrice) / newTier.baseMonthlyPrice
    );

    return purchasedDays + extraDays;
  }

  /**
   * 外部水位守卫（单点，供退款重算与管理员直改共用）：externalVipExpiresAt 承载旧官网
   * vipTime（未来时间戳），有效时该会员的本地 expiresAt/tierLevel 由外部锚点推导，任何非外部
   * 写入方都不应触碰——否则下一次增量 VIP 同步基于被污染的水位重算。
   * 字段名明确语义，避免按字段名误写"上次同步时间"（过去时间戳）导致 ts > Date.now() 恒 false、
   * 保护失效（外部来源会员被错误清零/覆盖）。外部同步写入见 ADR-0018。
   */
  async hasValidExternalWatermark(
    tx: PrismaTx,
    userId: string
  ): Promise<boolean> {
    const membership = await tx.userMembership.findUnique({ where: { userId } });
    const metadata = membership?.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const externalExpiresAt = (metadata as Prisma.JsonObject)
        .externalVipExpiresAt;
      if (typeof externalExpiresAt === 'string') {
        const ts = new Date(externalExpiresAt).getTime();
        if (!Number.isNaN(ts) && ts > Date.now()) return true;
      }
    }
    return false;
  }

  /**
   * 退款后会员水位重算（自 billing 迁入，数学归位）：按 paidAt 升序游标叠加剩余订单
   * 月数水位（月 = MONTH_DAYS 天），取 maxTier；externalVipExpiresAt 外部水位有效时保护不写；
   * 全过期/空订单清零等级（避免激活时 Math.max 继承高等级造成等级通胀）。
   * billing 负责查询 paymentOrder 并映射传入，本方法不跨域依赖 paymentOrder。
   */
  async recalculateFromOrders(
    tx: PrismaTx,
    userId: string,
    orders: RecalculateOrderInput[]
  ): Promise<void> {
    if (orders.length === 0) {
      if (await this.hasValidExternalWatermark(tx, userId)) {
        this.logger.warn(`退款重算跳过外部同步来源会员: userId=${userId}`);
        return;
      }
      await tx.userMembership.upsert({
        where: { userId },
        create: {
          userId,
          expiresAt: null,
          tierLevel: 0,
        },
        update: { expiresAt: null, tierLevel: 0 },
      });
      return;
    }

    const sorted = [...orders].sort(
      (a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0)
    );

    const now = new Date();
    let cursor = new Date(0);
    let maxTierLevel = 0;

    for (const r of sorted) {
      if (r.vipTierLevel > maxTierLevel) maxTierLevel = r.vipTierLevel;
      // paidAt 缺失的异常行不推进游标，但保留 maxTier 贡献（与迁移前语义一致）
      if (!r.paidAt) continue;
      const base = cursor > r.paidAt ? cursor : r.paidAt;
      cursor = new Date(base.getTime() + r.months * MONTH_DAYS * DAY_MS);
    }

    if (cursor.getTime() === 0 || Number.isNaN(cursor.getTime()))
      cursor = now;

    // 剩余订单全部过期：清零等级，避免激活时 Math.max 继承高等级造成等级通胀
    if (cursor <= now) {
      if (await this.hasValidExternalWatermark(tx, userId)) {
        this.logger.warn(`退款重算跳过外部同步来源会员: userId=${userId}`);
        return;
      }
      await tx.userMembership.upsert({
        where: { userId },
        create: {
          userId,
          tierLevel: 0,
          expiresAt: now,
        },
        update: { tierLevel: 0, expiresAt: now },
      });
      return;
    }

    await tx.userMembership.upsert({
      where: { userId },
      create: {
        userId,
        tierLevel: maxTierLevel,
        expiresAt: cursor,
      },
      update: {
        tierLevel: maxTierLevel,
        expiresAt: cursor,
      },
    });
  }

  async getMembership(userId: string): Promise<MembershipResult> {
    const m = await this.prisma.userMembership.findUnique({
      where: { userId },
    });
    if (!m || (m.expiresAt && m.expiresAt <= new Date())) {
      return { tierLevel: 0, expiresAt: null, daysRemaining: 0 };
    }
    // 永久会员（expiresAt 为 null 且等级 >0）视为永久有效，daysRemaining 用 Infinity 表示"永久"
    if (m.expiresAt === null) {
      return m.tierLevel > 0
        ? {
            tierLevel: m.tierLevel,
            expiresAt: null,
            daysRemaining: Number.POSITIVE_INFINITY,
          }
        : { tierLevel: 0, expiresAt: null, daysRemaining: 0 };
    }
    return {
      tierLevel: m.tierLevel,
      expiresAt: m.expiresAt,
      daysRemaining: Math.ceil((m.expiresAt.getTime() - Date.now()) / 86400000),
    };
  }

  /**
   * 读侧唯一深查询（ADR-0036）：一次快照取 membership + vipTier + 注册表默认值，
   * 返回合并后的有效配置（registry defaultValue 为底，tier configs 覆盖）。
   * 消费方禁止再自行 userMembership.findUnique + vipTier.findUnique 推导。
   */
  async getEffectiveMembership(userId: string): Promise<EffectiveMembership> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
    });
    const effectiveLevel = isActiveMembership(membership)
      ? membership.tierLevel
      : 0;

    const [tier, registryKeys] = await Promise.all([
      this.prisma.vipTier.findUnique({ where: { level: effectiveLevel } }),
      this.prisma.configKeyRegistry.findMany({
        select: { key: true, defaultValue: true },
      }),
    ]);

    const defaults = Object.fromEntries(
      registryKeys.map((k) => [k.key, k.defaultValue as Prisma.JsonValue])
    );

    return {
      tierLevel: effectiveLevel,
      configs: {
        ...defaults,
        ...((tier?.configs ?? {}) as Record<string, unknown>),
      },
    };
  }

  async getEffectiveTier(userId: string): Promise<number> {
    const { tierLevel } = await this.getEffectiveMembership(userId);
    return tierLevel;
  }

  /**
   * 配额 key 有效值解析（ADR-0036）：由快照推导，缺失 key 回落注册表默认值；
   * 执行（strategy）与展示（storage-info / user-crud）走同一条解析路径。
   */
  async getQuota(userId: string, key: string): Promise<number> {
    const { configs } = await this.getEffectiveMembership(userId);
    const value = configs[key];
    return typeof value === 'number' ? value : 0;
  }

  /**
   * 过期会员批量降级（写侧单点，自 billing-cron 迁入）：expiresAt 已过期（非 null）的会员
   * 统一降级为 tierLevel=0 / expiresAt=null，并逐个失效配额缓存（seam 避免 vip→file-system 环）。
   * 返回降级条数。billing 定时/手动触发共用本方法，禁止再自行 userMembership.updateMany。
   */
  async expireOverdueMemberships(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.userMembership.findMany({
      where: { expiresAt: { lte: now, not: null } },
      select: { userId: true },
    });
    const { count } = await this.prisma.userMembership.updateMany({
      where: { expiresAt: { lte: now, not: null } },
      data: { tierLevel: 0, expiresAt: null },
    });
    if (count > 0) {
      for (const m of expired) {
        await this.quotaCacheInvalidator?.invalidateQuotaCache(m.userId);
      }
    }
    return count;
  }

  /**
   * 删除指定用户的会员记录（写侧单点，自 user-cleanup 迁入）：在调用方事务内执行，
   * 供账号清理统一走 MembershipService，禁止再自行 tx.userMembership.deleteMany。
   */
  async deleteMembershipForUser(
    tx: PrismaTx,
    userId: string
  ): Promise<number> {
    const { count } = await tx.userMembership.deleteMany({ where: { userId } });
    return count;
  }
}
