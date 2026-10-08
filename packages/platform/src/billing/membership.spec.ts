import { describe, expect, it } from 'vitest';

import { membershipState } from './membership';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('@cloudcad/platform · billing/membership', () => {
  it('非会员（tierLevel = 0）：isVip / isPermanent 均 false，daysRemaining = 0', () => {
    const st = membershipState({ tierLevel: 0, expiresAt: null, now: NOW });
    expect(st).toEqual({
      tierLevel: 0,
      isPermanent: false,
      isVip: false,
      daysRemaining: 0,
    });
    // 非会员即使带到期日也不算会员（daysRemaining 照常计算，调用端只在 isVip 时消费）
    const withDate = membershipState({ tierLevel: 0, expiresAt: iso(30 * DAY), now: NOW });
    expect(withDate.isVip).toBe(false);
    expect(withDate.daysRemaining).toBe(30);
  });

  it('永久会员（tierLevel > 0 且 expiresAt = null）：isPermanent / isVip 为 true，daysRemaining = Infinity', () => {
    const st = membershipState({ tierLevel: 2, expiresAt: null, now: NOW });
    expect(st.isPermanent).toBe(true);
    expect(st.isVip).toBe(true);
    expect(st.daysRemaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('有效会员：剩余天数 = ceil(diff / 86400000)', () => {
    const st = membershipState({ tierLevel: 1, expiresAt: iso(30 * DAY), now: NOW });
    expect(st.isPermanent).toBe(false);
    expect(st.isVip).toBe(true);
    expect(st.daysRemaining).toBe(30);
  });

  it('当天内到期（不足 1 天）：ceil 后为 1，仍算有效会员', () => {
    const st = membershipState({ tierLevel: 1, expiresAt: iso(3_600_000), now: NOW });
    expect(st.isVip).toBe(true);
    expect(st.daysRemaining).toBe(1);
  });

  it('已到期：daysRemaining 下限钳制为 0，isVip 为 false（移动端漏判到期 bug 的回归）', () => {
    const st = membershipState({ tierLevel: 3, expiresAt: iso(-3_600_000), now: NOW });
    expect(st.isPermanent).toBe(false);
    expect(st.isVip).toBe(false);
    expect(st.daysRemaining).toBe(0);
  });

  it('恰好到期（diff = 0）：视为已到期', () => {
    const st = membershipState({ tierLevel: 1, expiresAt: iso(0), now: NOW });
    expect(st.isVip).toBe(false);
    expect(st.daysRemaining).toBe(0);
  });

  it('expiresAt 无法解析（乱码 / 空串）：按已到期处理，不算会员', () => {
    for (const bad of ['garbage', '']) {
      const st = membershipState({ tierLevel: 2, expiresAt: bad, now: NOW });
      expect(st.isVip).toBe(false);
      expect(st.daysRemaining).toBe(0);
    }
  });

  it('expiresAt 支持时间戳数字', () => {
    const st = membershipState({
      tierLevel: 1,
      expiresAt: NOW + 5 * DAY,
      now: NOW,
    });
    expect(st.isVip).toBe(true);
    expect(st.daysRemaining).toBe(5);
  });

  it('now 参数生效：同一 expiresAt 在不同 now 下结论不同', () => {
    const expiresAt = iso(10 * DAY);
    expect(membershipState({ tierLevel: 1, expiresAt, now: NOW }).isVip).toBe(true);
    expect(membershipState({ tierLevel: 1, expiresAt, now: NOW + 20 * DAY }).isVip).toBe(false);
  });
});
