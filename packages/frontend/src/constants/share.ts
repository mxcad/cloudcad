import { t } from '@/languages';
import {
  SHARE_EXPIRATION_DEFAULT,
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_CUSTOM_DAYS_MIN,
  SHARE_CUSTOM_DAYS_MAX,
  computeExpiresAtIso,
  computeExpiresInSeconds,
  detectShareExpiration,
  clampCustomDays,
  isShareExpired,
} from '@cloudcad/platform';
import type { ShareExpirationOption } from '@cloudcad/platform';

export type ExpirationOption = ShareExpirationOption;

// 弹窗初值契约（默认档位/默认天数）与天数区间：输入框 min/max 提示与
// 提交时钳制、以及各弹窗的重置路径都引这里的同一来源
export {
  SHARE_EXPIRATION_DEFAULT,
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_CUSTOM_DAYS_MIN,
  SHARE_CUSTOM_DAYS_MAX,
  clampCustomDays,
};

export function getExpirationLabels(): Record<ExpirationOption, string> {
  return {
    never: t('永不过期'),
    '2h': t('2 小时'),
    '6h': t('6 小时'),
    '12h': t('12 小时'),
    '1d': t('1 天'),
    '3d': t('3 天'),
    '7d': t('7 天'),
    custom: t('自定义'),
    immediate: t('立即过期'),
  };
}

/**
 * 反推续期弹窗的初始选中项 + 自定义天数。
 * platform 只在 custom 分支返回天数；其余分支的输入框初值由端侧统一默认值填。
 */
export function detectExpiration(expiresAt: string | null): {
  option: ExpirationOption;
  customDays: number;
} {
  const detected = detectShareExpiration(expiresAt);
  return detected.option === 'custom'
    ? { option: 'custom', customDays: detected.customDays }
    : { option: detected.option, customDays: SHARE_CUSTOM_DAYS_DEFAULT };
}

export function computeExpiresAt(
  expiration: ExpirationOption,
  customDays: number
): string | null {
  return computeExpiresAtIso(expiration, customDays);
}

/** 创建分享要提交的 expiresIn（秒）。never→undefined（不传该字段）。 */
export function computeExpiresIn(
  expiration: ExpirationOption,
  customDays: number
): number | undefined {
  return computeExpiresInSeconds(expiration, customDays);
}

export function formatExpiryDate(dateStr: string | null): string {
  if (!dateStr) return t('永不过期');
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export function isExpired(expiresAt: string | null): boolean {
  return isShareExpired(expiresAt);
}
