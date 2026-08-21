import { useMembership } from '@/hooks/useMembership';
import { t } from '@/languages';

function formatRemaining(days: number): string {
  // 永久会员 daysRemaining 为 Infinity，直接返回"永久有效"，避免 Infinity 月份
  if (!Number.isFinite(days)) return t('永久有效');
  const m = Math.floor(days / 30);
  const d = days % 30;
  if (m > 0 && d > 0)
    return t('剩余 {months} 个月 {days} 天', {
      months: String(m),
      days: String(d),
    });
  if (m > 0) return t('剩余 {months} 个月', { months: String(m) });
  return t('剩余 {days} 天', { days: String(d) });
}

export default function MembershipBadge() {
  const membership = useMembership();

  if (!membership || !membership.isVip) return null;

  const label = `VIP${membership.tierLevel}`;
  const expireDate = membership.expiresAt
    ? new Date(membership.expiresAt).toLocaleDateString('zh-CN')
    : '';
  const title = !Number.isFinite(membership.daysRemaining)
    ? `VIP${membership.tierLevel} · ${t('永久有效')}`
    : `VIP${membership.tierLevel} · 有效期至 ${expireDate} · 剩余${formatRemaining(membership.daysRemaining)}`;

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ml-1"
      style={{ background: 'var(--accent-100)', color: 'var(--accent-700)' }}
      title={title}
    >
      {label}
    </span>
  );
}
