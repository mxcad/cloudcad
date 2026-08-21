import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface MembershipInfo {
  tierLevel: number;
  isVip: boolean;
  expiresAt: string | null;
  daysRemaining: number;
}

export function useMembership(): MembershipInfo | null {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) return null;

    const tierLevel = user.membershipTierLevel ?? 0;
    const expiresAt = user.membershipExpiresAt ?? null;

    let daysRemaining = 0;
    if (expiresAt) {
      const diff = new Date(expiresAt).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diff / 86_400_000));
    }

    // 永久会员（tierLevel > 0 且 expiresAt 为 null）视为永久有效
    const isPermanent = tierLevel > 0 && expiresAt === null;

    return {
      tierLevel,
      isVip: tierLevel > 0 && (isPermanent || daysRemaining > 0),
      expiresAt,
      daysRemaining: isPermanent ? Number.POSITIVE_INFINITY : daysRemaining,
    };
  }, [user]);
}
