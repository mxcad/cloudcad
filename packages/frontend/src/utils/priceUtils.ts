import {
  centsToYuan as platformCentsToYuan,
  orderAmountCents,
  originalAmountCents,
} from '@cloudcad/platform';

export function formatYuan(yuan: number): string {
  return yuan.toFixed(2);
}

// 计价公式与分→元换算已收敛到 @cloudcad/platform（与移动端共用，
// 公式与后端 BillingService.createOrder 一致）
export function centsToYuan(cents: number): string {
  return platformCentsToYuan(cents);
}

/**
 * 折扣后订单金额（单位：分）。
 * 与后端 billing.service.createOrder 保持一致：
 * round(月价 × multiplierBps/10000 × 月数)
 */
export function calculatePriceInCents(
  baseMonthlyPrice: number,
  multiplierBps: number,
  months: number
): number {
  return orderAmountCents(baseMonthlyPrice, multiplierBps, months);
}

/**
 * 无折扣原价（单位：分）：round(月价 × 月数)
 */
export function calculateOriginalPriceInCents(
  baseMonthlyPrice: number,
  months: number
): number {
  return originalAmountCents(baseMonthlyPrice, months);
}
