///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { MembershipService, MONTH_DAYS, projectMembership } from '../../vip/membership.service';
import { DatabaseService } from '../../database/database.service';

/**
 * 注册赠送会员（Registration Gift）。
 *
 * 语义（用户 2026-10-29 拍板）：
 * - 任何自服务方式新开账号，创建成功后自动赠送 VIP1 会员 N 个月（N = registerGiftMonths，默认 1）。
 * - 同一账号只送一次：以 userMembership.metadata 上的 `registerGiftGrantedAt` 标记判定，
 *   已送过的不再送（含会员已过期/降级的情况）。
 * - best-effort：赠送失败绝不阻断注册主流程（打日志，不抛）。
 * - 等级固定 VIP1（level 1），不新增等级配置键（用户拍板）。
 */
@Injectable()
export class RegistrationGiftService {
  private readonly logger = new Logger(RegistrationGiftService.name);

  /** "已赠送"标记键：挂在 userMembership.metadata 上，与既有 externalVipExpiresAt 键不冲突 */
  private static readonly GIFT_MARKER_KEY = 'registerGiftGrantedAt';

  /** 赠送等级固定 VIP1 基础档（用户拍板，不新增配置键） */
  private static readonly GIFT_TIER_LEVEL = 1;

  constructor(
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly membershipService: MembershipService,
    private readonly prisma: DatabaseService,
  ) {}

  /**
   * 按运行时配置赠送注册会员。仅当 registerGiftEnabled=true 且 registerGiftMonths>0 且
   * 该账号未赠送过且 VIP1 档位存在/启用时才执行。**永不抛错**（best-effort）。
   *
   * 调用时机：自服务建号成功后（7 个建号点），在令牌签发前。
   */
  async grantGiftIfEnabled(userId: string): Promise<void> {
    try {
      const enabled = await this.runtimeConfigService.getValue<boolean>(
        'registerGiftEnabled',
      );
      if (!enabled) return;

      const months = await this.runtimeConfigService.getValue<number>(
        'registerGiftMonths',
      );
      if (!months || months <= 0) return;

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.userMembership.findUnique({
          where: { userId },
        });
        const metadata = (existing?.metadata ?? {}) as Record<string, unknown>;

        // 已送过：始终不再送（含会员已过期/降级的情况）
        if (metadata[RegistrationGiftService.GIFT_MARKER_KEY]) {
          return;
        }

        const tier = await tx.vipTier.findUnique({
          where: { level: RegistrationGiftService.GIFT_TIER_LEVEL },
        });
        if (!tier || !tier.isActive) {
          this.logger.warn(
            `注册赠送跳过：VIP${RegistrationGiftService.GIFT_TIER_LEVEL} 档位缺失或未启用 userId=${userId}`,
          );
          return;
        }

        // ADR-0036 写侧唯一入口；新用户无旧会员记录，直接 now + months*MONTH_DAYS
        await this.membershipService.activate(
          tx,
          userId,
          { level: tier.level, baseMonthlyPrice: tier.baseMonthlyPrice },
          months * MONTH_DAYS,
        );

        // 打"已赠送"标记（与 activate 同事务，保证只送一次原子生效）
        await tx.userMembership.update({
          where: { userId },
          data: {
            metadata: {
              ...metadata,
              [RegistrationGiftService.GIFT_MARKER_KEY]: new Date().toISOString(),
            },
          },
        });

        this.logger.log(
          `注册赠送成功: userId=${userId}, months=${months}, tier=VIP${tier.level}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `注册赠送失败（best-effort，不阻断注册）: userId=${userId}, ${(error as Error).message}`,
      );
    }
  }

  /**
   * 读侧：把某用户的会员状态展平为前端契约字段（ADR-0036 `projectMembership` 单点判定）。
   *
   * 为什么需要：注册赠送后新用户立即是 VIP1，但 register 响应的 user 只含基础字段
   * （userService.create 不带 membership 关系），前端 useMembership() 读
   * user.membershipTierLevel 恒 0 → VIP 徽章不渲染。注册/登录响应的 user 契约本就允许
   * 携带会员字段（SDK User 类型可选字段，login 响应已带），此方法统一补齐该出口。
   *
   * 未赠送/赠送失败/会员已过期时返回降级态（tierLevel 0、isVip false），与 login 一致。
   */
  async getMembershipProjection(userId: string): Promise<{
    membershipTierLevel: number;
    membershipExpiresAt: string | null;
    isVip: boolean;
    membershipTier: string;
  }> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
    });
    const p = projectMembership(membership);
    return {
      membershipTierLevel: p.tierLevel,
      membershipExpiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      isVip: p.isVip,
      membershipTier: p.tier,
    };
  }
}
