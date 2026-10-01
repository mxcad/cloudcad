import { describe, expect, it } from 'vitest';

import {
  centsToYuan,
  orderAmountCents,
  originalAmountCents,
} from './price';

describe('@cloudcad/platform · billing/price', () => {
  it('orderAmountCents = round(月价 × bps × 月数 / 10000)', () => {
    expect(orderAmountCents(19900, 10000, 1)).toBe(19900);
    expect(orderAmountCents(19900, 9000, 12)).toBe(214920);
    expect(orderAmountCents(100, 3333, 1)).toBe(33);
  });

  it('originalAmountCents = round(月价 × 月数)', () => {
    expect(originalAmountCents(19900, 12)).toBe(238800);
    expect(originalAmountCents(100, 3)).toBe(300);
  });

  it('centsToYuan 固定两位小数；非有限值兜底 0.00', () => {
    expect(centsToYuan(1990)).toBe('19.90');
    expect(centsToYuan(0)).toBe('0.00');
    expect(centsToYuan(Number.NaN)).toBe('0.00');
    expect(centsToYuan(Number.POSITIVE_INFINITY)).toBe('0.00');
  });
});
