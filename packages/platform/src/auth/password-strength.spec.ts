import { describe, expect, it } from 'vitest';

import { scorePasswordStrength } from './password-strength';

describe('@cloudcad/platform · auth/password-strength', () => {
  it('空密码 → 0', () => {
    expect(scorePasswordStrength('')).toBe(0);
  });

  it('四条件（长度≥8 / 大小写齐 / 含数字 / 含特殊字符）各 1 分', () => {
    expect(scorePasswordStrength('Abcdefg1!')).toBe(4);
    expect(scorePasswordStrength('abcdefg')).toBe(0);
    expect(scorePasswordStrength('abcdefgh')).toBe(1);
    expect(scorePasswordStrength('Abcdefgh')).toBe(2);
    expect(scorePasswordStrength('Abcdefg1')).toBe(3);
    expect(scorePasswordStrength('abcdefg!')).toBe(2);
  });
});
