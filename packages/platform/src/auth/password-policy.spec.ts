import { describe, expect, it } from 'vitest';

import {
  PASSWORD_POLICY,
  buildPasswordRequirements,
  countPasswordCategories,
  getPasswordClassFlags,
  validatePasswordPolicy,
} from './password-policy';

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

describe('getPasswordClassFlags（四条正则的唯一事实源）', () => {
  it('逐类标记，未命中的类别为 false', () => {
    expect(getPasswordClassFlags('')).toEqual({
      lower: false,
      upper: false,
      digit: false,
      special: false,
    });
    expect(getPasswordClassFlags('abcdefgh')).toEqual({
      lower: true,
      upper: false,
      digit: false,
      special: false,
    });
    expect(getPasswordClassFlags('A1!')).toEqual({
      lower: false,
      upper: true,
      digit: true,
      special: true,
    });
  });

  it('countPasswordCategories 从这份标记派生，两者口径一致', () => {
    for (const password of ['', 'a', 'A1', 'ab_c', 'Abcdef1!']) {
      const flags = getPasswordClassFlags(password);
      const expected = [flags.lower, flags.upper, flags.digit, flags.special]
        .filter(Boolean)
        .length;
      expect(countPasswordCategories(password)).toBe(expected);
    }
  });
});

describe('countPasswordCategories（小写/大写/数字/特殊字符四类）', () => {
  it('逐类计数：0 到 4', () => {
    expect(countPasswordCategories('')).toBe(0);
    expect(countPasswordCategories('abcdefgh')).toBe(1); // 仅小写
    expect(countPasswordCategories('ABCDEFGH')).toBe(1); // 仅大写
    expect(countPasswordCategories('12345678')).toBe(1); // 仅数字
    expect(countPasswordCategories('!!@#%^&*')).toBe(1); // 仅特殊字符
    expect(countPasswordCategories('abcdefgh12')).toBe(2); // 小写 + 数字
    expect(countPasswordCategories('Abcdefgh12')).toBe(3); // 小写 + 大写 + 数字
    expect(countPasswordCategories('Abcdef1!')).toBe(4); // 四类齐
  });

  it('下划线算特殊字符（[^a-zA-Z0-9] 判据）', () => {
    expect(countPasswordCategories('ab_c')).toBe(2);
  });

  it('与 validatePasswordPolicy 的 complexity 判定同口径', () => {
    // 2 类在 minCategories=3 时不达标，4 类达标
    expect(countPasswordCategories('abcdefgh12')).toBe(2);
    expect(validatePasswordPolicy('abcdefgh12').reason).toBe('complexity');
    expect(countPasswordCategories('Abcdef1!')).toBe(4);
    expect(validatePasswordPolicy('Abcdef1!', { minLength: 1 }).valid).toBe(true);
  });
});

describe('buildPasswordRequirements（按生效策略生成要求清单）', () => {
  const SECURE = { minLength: 10, minCategories: 3 };

  it('两项都在时按生效值逐项判定', () => {
    expect(buildPasswordRequirements('Abcdef1234', SECURE)).toEqual([
      { key: 'length', ok: true },
      { key: 'categories', ok: true },
    ]);
    expect(buildPasswordRequirements('abcdefgh12', SECURE)).toEqual([
      { key: 'length', ok: true },
      { key: 'categories', ok: false },
    ]);
    expect(buildPasswordRequirements('Abcdef1!', SECURE)).toEqual([
      { key: 'length', ok: false },
      { key: 'categories', ok: true },
    ]);
  });

  it('策略关闭的维度不出项：清单随策略增删，不残留固定要求', () => {
    expect(
      buildPasswordRequirements('abcdef', { minLength: 6, minCategories: 0 }),
    ).toEqual([{ key: 'length', ok: true }]);
    expect(
      buildPasswordRequirements('Abcdef1!', { minLength: 0, minCategories: 4 }),
    ).toEqual([{ key: 'categories', ok: true }]);
    expect(
      buildPasswordRequirements('Abcdef1!', { minLength: 0, minCategories: 0 }),
    ).toEqual([]);
  });

  it('缺省回落 secure 基线（PASSWORD_POLICY），与传参一致', () => {
    expect(buildPasswordRequirements('Abcdef1234')).toEqual(
      buildPasswordRequirements('Abcdef1234', SECURE),
    );
  });

  it('非空口令：清单全勾 ⟺ validatePasswordPolicy 通过', () => {
    const optsList = [
      SECURE,
      { minLength: 6, minCategories: 0 },
      { minLength: 10, minCategories: 4 },
      { minLength: 4, minCategories: 1 },
      { minLength: 0, minCategories: 0 },
    ];
    for (const opts of optsList) {
      for (const password of ['a', 'aaaaaa', 'Abcdef1!', 'Abcdef1234', 'Abcdefgh12!x']) {
        const items = buildPasswordRequirements(password, opts);
        const allOk = items.every((item) => item.ok);
        expect(allOk).toBe(validatePasswordPolicy(password, opts).valid);
      }
    }
  });

  it('空口令 + 策略全关 → 空清单（空值判定由调用方的非空守卫与 validatePasswordPolicy 负责）', () => {
    expect(buildPasswordRequirements('', { minLength: 0, minCategories: 0 })).toEqual([]);
    expect(validatePasswordPolicy('', { minLength: 0, minCategories: 0 }).valid).toBe(false);
    // 长度下限存在时空口令仍会给出不达标项
    expect(buildPasswordRequirements('', { minLength: 1, minCategories: 0 })).toEqual([
      { key: 'length', ok: false },
    ]);
  });
});
