import { t } from '@/languages';

export const PAGE_SIZE = 10;

export const ORDER_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: t('待支付'), color: 'warning' },
  SUCCEEDED: { label: t('已支付'), color: 'success' },
  FAILED: { label: t('支付失败'), color: 'error' },
  REFUNDED: { label: t('已退款'), color: 'neutral' },
  CLOSED: { label: t('已关闭'), color: 'neutral' },
  TIMEOUT: { label: t('已超时'), color: 'neutral' },
};

export const STATUS_OPTIONS = [
  { value: '', label: t('全部状态') },
  ...Object.entries(ORDER_STATUS_META).map(([value, { label }]) => ({
    value,
    label,
  })),
];

export const REFUND_APPLICATION_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: t('待审核'), color: 'warning' },
  APPROVED: { label: t('已通过'), color: 'success' },
  REJECTED: { label: t('已驳回'), color: 'neutral' },
};

export const REFUND_APPLICATION_STATUS_OPTIONS = [
  { value: '', label: t('全部状态') },
  ...Object.entries(REFUND_APPLICATION_STATUS_META).map(
    ([value, { label }]) => ({ value, label })
  ),
];

export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

export function decimalToBps(decimal: number): number {
  return Math.round(decimal * 10000);
}

export function discountPercent(bps: number): number {
  return Math.round((1 - bps / 10000) * 100);
}
