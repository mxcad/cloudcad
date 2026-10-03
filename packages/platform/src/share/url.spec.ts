import { describe, expect, it } from 'vitest';

import { toShareUrl } from './url';

const ORIGIN = 'https://cad.example.com';

describe('@cloudcad/platform · share/url', () => {
  it('相对 path 前置 origin', () => {
    expect(toShareUrl('/cad-editor/f1?shareToken=t1', ORIGIN)).toBe(
      'https://cad.example.com/cad-editor/f1?shareToken=t1',
    );
  });

  it('origin 尾部斜杠不产生双斜杠', () => {
    expect(toShareUrl('/cad-editor/f1', `${ORIGIN}/`)).toBe(`${ORIGIN}/cad-editor/f1`);
    expect(toShareUrl('/cad-editor/f1', `${ORIGIN}//`)).toBe(`${ORIGIN}/cad-editor/f1`);
  });

  it('已绝对化的值原样返回，不叠加重复 origin', () => {
    expect(toShareUrl('https://other.example.com/cad-editor/f1', ORIGIN)).toBe(
      'https://other.example.com/cad-editor/f1',
    );
    expect(toShareUrl('//cdn.example.com/cad-editor/f1', ORIGIN)).toBe(
      '//cdn.example.com/cad-editor/f1',
    );
  });

  it('非 path 的输入原样透传', () => {
    expect(toShareUrl('cad-editor/f1', ORIGIN)).toBe('cad-editor/f1');
    expect(toShareUrl('mailto:a@b.c', ORIGIN)).toBe('mailto:a@b.c');
  });

  it('空值返回空串，不产生 undefined/null 字面量', () => {
    expect(toShareUrl('', ORIGIN)).toBe('');
    expect(toShareUrl('   ', ORIGIN)).toBe('');
    expect(toShareUrl(null, ORIGIN)).toBe('');
    expect(toShareUrl(undefined, ORIGIN)).toBe('');
  });
});
