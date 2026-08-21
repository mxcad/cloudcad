import { describe, it, expect } from 'vitest';
import { keepDecimal, clampNumber } from './number';

describe('keepDecimal', () => {
  it('应该保留指定位数小数', () => {
    expect(keepDecimal(3.14159, 2)).toBe(3.14);
    expect(keepDecimal(3.14159, 4)).toBe(3.1416);
  });

  it('整数应正确保留小数', () => {
    expect(keepDecimal(5, 2)).toBe(5);
  });

  it('NaN 输入应返回原值', () => {
    expect(keepDecimal(NaN, 2)).toBe(NaN);
  });
});

describe('clampNumber', () => {
  it('值在范围内应保持不变', () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
  });

  it('超过最大值应返回最大值', () => {
    expect(clampNumber(15, 0, 10)).toBe(10);
  });

  it('低于最小值应返回最小值', () => {
    expect(clampNumber(-5, 0, 10)).toBe(0);
  });
});
