import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { billingControllerGetMembership } from '@/api-sdk';

interface MembershipInfo {
  tier: string;
  expiresAt: string | null;
  daysRemaining: number;
}

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  PRO: { label: 'Pro', bg: 'var(--accent-100)', text: 'var(--accent-700)' },
  ENTERPRISE: { label: 'Enterprise', bg: 'var(--primary-100)', text: 'var(--primary-700)' },
};

let cachedMembership: { data: MembershipInfo; ts: number; userId: string } | null = null;
const CACHE_TTL = 120000;

export default function MembershipBadge() {
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (cachedMembership && cachedMembership.userId === user.id && Date.now() - cachedMembership.ts < CACHE_TTL) {
      setMembership(cachedMembership.data);
      return;
    }
    (async () => {
      try {
        const res = await billingControllerGetMembership();
        const info = res?.data;
        if (info) {
          const data = info as unknown as MembershipInfo;
          cachedMembership = { data, ts: Date.now(), userId: user.id };
          setMembership(data);
        }
      } catch {
        // 忽略错误，不显示徽章
      }
    })();
  }, [user]);

  if (!membership || membership.tier === 'FREE' || membership.daysRemaining <= 0) return null;

  const config = TIER_CONFIG[membership.tier];
  if (!config) return null;

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ml-1"
      style={{ background: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  );
}
