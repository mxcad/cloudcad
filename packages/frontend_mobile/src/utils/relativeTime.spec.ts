import { describe, it, expect } from 'vitest';
import { relativeTime } from '@cloudcad/platform';

// 锁 platform 纯函数 relativeTime 的 tier/value 契约（i18n 文案留端包，不在此测）。
// 期望值全部手算（独立真值源），now 固定为 2026-01-10T12:00:00Z。
const NOW = new Date('2026-01-10T12:00:00.000Z').getTime();

describe('relativeTime (platform 纯计算)', () => {
  it('<60s → just_now', () => {
    expect(relativeTime('2026-01-10T11:59:30.000Z', NOW)).toEqual({ tier: 'just_now' });
    // 未来/负值也归 just_now（不出现负数）
    expect(relativeTime('2026-01-10T12:00:30.000Z', NOW)).toEqual({ tier: 'just_now' });
  });

  it('分钟档：<60min，value=floor(秒/60)', () => {
    expect(relativeTime('2026-01-10T11:55:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'minute',
      value: 5,
    });
    // 边界：整 60s → 1 分钟
    expect(relativeTime('2026-01-10T11:59:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'minute',
      value: 1,
    });
  });

  it('小时档：<24h，value=floor(秒/3600)', () => {
    expect(relativeTime('2026-01-10T09:00:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'hour',
      value: 3,
    });
  });

  it('天档：<7d，value=floor(秒/86400)', () => {
    expect(relativeTime('2026-01-08T12:00:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'day',
      value: 2,
    });
  });

  it('周档：<30d，value=floor(秒/604800)', () => {
    // 9 天前 → floor(9/7)=1 周
    expect(relativeTime('2026-01-01T12:00:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'week',
      value: 1,
    });
  });

  it('月档：<365d，value=floor(秒/2592000)', () => {
    // 56 天前 → floor(56/30)=1 月
    expect(relativeTime('2025-11-15T12:00:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'month',
      value: 1,
    });
  });

  it('年档：≥365d，value=floor(秒/31536000)', () => {
    // 588 天前 → floor(588/365)=1 年
    expect(relativeTime('2024-06-01T12:00:00.000Z', NOW)).toEqual({
      tier: 'amount',
      unit: 'year',
      value: 1,
    });
  });
});
