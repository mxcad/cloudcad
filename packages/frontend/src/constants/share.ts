import { t } from '@/languages';

export type ExpirationOption = 'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom';

export const EXPIRATION_LABELS: Record<ExpirationOption, string> = {
  never: t('永不过期'),
  '2h': t('2 小时'),
  '6h': t('6 小时'),
  '12h': t('12 小时'),
  '1d': t('1 天'),
  '3d': t('3 天'),
  '7d': t('7 天'),
  custom: t('自定义'),
};

export const EXPIRATION_VALUES: Record<Exclude<ExpirationOption, 'never' | 'custom'>, number> = {
  '2h': 7200,
  '6h': 21600,
  '12h': 43200,
  '1d': 86400,
  '3d': 259200,
  '7d': 604800,
};

export function getExpiresIn(expiration: ExpirationOption, customDays: number): number | undefined {
  if (expiration === 'custom') return customDays * 86400;
  if (expiration === 'never') return undefined;
  return EXPIRATION_VALUES[expiration];
}

export function detectExpiration(expiresAt: string | null): { option: ExpirationOption; customDays: number } {
  if (!expiresAt) return { option: 'never', customDays: 1 };
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { option: 'never', customDays: 1 };
  if (diff <= 7200 * 1000) return { option: '2h', customDays: 1 };
  if (diff <= 21600 * 1000) return { option: '6h', customDays: 1 };
  if (diff <= 43200 * 1000) return { option: '12h', customDays: 1 };
  if (diff <= 86400 * 1000) return { option: '1d', customDays: 1 };
  if (diff <= 259200 * 1000) return { option: '3d', customDays: 1 };
  if (diff <= 604800 * 1000) return { option: '7d', customDays: 1 };
  return { option: 'custom', customDays: Math.ceil(diff / (86400 * 1000)) };
}

export function computeExpiresAt(expiration: ExpirationOption, customDays: number): string | null {
  if (expiration === 'never') return null;
  if (expiration === 'custom') return new Date(Date.now() + customDays * 86400 * 1000).toISOString();
  return new Date(Date.now() + EXPIRATION_VALUES[expiration] * 1000).toISOString();
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
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}
