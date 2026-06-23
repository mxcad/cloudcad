import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MembershipTier } from './enums/billing.enum';
import type { MembershipPlan } from '@prisma/client';

type PrismaTx = Omit<DatabaseService, '$on' | '$connect' | '$disconnect' | '$use' | '$transaction' | '$extends'>;

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  static readonly TIER_WEIGHT: Record<string, number> = {
    [MembershipTier.FREE]: 0,
    [MembershipTier.PRO]: 1,
    [MembershipTier.ENTERPRISE]: 2,
  };

  constructor(private prisma: DatabaseService) {}

  async activate(
    tx: PrismaTx,
    userId: string,
    plan: MembershipPlan,
  ) {
    const existing = await tx.userMembership.findUnique({ where: { userId } });
    const now = new Date();
    const base = existing?.expiresAt && existing.expiresAt > now
      ? existing.expiresAt
      : now;
    const newExpiresAt = new Date(base.getTime() + plan.durationDays * 86400000);

    const currentWeight = existing
      ? MembershipService.TIER_WEIGHT[existing.tier] ?? 0
      : 0;
    const effectiveTier = currentWeight > MembershipService.TIER_WEIGHT[plan.tier]
      ? existing!.tier
      : plan.tier;

    return tx.userMembership.upsert({
      where: { userId },
      create: { userId, tier: plan.tier as MembershipTier, expiresAt: newExpiresAt },
      update: { tier: effectiveTier as MembershipTier, expiresAt: newExpiresAt },
    });
  }

  async getMembership(userId: string) {
    const m = await this.prisma.userMembership.findUnique({ where: { userId } });
    if (!m || !m.expiresAt || m.expiresAt <= new Date()) {
      return { tier: MembershipTier.FREE, expiresAt: null, daysRemaining: 0 };
    }
    return {
      tier: m.tier,
      expiresAt: m.expiresAt,
      daysRemaining: Math.ceil((m.expiresAt.getTime() - Date.now()) / 86400000),
    };
  }

  async getEffectiveTier(userId: string): Promise<MembershipTier> {
    const m = await this.prisma.userMembership.findUnique({ where: { userId } });
    if (!m || !m.expiresAt || m.expiresAt <= new Date()) return MembershipTier.FREE;
    return m.tier as MembershipTier;
  }
}
