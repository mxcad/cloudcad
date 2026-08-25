import React, { useState } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { t } from '@/languages';
import {
  useDailyPurchases,
  useDailyRegistrations,
} from './hooks/useAdminStats';
import { RegistrationsSection } from './components/RegistrationsSection';
import { PurchasesSection } from './components/PurchasesSection';
import type { AdminStatsRangeParams } from './hooks/useAdminStats';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateOnlyToIso, isoToDateOnly } from '@/utils/dateUtils';
import styles from './AdminStatsPage.module.css';

/** 统计切日与后端一致：东八区（UTC+8）自然日 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RangePreset = '7' | '30' | '90' | 'custom';

const cstDateString = (offsetDays: number): string =>
  new Date(Date.now() + CST_OFFSET_MS - offsetDays * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

const PRESET_PARAMS: Record<'7' | '30' | '90', AdminStatsRangeParams> = {
  '7': { startDate: cstDateString(6), endDate: cstDateString(0) },
  '30': { startDate: cstDateString(29), endDate: cstDateString(0) },
  '90': { startDate: cstDateString(89), endDate: cstDateString(0) },
};

const PRESETS: RangePreset[] = ['7', '30', '90'];

/**
 * 运营统计页——每日新增用户 / 每日会员购买。
 * 页面入口需 SYSTEM_USER_READ 或 SYSTEM_BILLING_READ 任一（路由守卫同规则）；
 * 区块按各自权限显隐，无权限的区块不发起请求。
 */
export default function AdminStatsPage() {
  const { hasPermission } = usePermission();
  const canReadUsers = hasPermission(SystemPermission.SYSTEM_USER_READ);
  const canReadBilling = hasPermission(SystemPermission.SYSTEM_BILLING_READ);

  const [preset, setPreset] = useState<RangePreset>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const customReady =
    preset === 'custom' && customStart !== '' && customEnd !== '';
  const rangeParams: AdminStatsRangeParams =
    preset === 'custom'
      ? customReady
        ? { startDate: customStart, endDate: customEnd }
        : {}
      : PRESET_PARAMS[preset];

  const registrations = useDailyRegistrations(rangeParams, canReadUsers);
  const purchases = useDailyPurchases(rangeParams, canReadBilling);

  const effectiveRange = registrations.stats ?? purchases.stats ?? undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('运营统计')}</h1>
        <p>
          {t('统计区间')}
          {effectiveRange
            ? `：${effectiveRange.startDate} ~ ${effectiveRange.endDate}`
            : ''}
        </p>
      </header>

      <div className={styles.rangeBar}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.rangeButton} ${
              preset === p ? styles.rangeButtonActive : ''
            }`}
            onClick={() => setPreset(p)}
          >
            {t('{days} 天', { days: p })}
          </button>
        ))}
        <div className={styles.customDivider} />
        <DatePicker
          value={dateOnlyToIso(customStart)}
          maxDate={dateOnlyToIso(cstDateString(0))}
          onChange={(v) => {
            setCustomStart(isoToDateOnly(v));
            setPreset('custom');
          }}
        />
        <span>~</span>
        <DatePicker
          value={dateOnlyToIso(customEnd)}
          maxDate={dateOnlyToIso(cstDateString(0))}
          onChange={(v) => {
            setCustomEnd(isoToDateOnly(v));
            setPreset('custom');
          }}
        />
      </div>

      {canReadUsers && (
        <RegistrationsSection
          stats={registrations.stats}
          loading={registrations.loading}
        />
      )}

      {canReadBilling && (
        <PurchasesSection stats={purchases.stats} loading={purchases.loading} />
      )}
    </div>
  );
}
