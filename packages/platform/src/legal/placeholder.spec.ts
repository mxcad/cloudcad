import { describe, expect, it } from 'vitest';

import { resolvePlaceholders } from './placeholder';

describe('@cloudcad/platform · legal/placeholder', () => {
  it('替换 {{key}}（容忍花括号内空白）', () => {
    expect(resolvePlaceholders('Hello {{name}}', { name: 'MX' })).toBe('Hello MX');
    expect(resolvePlaceholders('{{ name }}', { name: 'MX' })).toBe('MX');
    expect(
      resolvePlaceholders('{{a}} and {{b}}', { a: '1', b: '2' })
    ).toBe('1 and 2');
  });

  it('未知占位符原样保留（漏项可见）', () => {
    expect(resolvePlaceholders('{{missing}}', {})).toBe('{{missing}}');
    expect(resolvePlaceholders('{{a}} {{b}}', { a: '1' })).toBe('1 {{b}}');
  });

  it('单花括号 i18n flexvars 不受影响', () => {
    expect(resolvePlaceholders('{size}MB', { size: '999' })).toBe('{size}MB');
  });
});
