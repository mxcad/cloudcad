///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { CACHE_KEY_CATALOG } from '../data/cache-key-catalog';
import {
  DELETABLE_CACHE_PATTERNS,
  decidePatternDelete,
  globToRegExp,
  infraOverlapOf,
} from './cache-pattern.guard';

describe('globToRegExp', () => {
  it('should convert * to a matching regex', () => {
    expect(globToRegExp('user:permissions:*').test('user:permissions:12')).toBe(
      true
    );
    expect(
      globToRegExp('user:permissions:*').test('user:permissions:12:v3')
    ).toBe(true);
    expect(
      globToRegExp('user:permissions:*').test('project:permissions:12')
    ).toBe(false);
  });

  it('should treat ? as exactly one character', () => {
    expect(globToRegExp('user:1?').test('user:12')).toBe(true);
    expect(globToRegExp('user:1?').test('user:')).toBe(false);
    expect(globToRegExp('user:1?').test('user:1')).toBe(false);
    expect(globToRegExp('user:1?').test('user:12:34')).toBe(false);
  });

  it('should escape regex metacharacters literally', () => {
    expect(globToRegExp('ip-blacklist:exact').test('ip-blacklist:exact')).toBe(
      true
    );
    expect(globToRegExp('a.c').test('abc')).toBe(false);
  });

  it('should let * cross : segment separators (Redis glob 语义)', () => {
    expect(globToRegExp('user:*').test('user:blacklist:12')).toBe(true);
    expect(globToRegExp('user:*').test('user:permissions:12:v3')).toBe(true);
  });
});

describe('decidePatternDelete', () => {
  it('should allow catalog patterns that cannot reach an infra key', () => {
    expect(decidePatternDelete('user:permissions:*')).toEqual({ ok: true });
    expect(decidePatternDelete('role:permissions:*')).toEqual({ ok: true });
  });

  it('should trim before judging', () => {
    expect(decidePatternDelete('  user:permissions:*  ')).toEqual({ ok: true });
  });

  it('should reject patterns outside the catalog', () => {
    expect(decidePatternDelete('*')).toEqual({
      ok: false,
      reason: 'not-in-catalog',
    });
    expect(decidePatternDelete('user:permissions:12')).toEqual({
      ok: false,
      reason: 'not-in-catalog',
    });
  });

  it('should reject empty input', () => {
    expect(decidePatternDelete('')).toEqual({
      ok: false,
      reason: 'not-in-catalog',
    });
    expect(decidePatternDelete(undefined as unknown as string)).toEqual({
      ok: false,
      reason: 'not-in-catalog',
    });
  });

  it('should allow user:* now that no infra key shares its prefix', () => {
    // user:blacklist:* 随 Gitea #484 退役，user:* 只剩 user:<id> 与 user:permissions:*
    expect(decidePatternDelete('user:*')).toEqual({ ok: true });
    expect(DELETABLE_CACHE_PATTERNS).toContain('user:*');
  });

  it('should keep the infra-overlap rule live via synthetic data', () => {
    // 当前目录里没有 infra 键与可删模式共享前缀，这条分支靠合成数据才能测到——
    // 它仍是新增 infra 键时唯一的自动保护区，别让规则悄悄烂掉。
    // 方向：候选模式的静态前缀是某个 infra 模式的前缀才算波及（宽扫窄），
    // 窄模式不会扫到更宽的 infra 模式。
    expect(
      infraOverlapOf('user:*', ['user:blacklist:*', 'token:blacklist:*'])
    ).toEqual(['user:blacklist:*']);
    expect(infraOverlapOf('user:permissions:*', ['user:blacklist:*'])).toEqual(
      []
    );
    expect(infraOverlapOf('ratelimit:*', ['ratelimit:login:*'])).toEqual([
      'ratelimit:login:*',
    ]);
    expect(infraOverlapOf('ratelimit:login:*', ['ratelimit:*'])).toEqual([]);
    expect(infraOverlapOf('project:*', ['token:blacklist:*'])).toEqual([]);
  });

  it('should keep project:* and role:* deletable (no infra key under them)', () => {
    expect(decidePatternDelete('project:*')).toEqual({ ok: true });
    expect(decidePatternDelete('role:*')).toEqual({ ok: true });
  });

  it('should not offer any infra pattern for deletion', () => {
    for (const entry of CACHE_KEY_CATALOG) {
      if (entry.scope !== 'infra') continue;
      expect(DELETABLE_CACHE_PATTERNS).not.toContain(entry.pattern);
    }
  });

  it('should keep every deletable pattern covered by the catalog', () => {
    // 守卫放行集必须逐字来自目录的 cache 条目，防止两处清单悄悄分叉
    for (const pattern of DELETABLE_CACHE_PATTERNS) {
      expect(
        CACHE_KEY_CATALOG.some(
          (entry) =>
            entry.scope === 'cache' && entry.pattern === pattern
        )
      ).toBe(true);
    }
  });
});
