import { useState, useEffect } from 'react';
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

export default function MembershipBadge() {
  const [membership, setMembership] = useState<MembershipInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await billingControllerGetMembership();
        const info = res?.data;
        if (info) setMembership(info as unknown as MembershipInfo);
      } catch {
        // 忽略错误，不显示徽章
      }
    })();
  }, []);

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
