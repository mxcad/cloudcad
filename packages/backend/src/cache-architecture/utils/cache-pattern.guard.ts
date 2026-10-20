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

/**
 * 「按模式删除」的服务端校验
 *
 * 白名单不在此处手写，全部从 CACHE_KEY_CATALOG 派生（目录是唯一清单）：
 * 1. 模式必须逐字等于目录中某条 scope === 'cache' 的条目——管理员只能删目录里
 *    声明过的业务缓存，拼不出目录外的键（如 `*`、`mxcad:sess:*`）；
 * 2. 该模式的静态前缀不得被任何 infra 条目覆盖。Redis glob 的 `*` 会跨越 `:`
 *    分段，一旦有 infra 键与可删模式共享前缀，宽模式就会顺带删掉它（历史上
 *    `user:*` 命中过 `user:blacklist:*`；该键随 Gitea #484 退役，当前目录里没有
 *    共享前缀的组合，规则保留为新增 infra 键的自动保护区）；这类「标为 cache
 *    但通配范围越界」的模式同样拒绝，并把越界目标回传给调用方写进错误信息。
 *
 * 判定在模块加载时算好一次，运行期只是 Set 查找。新增可删模式只需在目录里
 * 加一条 scope: 'cache' 的条目；新增基础设施键同理标 scope: 'infra' 即自动
 * 进入保护区。
 */

/** Redis SCAN MATCH 的 glob（仅 `*` 与 `?`）转全串正则，供 L1 与守卫共用 */
export function globToRegExp(pattern: string): RegExp {
  let regexStr = '';
  for (const char of pattern) {
    if (char === '*') {
      regexStr += '.*';
    } else if (char === '?') {
      regexStr += '.';
    } else {
      regexStr += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${regexStr}$`);
}

/** 模式必然以之开头的静态前缀（剥掉尾部连续通配符） */
function staticHead(pattern: string): string {
  return pattern.replace(/[*?]+$/, '');
}

const CACHE_PATTERNS = new Set(
  CACHE_KEY_CATALOG.filter((entry) => entry.scope === 'cache').map(
    (entry) => entry.pattern
  )
);

const INFRA_PATTERNS = CACHE_KEY_CATALOG.filter(
  (entry) => entry.scope === 'infra'
).map((entry) => entry.pattern);

/**
 * 该模式会连带命中的基础设施模式（静态前缀被覆盖即算波及）。显式接收 infra 清单，
 * 便于用合成数据验证这条分支——当前目录里没有 infra 键与可删模式共享前缀，
 * 靠真实目录测不到它。
 */
export function infraOverlapOf(
  pattern: string,
  infraPatterns: readonly string[]
): string[] {
  const head = staticHead(pattern);
  return infraPatterns.filter((infra) => infra.startsWith(head));
}

/** 「按模式删除」放行的模式全集（供错误信息提示可选值） */
export const DELETABLE_CACHE_PATTERNS: readonly string[] = (() => {
  const deletable: string[] = [];
  for (const pattern of CACHE_PATTERNS) {
    if (infraOverlapOf(pattern, INFRA_PATTERNS).length === 0) {
      deletable.push(pattern);
    }
  }
  return deletable.sort();
})();

export type PatternDeleteReason =
  | 'not-in-catalog'
  | 'overlaps-infra';

export interface PatternDeleteDecision {
  ok: boolean;
  reason?: PatternDeleteReason;
  /** reason === 'overlaps-infra' 时被波及的基础设施模式 */
  overlap?: string[];
}

/** 判定一个模式能否交给 deleteByPattern 执行 */
export function decidePatternDelete(pattern: string): PatternDeleteDecision {
  const trimmed = (pattern ?? '').trim();
  if (!trimmed || !CACHE_PATTERNS.has(trimmed)) {
    return { ok: false, reason: 'not-in-catalog' };
  }

  const overlap = infraOverlapOf(trimmed, INFRA_PATTERNS);
  if (overlap.length > 0) {
    return { ok: false, reason: 'overlaps-infra', overlap };
  }

  return { ok: true };
}
