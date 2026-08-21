import type { Prisma } from '@cloudcad/db';

/** 激活/升级入参：等级 + 该等级月价（升级折算依据） */
export interface VipTierActivateInput {
  level: number;
  baseMonthlyPrice: number;
}

export interface IMembershipService {
  activate(
    tx: Prisma.TransactionClient,
    userId: string,
    vipTier: VipTierActivateInput,
    purchasedDays: number,
  ): Promise<Prisma.UserMembershipGetPayload<object>>;
  getMembership(userId: string): Promise<{
    tierLevel: number;
    expiresAt: Date | null;
    daysRemaining: number;
  }>;
  getEffectiveTier(userId: string): Promise<number>;
}
