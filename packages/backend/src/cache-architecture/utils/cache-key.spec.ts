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
import { globToRegExp } from './cache-pattern.guard';
import { cacheKey, type CacheCatalogId } from './cache-key';

/** 按 pattern 的通配段数造出等量参数 */
function partsFor(pattern: string): Array<string | number> {
  const slots = pattern.split(/[*?]+/).length - 1;
  return Array.from({ length: slots }, (_, index) => `p${index}`);
}

describe('cacheKey', () => {
  it('should build a key from the catalog pattern plus parts', () => {
    expect(cacheKey('user_permissions', 12)).toBe('user:permissions:12');
    expect(cacheKey('user', '7')).toBe('user:7');
    expect(cacheKey('project_permissions', 9)).toBe(
      'project:permissions:9'
    );
  });

  it('should fill every wildcard run, not just the trailing one', () => {
    // 只剥尾部通配会拼成 `system_perm:*:u1:3`：带字面 `*`、读不到缓存也删不掉
    expect(cacheKey('system_perm', 'u1', 3)).toBe('system_perm:u1:3');
    expect(cacheKey('system_perm', 101, 5)).toBe('system_perm:101:5');
  });

  it('should keep a literal key verbatim when the pattern has no wildcard', () => {
    // 模板里没有占位符就不能补分隔符
    expect(cacheKey('ip_blacklist_exact')).toBe('ip-blacklist:exact');
    expect(cacheKey('ip_blacklist_cidr')).toBe('ip-blacklist:cidr');
    expect(cacheKey('cache_version', '2026')).toBe('cache:version:2026');
  });

  it('should reject a part count that does not match the pattern', () => {
    expect(() => cacheKey('user_permissions', 1, 2)).toThrow(
      /需要 1 个参数.*实际收到 2 个/
    );
    expect(() => cacheKey('system_perm', 'u1')).toThrow(
      /需要 2 个参数.*实际收到 1 个/
    );
    expect(() => cacheKey('ip_blacklist_exact', 'x')).toThrow(
      /需要 0 个参数.*实际收到 1 个/
    );
  });

  it('should throw on an id missing from the catalog instead of building a bad key', () => {
    expect(() =>
      cacheKey('definitely_not_a_catalog_id' as unknown as CacheCatalogId)
    ).toThrow(/缓存键目录缺少条目/);
  });
});

describe('cache key catalog integrity (#471)', () => {
  it('should map every entry to a distinct id (duplicates would silently dedupe)', () => {
    const ids = CACHE_KEY_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should yield a key its own pattern deletes, for every entry', () => {
    // 「目录是单一事实源」的前提：构造出来的键必须能被自己目录条目的 pattern 扫到
    const mismatches = CACHE_KEY_CATALOG.flatMap((entry) => {
      const key = cacheKey(entry.id, ...partsFor(entry.pattern));
      return globToRegExp(entry.pattern).test(key)
        ? []
        : [`${entry.id} → ${key}（pattern ${entry.pattern}）`];
    });
    expect(mismatches).toEqual([]);
  });

  it('should have an example its own pattern matches, for every entry', () => {
    // 多写一个 `*:` 会让该模式 SCAN 恒命中 0 条（静默空操作），示例自校验挡住这类笔误
    const stale = CACHE_KEY_CATALOG.filter(
      (entry) => !globToRegExp(entry.pattern).test(entry.example)
    ).map((entry) => `${entry.id} → ${entry.example}（pattern ${entry.pattern}）`);
    expect(stale).toEqual([]);
  });

  it('should emit no wildcard into a built key, for every entry', () => {
    const offenders = CACHE_KEY_CATALOG.flatMap((entry) => {
      const key = cacheKey(entry.id, ...partsFor(entry.pattern));
      return /[*?]/.test(key) ? [`${entry.id} → ${key}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});
