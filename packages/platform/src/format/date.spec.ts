import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatDateTimeWithSeconds } from './date';

describe('@cloudcad/platform · format/date', () => {
  it('合法输入 → 固定 ISO-like 格式（本地时间，locale 无关）', () => {
    const d = new Date(2026, 9, 1, 14, 30, 45);
    expect(formatDate(d)).toBe('2026-10-01');
    expect(formatDateTime(d)).toBe('2026-10-01 14:30');
    expect(formatDateTimeWithSeconds(d)).toBe('2026-10-01 14:30:45');
  });

  it('接受字符串 / 时间戳（同一时刻回环）', () => {
    const d = new Date(2026, 9, 1, 9, 5, 3);
    expect(formatDate(d.toISOString())).toBe('2026-10-01');
    expect(formatDateTime(d.getTime())).toBe('2026-10-01 09:05');
  });

  it('空 / 无效 → 空串', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDateTime('not-a-date')).toBe('');
    expect(formatDateTimeWithSeconds(Number.NaN)).toBe('');
  });
});
