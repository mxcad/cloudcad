import { describe, it, expect } from 'vitest';
import { sanitizeFileName } from './sanitizeFileName';

describe('sanitizeFileName', () => {
  it('应移除非法字符', () => {
    expect(sanitizeFileName('file<>.txt')).toBe('file.txt');
    expect(sanitizeFileName('a:b/c\\d|e?f*g')).toBe('abcdefg');
  });

  it('合法文件名应保持不变', () => {
    expect(sanitizeFileName('drawing.dwg')).toBe('drawing.dwg');
    expect(sanitizeFileName('my-file_v2.mxweb')).toBe('my-file_v2.mxweb');
  });

  it('空字符串应返回空', () => {
    expect(sanitizeFileName('')).toBe('');
  });
});
