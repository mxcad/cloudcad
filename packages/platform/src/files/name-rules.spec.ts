import { describe, expect, it } from 'vitest';

import { checkFileName } from './name-rules';

describe('@cloudcad/platform · files/name-rules', () => {
  it('空名 / 超长', () => {
    expect(checkFileName('')).toEqual({ valid: false, reason: 'empty' });
    expect(checkFileName('   ')).toEqual({ valid: false, reason: 'empty' });
    expect(checkFileName('a'.repeat(256))).toEqual({
      valid: false,
      reason: 'too_long',
    });
    expect(checkFileName('a'.repeat(255))).toEqual({ valid: true });
  });

  it('非法字符 / 控制字符 / 保留名 / 首尾点', () => {
    expect(checkFileName('a<b')).toEqual({ valid: false, reason: 'illegal_chars' });
    expect(checkFileName('a\\b')).toEqual({ valid: false, reason: 'illegal_chars' });
    expect(checkFileName('a\x01b')).toEqual({
      valid: false,
      reason: 'control_chars',
    });
    expect(checkFileName('CON')).toEqual({ valid: false, reason: 'reserved_name' });
    expect(checkFileName('com3')).toEqual({ valid: false, reason: 'reserved_name' });
    expect(checkFileName('.hidden')).toEqual({ valid: false, reason: 'dot_edges' });
    expect(checkFileName('a.')).toEqual({ valid: false, reason: 'dot_edges' });
  });

  it('合法名通过；maxLength 可覆盖', () => {
    expect(checkFileName('图纸-01.dwg')).toEqual({ valid: true });
    expect(checkFileName('ab', 1)).toEqual({ valid: false, reason: 'too_long' });
  });
});
