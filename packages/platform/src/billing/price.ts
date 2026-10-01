/**
 * 会员计价——跨端共享的纯计算。
 *
 * 金额全链路单位为「分」。计价公式与后端 `BillingService.createOrder` 一致：
 *   amount = round(baseMonthlyPrice × multiplierBps × months / 10000)
 * 过去 PC `utils/priceUtils.ts` 与移动端 `utils/billing.ts` 各写一份，
 * 公式改一处漏一处就是两端显示金额不一致。这里收敛为唯一实现。
 */

/** 折扣后订单金额（分）。multiplierBps 为基点（10000=无折扣）。 */
export function orderAmountCents(
  baseMonthlyPrice: number,
  multiplierBps: number,
  months: number
): number {
  return Math.round((baseMonthlyPrice * multiplierBps * months) / 10000);
}

/** 无折扣原价（分）：round(月价 × 月数)。 */
export function originalAmountCents(
  baseMonthlyPrice: number,
  months: number
): number {
  return Math.round(baseMonthlyPrice * months);
}

/** 分 → 元，固定两位小数（1990 → '19.90'）。非有限值兜底 '0.00'。 */
export function centsToYuan(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}
