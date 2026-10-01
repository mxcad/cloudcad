import { describe, expect, it } from 'vitest';

import { relativeTime } from './relative';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('@cloudcad/platform · format/relative', () => {
  it('<60s → just_now；未来/负值归 just_now（不出现负数）', () => {
    expect(relativeTime(ago(30 * 1000), NOW)).toEqual({ tier: 'just_now' });
    expect(relativeTime(ago(-10 * MIN), NOW)).toEqual({ tier: 'just_now' });
  });

  it('档位边界：分 / 时 / 天 / 周 / 月 / 年', () => {
    // 整 60s → 1 分钟（档位下界含）
    expect(relativeTime(ago(MIN), NOW)).toEqual({
      tier: 'amount',
      unit: 'minute',
      value: 1,
    });
    expect(relativeTime(ago(5 * MIN), NOW)).toEqual({
      tier: 'amount',
      unit: 'minute',
      value: 5,
    });
    expect(relativeTime(ago(3 * HOUR), NOW)).toEqual({
      tier: 'amount',
      unit: 'hour',
      value: 3,
    });
    expect(relativeTime(ago(2 * DAY), NOW)).toEqual({
      tier: 'amount',
      unit: 'day',
      value: 2,
    });
    expect(relativeTime(ago(10 * DAY), NOW)).toEqual({
      tier: 'amount',
      unit: 'week',
      value: 1,
    });
    expect(relativeTime(ago(45 * DAY), NOW)).toEqual({
      tier: 'amount',
      unit: 'month',
      value: 1,
    });
    expect(relativeTime(ago(400 * DAY), NOW)).toEqual({
      tier: 'amount',
      unit: 'year',
      value: 1,
    });
  });
});
