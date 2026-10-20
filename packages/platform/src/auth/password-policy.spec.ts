import { describe, expect, it } from 'vitest';

import { PASSWORD_POLICY, validatePasswordPolicy } from './password-policy';

describe('@cloudcad/platform · auth/password-policy', () => {
  it('默认策略：minLength=10，minCategories=3', () => {
    expect(PASSWORD_POLICY.minLength).toBe(10);
    expect(PASSWORD_POLICY.minCategories).toBe(3);
  });

  it('空密码 → too_short', () => {
    expect(validatePasswordPolicy('')).toEqual({
      valid: false,
      reason: 'too_short',
    });
  });

  it('长度不足（<10）→ too_short（短路，不再报 complexity）', () => {
    // 8 位、仅小写+数字两类：既短又低复杂度，但按后端优先级只报 too_short
    expect(validatePasswordPolicy('abcdefg1')).toEqual({
      valid: false,
      reason: 'too_short',
    });
  });

  it('长度够但复杂度不足（<3 类）→ complexity', () => {
    // 12 位、仅小写+数字两类
    expect(validatePasswordPolicy('abcdefgh1234')).toEqual({
      valid: false,
      reason: 'complexity',
    });
  });

  it('长度够且三类齐 → valid', () => {
    expect(validatePasswordPolicy('Abcdefgh1234')).toEqual({
      valid: true,
      reason: null,
    });
  });

  it('四类齐 → valid', () => {
    expect(validatePasswordPolicy('Abcdefgh12!')).toEqual({
      valid: true,
      reason: null,
    });
  });

  it('minLength 可被调用方覆盖', () => {
    // 8 位在默认策略下 too_short，但 minLength=6 时长度够；仅小写一类 → complexity
    expect(validatePasswordPolicy('abcdefg', { minLength: 6 })).toEqual({
      valid: false,
      reason: 'complexity',
    });
    expect(validatePasswordPolicy('Abcdef1!', { minLength: 6 })).toEqual({
      valid: true,
      reason: null,
    });
  });

  it('minCategories 可被调用方覆盖（normal 模式 6/0：纯数字通过）', () => {
    // 默认策略下 10 位纯数字（长度够、仅一类）→ complexity；normal 模式生效值 6/0 时通过
    expect(validatePasswordPolicy('1234567890')).toEqual({
      valid: false,
      reason: 'complexity',
    });
    expect(
      validatePasswordPolicy('1234567890', { minLength: 6, minCategories: 0 }),
    ).toEqual({ valid: true, reason: null });
  });

  it('minCategories=4 时四类必须齐全', () => {
    expect(
      validatePasswordPolicy('Abcdef1234', { minLength: 10, minCategories: 4 }),
    ).toEqual({ valid: false, reason: 'complexity' });
    expect(
      validatePasswordPolicy('Abcdef12!x', { minLength: 10, minCategories: 4 }),
    ).toEqual({ valid: true, reason: null });
  });
});
