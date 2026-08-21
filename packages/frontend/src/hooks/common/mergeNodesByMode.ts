///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

export type MergeMode = 'replace' | 'append' | 'prepend';

/**
 * 滚动分页数据合并纯函数（useAccumulatedPagination / useLibraryLoader 共用）
 *
 * - replace：整体替换为最新数据；
 * - append：在现有数据后追加（按 id 去重，重复 id 保留旧位置）；
 * - prepend：在现有数据前前插（按 id 去重，重复 id 保留新位置）。
 *
 * 泛型 <T extends { id: string }>：任意列表形态数据（文件节点/用户/IP 黑名单/审计日志）共用
 * （ADR-0052）。
 */
export function mergeNodesByMode<T extends { id: string }>(
  prev: T[],
  incoming: T[],
  mode: MergeMode
): T[] {
  if (mode === 'replace') return incoming;
  const map = new Map<string, T>();
  if (mode === 'append') {
    prev.forEach((n) => map.set(n.id, n));
    incoming.forEach((n) => {
      if (!map.has(n.id)) map.set(n.id, n);
    });
  } else {
    // prepend
    incoming.forEach((n) => map.set(n.id, n));
    prev.forEach((n) => {
      if (!map.has(n.id)) map.set(n.id, n);
    });
  }
  return Array.from(map.values());
}
