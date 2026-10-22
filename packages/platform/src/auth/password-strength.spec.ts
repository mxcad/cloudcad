import { describe, expect, it } from 'vitest';

import { validatePasswordPolicy } from './password-policy';
import { scorePasswordStrength } from './password-strength';

const SECURE = { minLength: 10, minCategories: 3 };
const NORMAL = { minLength: 6, minCategories: 0 };

describe('@cloudcad/platform · auth/password-strength', () => {
  it('空密码 → 0', () => {
    expect(scorePasswordStrength('')).toBe(0);
  });

  it('四项阈值取生效策略：长度达标 / 类别达标 / 长度有余量 / 四类全含', () => {
    // secure 10/3
    expect(scorePasswordStrength('Abcdefgh12!x', SECURE)).toBe(4);
    expect(scorePasswordStrength('Abcdefgh1234', SECURE)).toBe(3); // 达标 + 长度有余量
    expect(scorePasswordStrength('Abcdef1234', SECURE)).toBe(2); // 恰好合规，无余量
    expect(scorePasswordStrength('Abcdefgh1', SECURE)).toBe(1); // 三类齐但仅 9 位
    expect(scorePasswordStrength('abcdefg', SECURE)).toBe(0);
  });

  it('阈值不再写死 8 位：同一口令在宽松与严格策略下评分不同', () => {
    // 6 位纯小写在 normal 6/0 下合规（2 分＝一般），在 secure 10/3 下两项全不达标
    const relaxed = scorePasswordStrength('aaaaaa', NORMAL);
    const strict = scorePasswordStrength('aaaaaa', SECURE);
    expect(relaxed).toBe(2);
    expect(strict).toBeLessThanOrEqual(1);
  });

  it('minCategories=0 时类别达标恒成立，长度轴独扛两档', () => {
    expect(scorePasswordStrength('abc', NORMAL)).toBe(1); // 仅类别达标
    expect(scorePasswordStrength('aaaaaa', NORMAL)).toBe(2);
    expect(scorePasswordStrength('aaaaaaaaaaa', NORMAL)).toBe(3);
    expect(scorePasswordStrength('Abcd12!', NORMAL)).toBe(4);
  });

  it('缺省回落 secure 基线（PASSWORD_POLICY 10/3），与传参一致', () => {
    expect(scorePasswordStrength('Abcdef12!')).toBe(
      scorePasswordStrength('Abcdef12!', SECURE),
    );
  });

  it('类别轴用 countPasswordCategories 的计数口径（大小写分别计分）', () => {
    // 3 类（大写+数字+特殊字符）在 minCategories=3 时达到类别达标
    expect(scorePasswordStrength('A1!', { minLength: 1, minCategories: 3 })).toBe(3);
  });

  it('与 validatePasswordPolicy 对齐：合规 ⟹ ≥2，不合规 ⟹ ≤2', () => {
    // 「一般」是临界档：恰好合规与「一项完全没达标」都可能落在这，
    // 因此 2 分不承诺合规；但 ≥3 必合规、≤1 必不合规。
    const optsList = [
      SECURE,
      NORMAL,
      { minLength: 10, minCategories: 4 },
      { minLength: 4, minCategories: 1 },
      { minLength: 0, minCategories: 0 },
    ];
    const passwords = [
      '',
      'a',
      'A',
      'aaaaaa',
      'Aaaaaaaa',
      'Abcdef1!',
      'Abcdef1234',
      'Abcdefgh12!x',
      'Abcdefgh1234',
    ];
    for (const opts of optsList) {
      for (const password of passwords) {
        const valid = validatePasswordPolicy(password, opts).valid;
        const score = scorePasswordStrength(password, opts);
        const where = `${password} @ ${opts.minLength}/${opts.minCategories}`;
        if (valid) expect(score >= 2, where).toBe(true);
        else expect(score <= 2, where).toBe(true);
      }
    }
  });
});
