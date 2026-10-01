import { describe, expect, it } from 'vitest';

import { formatBytes } from './bytes';

describe('@cloudcad/platform · format/bytes', () => {
  it('空 / 0 → "-"', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
    expect(formatBytes(0)).toBe('-');
  });

  it('log 选单位 B~TB，去尾零', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(5 * 1024 ** 4)).toBe('5 TB');
  });
});
