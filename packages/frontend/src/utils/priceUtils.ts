export function formatYuan(yuan: number): string {
  return yuan.toFixed(2);
}

export function centsToYuan(cents: number): string {
  return formatYuan(cents / 100);
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
  return Math.round((baseMonthlyPrice * multiplierBps * months) / 10000);
}

/**
 * 无折扣原价（单位：分）：round(月价 × 月数)
 */
export function calculateOriginalPriceInCents(
  baseMonthlyPrice: number,
  months: number
): number {
  return Math.round(baseMonthlyPrice * months);
}
