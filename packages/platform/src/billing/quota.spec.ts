import { describe, expect, it } from 'vitest';

import { resolveQuotaValue, usagePercent } from './quota';

describe('@cloudcad/platform · billing/quota', () => {
  it('usagePercent：total 非正 → 0；used 负/非有限 → 0；封顶 100', () => {
    expect(usagePercent(50, 0)).toBe(0);
    expect(usagePercent(50, -10)).toBe(0);
    expect(usagePercent(-5, 100)).toBe(0);
    expect(usagePercent(Number.NaN, 100)).toBe(0);
    expect(usagePercent(50, 200)).toBe(25);
    expect(usagePercent(300, 200)).toBe(100);
  });

  it('resolveQuotaValue：档位配置优先，缺键回落 registry，非数字归零', () => {
    const registry = new Map([['k', { defaultValue: '512' }]]);
    expect(resolveQuotaValue({ k: 1024 }, 'k', registry)).toBe(1024);
    expect(resolveQuotaValue(undefined, 'k', registry)).toBe(512);
    expect(resolveQuotaValue({ k: 'abc' }, 'k', registry)).toBe(512);
    expect(resolveQuotaValue(undefined, 'missing')).toBe(0);
    expect(resolveQuotaValue({ k: '   ' }, 'k')).toBe(0);
  });
});
