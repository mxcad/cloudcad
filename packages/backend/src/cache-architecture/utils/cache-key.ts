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

import { CACHE_KEY_CATALOG } from '../data/cache-key-catalog';

/**
 * 缓存键构造（前缀从 CACHE_KEY_CATALOG 派生）
 *
 * 此前前缀存在两份清单：`utils/cache-key.utils.ts` 的 `CacheKeyPrefix` 枚举（11 值，
 * 7 个零引用）与各服务里的手写模板串（`role:permissions:`、`is_admin:` 等），
 * 目录页又单独维护第三份。现在只有目录一份：新增/改前缀改 `data/cache-key-catalog.ts`
 * 一处，键构造与「按模式删除」白名单同时生效。
 */

/** 目录条目 id 的字面量联合——由目录数据派生，新增条目自动扩集，写错 id 直接编译失败 */
export type CacheCatalogId = (typeof CACHE_KEY_CATALOG)[number]['id'];

const PLACEHOLDER = '\u0000CACHE_KEY_SLOT\u0000';

/**
 * pattern 即键模板：把连续的 `*`/`?` 段换成占位符。
 *
 * 不能只剥尾部通配——`system_perm:*:*` 剥尾后剩 `system_perm:*:`，
 * 拼出的键会带字面 `*`，既不匹配自身 pattern，也永远不会被 deleteByPattern 命中。
 */
function toTemplate(pattern: string): string {
  return pattern.replace(/[*?]+/g, PLACEHOLDER);
}

const TEMPLATE_BY_ID = CACHE_KEY_CATALOG.reduce<
  Map<CacheCatalogId, string>
>((map, entry) => map.set(entry.id, toTemplate(entry.pattern)), new Map());

const COUNT_PLACEHOLDER = (template: string): number =>
  template.split(PLACEHOLDER).length - 1;

/**
 * 按目录条目构造缓存键：`cacheKey('user_permissions', 12)` → `user:permissions:12`
 *
 * 参数个数必须与 pattern 里的通配段数一致，多给或少给都会拼出与目录不匹配
 * 的键（读不到缓存 / 删不掉缓存），因此直接抛错而不是静默拼接。
 * 前缀以 `:` 结尾的模板不会多补分隔符，故 `cacheKey('ip_blacklist_exact')`
 * 正确得到单键 `ip-blacklist:exact`。
 */
export function cacheKey(
  id: CacheCatalogId,
  ...parts: Array<string | number>
): string {
  const template = TEMPLATE_BY_ID.get(id);
  // id 由目录数据派生，正常必有命中；缺条目说明目录本身被改坏，直接失败不要静默拼出坏键
  if (!template) {
    throw new Error(`缓存键目录缺少条目: ${id}`);
  }

  const slots = COUNT_PLACEHOLDER(template);
  if (parts.length !== slots) {
    throw new Error(
      `cacheKey(${id}) 需要 ${slots} 个参数（目录模式 ${template.split(
        PLACEHOLDER
      ).join('*')}），实际收到 ${parts.length} 个`
    );
  }

  let key = template;
  for (const part of parts) {
    key = key.replace(PLACEHOLDER, String(part));
  }
  return key;
}
