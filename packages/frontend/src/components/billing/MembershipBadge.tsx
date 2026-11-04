import { useMembership } from '@/hooks/useMembership';
import { t } from '@/languages';
import { formatDate } from '@/utils/dateUtils';
import { fillTemplate } from '@/utils/i18nFill';

function formatRemaining(days: number): string {
  // 永久会员 daysRemaining 为 Infinity，直接返回"永久有效"，避免 Infinity 月份
  if (!Number.isFinite(days)) return t('永久有效');
  const m = Math.floor(days / 30);
  const d = days % 30;
  // 双占位符走 fillTemplate：flexvars 正则会把 "X months Y days" 桥接成乱码
  if (m > 0 && d > 0)
    return fillTemplate('剩余 {months} 个月 {days} 天', {
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
    ? formatDate(membership.expiresAt)
    : '';
  const remainText = formatRemaining(membership.daysRemaining);
  const title = !Number.isFinite(membership.daysRemaining)
    ? t('VIP{level} · {remain}', {
        level: String(membership.tierLevel),
        remain: remainText,
      })
    : t('VIP{level} · 有效期至 {date} · {remain}', {
        level: String(membership.tierLevel),
        date: expireDate,
        remain: remainText,
      });

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
