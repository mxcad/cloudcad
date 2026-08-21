import { describe, it, expect } from 'vitest';
import {
  formatYuan,
  centsToYuan,
  calculatePriceInCents,
  calculateOriginalPriceInCents,
} from './priceUtils';

describe('calculatePriceInCents', () => {
  // 与后端 billing.service.createOrder 同一公式：round(月价 × bps/10000 × 月数)
  // worked examples 与 backend billing.service.spec.ts 的 priceCases 保持一致
  const cases: Array<{ name: string; base: number; bps: number; months: number; expected: number }> = [
    { name: 'VIP1 1个月 无折扣', base: 1500, bps: 10000, months: 1, expected: 1500 },
    { name: 'VIP1 3个月 95折', base: 1500, bps: 9500, months: 3, expected: 4275 },
    { name: 'VIP2 3个月 95折', base: 3000, bps: 9500, months: 3, expected: 8550 },
    { name: 'VIP2 6个月 86折', base: 3000, bps: 8600, months: 6, expected: 15480 },
    { name: 'VIP2 12个月 7折', base: 3000, bps: 7000, months: 12, expected: 25200 },
    { name: 'VIP3 12个月 7折', base: 6000, bps: 7000, months: 12, expected: 50400 },
  ];

  it.each(cases)('$name → $expected 分', ({ base, bps, months, expected }) => {
    expect(calculatePriceInCents(base, bps, months)).toBe(expected);
  });

  it('rounds fractional cents instead of truncating', () => {
    expect(calculatePriceInCents(1000, 9555, 1)).toBe(956);
  });
});

describe('calculateOriginalPriceInCents', () => {
  it('computes undiscounted total in cents', () => {
    expect(calculateOriginalPriceInCents(3000, 3)).toBe(9000);
  });

  it('rounds fractional cents', () => {
    expect(calculateOriginalPriceInCents(1000, 12)).toBe(12000);
  });
});

describe('formatYuan / centsToYuan', () => {
  it('formats yuan to 2 decimals', () => {
    expect(formatYuan(85.5)).toBe('85.50');
  });

  it('converts cents to yuan string', () => {
    expect(centsToYuan(8550)).toBe('85.50');
    expect(centsToYuan(3000)).toBe('30.00');
  });
});
