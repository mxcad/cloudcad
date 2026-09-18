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

import { describe, expect, it } from 'vitest';

import { sortNotices, type Notice } from './noticeTypes';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'info',
    title: '标题',
    body: '正文',
    autoExpire: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('sortNotices', () => {
  it('按级别降序排序（danger > warning > info）', () => {
    const sorted = sortNotices([
      notice({ id: 'a', level: 'info' }),
      notice({ id: 'b', level: 'danger' }),
      notice({ id: 'c', level: 'warning' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('同级别按发布时间降序（新的在前）', () => {
    const sorted = sortNotices([
      notice({ id: 'old', publishedAt: '2026-09-17T00:00:00.000Z' }),
      notice({ id: 'new', publishedAt: '2026-09-17T12:00:00.000Z' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('publishedAt 缺失时退回 createdAt', () => {
    const sorted = sortNotices([
      notice({ id: 'a', createdAt: '2026-09-17T00:00:00.000Z' }),
      notice({ id: 'b', createdAt: '2026-09-17T06:00:00.000Z' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('未知级别排在已知级别之后', () => {
    const sorted = sortNotices([
      notice({ id: 'x', level: 'unknown-level' }),
      notice({ id: 'i', level: 'info' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['i', 'x']);
  });

  it('同级别同时间按 id 稳定排序（避免并发重复推送导致抖动）', () => {
    const same = notice({ publishedAt: '2026-09-17T00:00:00.000Z' });
    const sorted = sortNotices([
      { ...same, id: 'zz' },
      { ...same, id: 'aa' },
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['aa', 'zz']);
  });

  it('不修改入参数组', () => {
    const input = [notice({ id: 'b' }), notice({ id: 'a' })];
    sortNotices(input);
    expect(input.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('空数组返回空数组', () => {
    expect(sortNotices([])).toEqual([]);
  });
});
