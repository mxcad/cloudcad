export const PAGE_SIZE = 10;

// label 存中文源串（语言中立），渲染期由消费方走 t() 按当前语言取值，
// 避免模块加载期烘焙初始语言导致切换语言后不刷新
export const ORDER_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: '待支付', color: 'warning' },
  SUCCEEDED: { label: '已支付', color: 'success' },
  FAILED: { label: '支付失败', color: 'error' },
  REFUNDED: { label: '已退款', color: 'neutral' },
  CLOSED: { label: '已关闭', color: 'neutral' },
  TIMEOUT: { label: '已超时', color: 'neutral' },
};

export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(ORDER_STATUS_META).map(([value, { label }]) => ({
    value,
    label,
  })),
];

export const REFUND_APPLICATION_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: '待审核', color: 'warning' },
  APPROVED: { label: '已通过', color: 'success' },
  REJECTED: { label: '已驳回', color: 'neutral' },
};

export const REFUND_APPLICATION_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
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
