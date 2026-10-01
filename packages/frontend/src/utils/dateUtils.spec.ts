///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from 'vitest';

/** 可变激活语言：locale 断言的驱动源 */
const lang = vi.hoisted(() => ({ current: 'zh-CN' }));

vi.mock('@/languages', () => ({
  i18nScope: { get activeLanguage() {
    return lang.current;
  } },
  t: (key: string) => key,
}));

import {
  dateOnlyToIso,
  formatDate,
  formatDateTime,
  formatDateTimeWithSeconds,
  formatTime,
  getRelativeTime,
  isoToDateOnly,
  todayStartIso,
} from './dateUtils';

interface LocaleCall {
  locale: string;
  options: Intl.DateTimeFormatOptions;
  method: string;
}

/** 抓取一次格式化调用传给 Intl 的 locale 与 options（不依赖真实 Intl 输出） */
function captureIntl(fn: () => unknown): LocaleCall[] {
  const calls: LocaleCall[] = [];
  const spy = (method: 'toLocaleString' | 'toLocaleDateString' | 'toLocaleTimeString') =>
    vi.spyOn(Date.prototype, method).mockImplementation(function (this: Date, loc?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      calls.push({ locale: loc as string, options: (opts ?? {}) as Intl.DateTimeFormatOptions, method });
      return '';
    });
  const spies = [
    spy('toLocaleString'),
    spy('toLocaleDateString'),
    spy('toLocaleTimeString'),
  ];
  try {
    fn();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return calls;
}

afterEach(() => {
  lang.current = 'zh-CN';
});

const FIXED = new Date(2026, 8, 17, 12, 30, 45);

describe('绝对日期/时间（固定格式，locale 无关，口径收敛到 platform）', () => {
  it('formatDate / formatDateTime / formatDateTimeWithSeconds 固定 ISO-like 格式', () => {
    expect(formatDate(FIXED)).toBe('2026-09-17');
    expect(formatDateTime(FIXED)).toBe('2026-09-17 12:30');
    expect(formatDateTimeWithSeconds(FIXED)).toBe('2026-09-17 12:30:45');
  });

  it('与界面语言无关（en-US 下仍是固定格式，不再走 Intl）', () => {
    lang.current = 'en-US';
    expect(formatDate(FIXED)).toBe('2026-09-17');
    expect(formatDateTime(FIXED)).toBe('2026-09-17 12:30');
    expect(captureIntl(() => formatDateTime(FIXED))).toHaveLength(0);
  });

  it('formatTime 仍按运行时语言本地化（PC 独有 time-only，未收敛）', () => {
    expect(captureIntl(() => formatTime(FIXED))[0]?.locale).toBe('zh-CN');
    lang.current = 'en-US';
    expect(captureIntl(() => formatTime(FIXED))[0]?.locale).toBe('en-US');
  });
});

describe('非法日期', () => {
  it('formatDateTime / formatDate / formatDateTimeWithSeconds 回退空串（口径统一到 platform）', () => {
    expect(formatDateTime('not-a-date')).toBe('');
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDateTimeWithSeconds('not-a-date')).toBe('');
  });

  it('formatTime 仍回退 "-"（PC 独有 time-only，未收敛）', () => {
    expect(formatTime('not-a-date')).toBe('-');
  });
});

describe('getRelativeTime', () => {
  it('60s 内显示刚刚', () => {
    expect(getRelativeTime(new Date(Date.now() - 30_000))).toBe('刚刚');
  });

  it('分钟 / 小时 / 天前 按阈值分级', () => {
    expect(getRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe('5分钟前');
    expect(getRelativeTime(new Date(Date.now() - 3 * 3_600_000))).toBe('3小时前');
    expect(getRelativeTime(new Date(Date.now() - 2 * 86_400_000))).toBe('2天前');
  });

  it('周 / 月 / 年 档（统一相对表述，无绝对日期回退）', () => {
    expect(getRelativeTime(new Date(Date.now() - 10 * 86_400_000))).toBe('1周前');
    expect(getRelativeTime(new Date(Date.now() - 45 * 86_400_000))).toBe('1个月前');
    expect(getRelativeTime(new Date(Date.now() - 400 * 86_400_000))).toBe('1年前');
  });
});

describe('dateOnly ↔ ISO 互转', () => {
  it('dateOnlyToIso 接受 yyyy-MM-dd', () => {
    expect(dateOnlyToIso('2026-09-17')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('空值 / 非日期字符串返回 undefined', () => {
    expect(dateOnlyToIso('')).toBeUndefined();
    expect(dateOnlyToIso(undefined)).toBeUndefined();
    expect(dateOnlyToIso('17/09/2026')).toBeUndefined();
  });

  it('isoToDateOnly 截取前 10 位', () => {
    expect(isoToDateOnly('2026-09-17T23:59:59.999Z')).toBe('2026-09-17');
    expect(isoToDateOnly('2026-09-17')).toBe('2026-09-17');
    expect(isoToDateOnly('')).toBe('');
    expect(isoToDateOnly(undefined)).toBe('');
  });

  it('dateOnlyToIso 产出本地零点：解析回的本地 y/m/d/h 与输入一致（跨时区不变量）', () => {
    for (const [dateOnly, parts] of [
      ['2026-01-01', [2026, 0, 1]],
      ['2026-09-17', [2026, 8, 17]],
      ['2026-12-31', [2026, 11, 31]],
    ] as Array<[string, [number, number, number]]>) {
      const iso = dateOnlyToIso(dateOnly);
      expect(iso).toBeDefined();
      const dt = new Date(iso!);
      expect([dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes()]).toEqual([
        parts[0], parts[1], parts[2], 0, 0,
      ], dateOnly);
    }
  });

  it('isoToDateOnly 的契约是「DatePicker 输出的本地当日末刻 ISO」→ 本地日期', () => {
    const endOfDay = new Date(2026, 8, 17, 23, 59, 59, 999).toISOString();
    expect(isoToDateOnly(endOfDay)).toBe('2026-09-17');
  });

  // 契约边界（不在时区相关断言中固化）：dateOnlyToIso 产出本地零点，其 UTC ISO
  // 的日期段在 UTC+ 时区是前一日；isoToDateOnly 期望的是本地末刻 ISO。
  // 两者不是互逆，调用方不得把前者产出喂给后者。
});

describe('todayStartIso', () => {
  it('返回今天本地零点的 ISO 字符串', () => {
    const now = new Date();
    const dt = new Date(todayStartIso());
    expect([
      dt.getFullYear(),
      dt.getMonth(),
      dt.getDate(),
      dt.getHours(),
      dt.getMinutes(),
      dt.getSeconds(),
    ]).toEqual([now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0]);
  });
});
