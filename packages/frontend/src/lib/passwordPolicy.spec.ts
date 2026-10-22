import { describe, expect, it } from 'vitest';
import {
  passwordComplexityMessage,
  passwordPolicyHint,
  passwordRequirementLabel,
  passwordStrengthDisplay,
  passwordTooShortMessage,
} from './passwordPolicy';

/**
 * 动态性门禁：口令策略文案必须由传入的生效值推导。
 * 若有人把文案改回写死数字的静态串，这些用例会红
 * （喂 12/2 的文案里必须出现 12 与 2）。
 */
describe('passwordPolicy（PC 口令策略唯一出口）', () => {
  it('提示跟随生效值动态推导（secure 基线 10/3）', () => {
    const hint = passwordPolicyHint({ minLength: 10, minCategories: 3 });
    expect(hint).toContain('10');
    expect(hint).toContain('中至少 3 类');
  });

  it('提示跟随生效值动态推导（非默认值 12/2 必须出现在文案中）', () => {
    const hint = passwordPolicyHint({ minLength: 12, minCategories: 2 });
    expect(hint).toContain('12');
    expect(hint).toContain('中至少 2 类');
  });

  it('minCategories=0（normal 模式）→ 只说长度，不提类别', () => {
    const hint = passwordPolicyHint({ minLength: 6, minCategories: 0 });
    expect(hint).toContain('6');
    expect(hint).not.toContain('中至少');
  });

  it('minCategories=4 → 要求四类齐全，无「至少 N 类」措辞', () => {
    const hint = passwordPolicyHint({ minLength: 10, minCategories: 4 });
    expect(hint).toContain('10');
    expect(hint).not.toContain('中至少');
  });

  it('minLength=0 且 minCategories=0 → 无复杂度要求', () => {
    expect(passwordPolicyHint({ minLength: 0, minCategories: 0 })).toBe(
      '无密码复杂度要求',
    );
  });

  it('错误文案跟随生效值', () => {
    expect(passwordTooShortMessage(12)).toContain('12');
    expect(passwordComplexityMessage(2)).toContain('中至少 2 类');
  });
});

describe('passwordStrengthDisplay（强度阈值取生效策略，不再写死 8 位）', () => {
  it('同一口令在宽松与严格策略下评分不同', () => {
    // 6 位纯小写：normal 6/0 下合规（2 分＝一般），secure 10/3 下两项全不达标
    expect(
      passwordStrengthDisplay('aaaaaa', { minLength: 6, minCategories: 0 }).strength,
    ).toBe(2);
    expect(
      passwordStrengthDisplay('aaaaaa', { minLength: 10, minCategories: 3 }).strength,
    ).toBeLessThanOrEqual(1);
  });

  it('恰好合规显示「一般」，不会被标成太弱/较弱', () => {
    const display = passwordStrengthDisplay('Abcdef1234', {
      minLength: 10,
      minCategories: 3,
    });
    expect(display.label).toBe('一般');
    expect(display.color).toBe('#eab308');
  });

  it('空口令不显示标签与颜色', () => {
    expect(
      passwordStrengthDisplay('', { minLength: 10, minCategories: 3 }),
    ).toEqual({ strength: 0, label: '', color: '' });
  });
});

describe('passwordRequirementLabel（清单文案由生效策略推导）', () => {
  it('非默认值 12/2 必须出现在清单标签里', () => {
    const policy = { minLength: 12, minCategories: 2 };
    expect(
      passwordRequirementLabel({ key: 'length', ok: true }, policy),
    ).toContain('12');
    expect(
      passwordRequirementLabel({ key: 'categories', ok: false }, policy),
    ).toContain('中至少 2 类');
  });
});
