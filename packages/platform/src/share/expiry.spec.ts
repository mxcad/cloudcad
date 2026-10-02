import { describe, expect, it } from 'vitest';

import {
  SHARE_EXPIRATION_VALUES,
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_CUSTOM_DAYS_MAX,
  SHARE_CUSTOM_DAYS_MIN,
  clampCustomDays,
  computeExpiresAtIso,
  computeExpiresInSeconds,
  detectShareExpiration,
  isShareExpired,
} from './expiry';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const SECOND = 1000;
const DAY = 86400 * SECOND;

describe('@cloudcad/platform · share/expiry', () => {
  describe('detectShareExpiration', () => {
    it('null → never', () => {
      expect(detectShareExpiration(null, NOW)).toEqual({ option: 'never' });
    });

    it('非法日期（NaN）→ never（回归：NaN 兜底）', () => {
      expect(detectShareExpiration('not-a-date', NOW)).toEqual({
        option: 'never',
      });
    });

    it('已过期 → immediate', () => {
      expect(detectShareExpiration(iso(NOW - 1000), NOW)).toEqual({
        option: 'immediate',
      });
    });

    it('剩余时间映射到最近预设（边界值含）', () => {
      expect(detectShareExpiration(iso(NOW + 7200 * SECOND), NOW).option).toBe(
        '2h'
      );
      expect(detectShareExpiration(iso(NOW + 21600 * SECOND), NOW).option).toBe(
        '6h'
      );
      expect(detectShareExpiration(iso(NOW + 43200 * SECOND), NOW).option).toBe(
        '12h'
      );
      expect(detectShareExpiration(iso(NOW + 86400 * SECOND), NOW).option).toBe(
        '1d'
      );
      expect(detectShareExpiration(iso(NOW + 259200 * SECOND), NOW).option).toBe(
        '3d'
      );
      expect(detectShareExpiration(iso(NOW + 604800 * SECOND), NOW).option).toBe(
        '7d'
      );
    });

    it('只有 custom 分支带天数，其余分支不出现该字段', () => {
      const nonCustom = [
        detectShareExpiration(null, NOW),
        detectShareExpiration(iso(NOW - 1000), NOW),
        detectShareExpiration(iso(NOW + 3600 * SECOND), NOW),
        detectShareExpiration(iso(NOW + 86400 * SECOND), NOW),
      ];
      for (const d of nonCustom) {
        expect(d.option).not.toBe('custom');
        expect('customDays' in d).toBe(false);
      }
    });

    it('超 7 天 → custom 且天数向上取整', () => {
      expect(detectShareExpiration(iso(NOW + 10 * DAY), NOW)).toEqual({
        option: 'custom',
        customDays: 10,
      });
      expect(detectShareExpiration(iso(NOW + 7.5 * DAY), NOW)).toEqual({
        option: 'custom',
        customDays: 8,
      });
    });

    it('反推天数同样过上限钳制（输入框显示值等于提交后保存值）', () => {
      expect(detectShareExpiration(iso(NOW + 500 * DAY), NOW)).toEqual({
        option: 'custom',
        customDays: SHARE_CUSTOM_DAYS_MAX,
      });
    });
  });

  describe('computeExpiresAtIso', () => {
    it('never → null；immediate → now-1s', () => {
      expect(computeExpiresAtIso('never', 1, NOW)).toBeNull();
      expect(computeExpiresAtIso('immediate', 1, NOW)).toBe(iso(NOW - SECOND));
    });

    it('预设 → now + 预设秒数', () => {
      expect(computeExpiresAtIso('2h', 1, NOW)).toBe(iso(NOW + 7200 * SECOND));
      expect(computeExpiresAtIso('7d', 1, NOW)).toBe(iso(NOW + 604800 * SECOND));
    });

    it('custom 天数钳制到区间 [MIN, MAX]', () => {
      expect(computeExpiresAtIso('custom', 0, NOW)).toBe(iso(NOW + DAY));
      expect(computeExpiresAtIso('custom', -3, NOW)).toBe(iso(NOW + DAY));
      expect(computeExpiresAtIso('custom', 3, NOW)).toBe(iso(NOW + 3 * DAY));
      expect(computeExpiresAtIso('custom', 500, NOW)).toBe(
        iso(NOW + SHARE_CUSTOM_DAYS_MAX * DAY)
      );
    });

    it('custom 天数缺失/越界：NaN 回落默认、+∞ 钳到 MAX，不抛 RangeError', () => {
      // 回归：Math.max 不拦 NaN，曾让 new Date(NaN).toISOString() 抛
      // RangeError: Invalid time value（端侧 parseInt('') 空输入也是这个形态）
      expect(computeExpiresAtIso('custom', Number.NaN, NOW)).toBe(
        iso(NOW + SHARE_CUSTOM_DAYS_DEFAULT * DAY)
      );
      expect(computeExpiresAtIso('custom', Number.POSITIVE_INFINITY, NOW)).toBe(
        iso(NOW + SHARE_CUSTOM_DAYS_MAX * DAY)
      );
      expect(computeExpiresAtIso('custom', '' as unknown as number, NOW)).toBe(
        iso(NOW + SHARE_CUSTOM_DAYS_MIN * DAY)
      );
    });
  });

  describe('computeExpiresInSeconds', () => {
    it('never → undefined（不传字段）；immediate → 1 秒', () => {
      expect(computeExpiresInSeconds('never', 1)).toBeUndefined();
      expect(computeExpiresInSeconds('immediate', 1)).toBe(1);
    });

    it('预设 → 预设秒数；custom 钳制到区间 [MIN, MAX]', () => {
      expect(computeExpiresInSeconds('7d', 1)).toBe(SHARE_EXPIRATION_VALUES['7d']);
      expect(computeExpiresInSeconds('custom', 0)).toBe(86400);
      expect(computeExpiresInSeconds('custom', 3)).toBe(3 * 86400);
      expect(computeExpiresInSeconds('custom', 500)).toBe(
        SHARE_CUSTOM_DAYS_MAX * 86400
      );
    });

    it('custom 天数缺失/越界：NaN 回落默认、+∞ 钳到 MAX，不返回 NaN', () => {
      expect(computeExpiresInSeconds('custom', Number.NaN)).toBe(
        SHARE_CUSTOM_DAYS_DEFAULT * 86400
      );
      expect(computeExpiresInSeconds('custom', Number.POSITIVE_INFINITY)).toBe(
        SHARE_CUSTOM_DAYS_MAX * 86400
      );
    });
  });

  describe('isShareExpired', () => {
    it('null → false；到期/过去 → true；未来 → false；非法 → false', () => {
      expect(isShareExpired(null, NOW)).toBe(false);
      expect(isShareExpired(iso(NOW), NOW)).toBe(true);
      expect(isShareExpired(iso(NOW - 1000), NOW)).toBe(true);
      expect(isShareExpired(iso(NOW + 1000), NOW)).toBe(false);
      expect(isShareExpired('not-a-date', NOW)).toBe(false);
    });
  });

  describe('clampCustomDays（公开钳制：端侧输入框显示=保存的单一来源）', () => {
    it('区间内原样返回', () => {
      expect(clampCustomDays(1)).toBe(SHARE_CUSTOM_DAYS_MIN);
      expect(clampCustomDays(3)).toBe(3);
      expect(clampCustomDays(365)).toBe(SHARE_CUSTOM_DAYS_MAX);
    });

    it('越界钳到边界：0/负→MIN，>MAX→MAX', () => {
      expect(clampCustomDays(0)).toBe(SHARE_CUSTOM_DAYS_MIN);
      expect(clampCustomDays(-3)).toBe(SHARE_CUSTOM_DAYS_MIN);
      expect(clampCustomDays(500)).toBe(SHARE_CUSTOM_DAYS_MAX);
    });

    it('NaN 回落默认；±∞ 钳到边界（单调，非「缺失」）', () => {
      expect(clampCustomDays(Number.NaN)).toBe(SHARE_CUSTOM_DAYS_DEFAULT);
      expect(clampCustomDays(Number.POSITIVE_INFINITY)).toBe(
        SHARE_CUSTOM_DAYS_MAX
      );
      expect(clampCustomDays(Number.NEGATIVE_INFINITY)).toBe(
        SHARE_CUSTOM_DAYS_MIN
      );
    });
  });
});
