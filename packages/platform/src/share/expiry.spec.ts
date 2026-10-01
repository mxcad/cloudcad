import { describe, expect, it } from 'vitest';

import {
  SHARE_EXPIRATION_VALUES,
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
      expect(detectShareExpiration(null, NOW)).toEqual({
        option: 'never',
        customDays: 1,
      });
    });

    it('非法日期（NaN）→ never（回归：NaN 兜底）', () => {
      expect(detectShareExpiration('not-a-date', NOW)).toEqual({
        option: 'never',
        customDays: 1,
      });
    });

    it('已过期 → immediate', () => {
      expect(detectShareExpiration(iso(NOW - 1000), NOW)).toEqual({
        option: 'immediate',
        customDays: 1,
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

    it('custom 天数钳制最小 1', () => {
      expect(computeExpiresAtIso('custom', 0, NOW)).toBe(iso(NOW + DAY));
      expect(computeExpiresAtIso('custom', -3, NOW)).toBe(iso(NOW + DAY));
      expect(computeExpiresAtIso('custom', 3, NOW)).toBe(iso(NOW + 3 * DAY));
    });
  });

  describe('computeExpiresInSeconds', () => {
    it('never → undefined（不传字段）；immediate → 1 秒', () => {
      expect(computeExpiresInSeconds('never', 1)).toBeUndefined();
      expect(computeExpiresInSeconds('immediate', 1)).toBe(1);
    });

    it('预设 → 预设秒数；custom 钳制最小 1 天', () => {
      expect(computeExpiresInSeconds('7d', 1)).toBe(SHARE_EXPIRATION_VALUES['7d']);
      expect(computeExpiresInSeconds('custom', 0)).toBe(86400);
      expect(computeExpiresInSeconds('custom', 3)).toBe(3 * 86400);
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
});
