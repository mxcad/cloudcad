import { useMemo } from 'react';
import { membershipState } from '@cloudcad/platform';
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

    // 会员判定唯一出口（@cloudcad/platform）：永久会员（tierLevel > 0 且
    // expiresAt 为 null）daysRemaining 为 Infinity，其余下限钳制 ≥0
    const state = membershipState({
      tierLevel: user.membershipTierLevel ?? 0,
      expiresAt: user.membershipExpiresAt ?? null,
    });

    return {
      tierLevel: state.tierLevel,
      isVip: state.isVip,
      expiresAt: user.membershipExpiresAt ?? null,
      daysRemaining: state.daysRemaining,
    };
  }, [user]);
}
