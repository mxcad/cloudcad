import { t } from '@/languages';
import {
  SHARE_EXPIRATION_VALUES,
  computeExpiresAtIso,
  detectShareExpiration,
  isShareExpired,
} from '@cloudcad/platform';
import type { ShareExpirationOption } from '@cloudcad/platform';

export type ExpirationOption = ShareExpirationOption;

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

// 预设秒数 / 反推选中项 / 到期时间计算 / 过期判定已收敛到 @cloudcad/platform（与移动端共用）
export const EXPIRATION_VALUES = SHARE_EXPIRATION_VALUES;

export function detectExpiration(expiresAt: string | null): {
  option: ExpirationOption;
  customDays: number;
} {
  return detectShareExpiration(expiresAt);
}

export function computeExpiresAt(
  expiration: ExpirationOption,
  customDays: number
): string | null {
  return computeExpiresAtIso(expiration, customDays);
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
