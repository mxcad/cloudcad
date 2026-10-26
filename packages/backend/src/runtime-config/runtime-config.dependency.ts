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

/**
 * 开关依赖门禁的纯函数层（ADR-0082）。
 *
 * 依赖边从定义表的 `requires` 声明派生（单一事实源），本文件不持有任何键名
 * 清单。所有函数无 IO、无框架依赖，可独立单测。
 */

import type { RuntimeConfigDefinition } from './runtime-config.types';
import type { ConfigDependencyViolation } from './runtime-config.types';
import type { ConfigConflictViolation } from './runtime-config.types';

/** 一条依赖边：dependent 为 true 时 required 必须同为 true */
export interface ConfigDependencyEdge {
  dependent: string;
  required: string;
}

/**
 * 从定义表派生全部依赖边（`requires` 声明的展开）。
 */
export function getDependencyEdges(
  definitions: RuntimeConfigDefinition[]
): ConfigDependencyEdge[] {
  const edges: ConfigDependencyEdge[] = [];
  for (const def of definitions) {
    for (const required of def.requires ?? []) {
      edges.push({ dependent: def.key, required });
    }
  }
  return edges;
}

/**
 * 找出「新制造」的依赖违规：最终态里依赖方为开而依赖项为关，且当前态并非
 * 已处于该不一致状态。
 *
 * 已存在的遗留不一致（门禁上线前留下的「验证开+通道关」）不算新违规——
 * 门禁的职责是阻止「制造新的」，遗留状态由一致性检测（detectDependencyViolations）
 * 负责揪出并上报，两者分工不同。
 *
 * @param edges 依赖边集合
 * @param current 当前生效值（仅布尔语义：true=开）
 * @param final 变更后的目标值（未变更的键与 current 相同）
 */
export function findNewDependencyViolations(
  edges: ConfigDependencyEdge[],
  current: Record<string, boolean>,
  final: Record<string, boolean>
): ConfigDependencyViolation[] {
  const result: ConfigDependencyViolation[] = [];
  for (const edge of edges) {
    const finalViolation =
      final[edge.dependent] === true && final[edge.required] !== true;
    const currentViolation =
      current[edge.dependent] === true && current[edge.required] !== true;
    if (finalViolation && !currentViolation) {
      result.push({ dependent: edge.dependent, required: edge.required });
    }
  }
  return result;
}

/**
 * 面向操作者的键名文案：「描述 (key)」，描述缺失时退回 key 本身。
 */
export function formatDependencyLabel(
  definitions: RuntimeConfigDefinition[],
  key: string
): string {
  const def = definitions.find((d) => d.key === key);
  return def?.description ? `${def.description} (${key})` : key;
}

/**
 * 依赖图无环检测（DFS 三色标记）。环会让门禁的「沿依赖递归」语义失去定义。
 * @returns 参与环的 key 列表；无环时为空数组
 */
export function findDependencyCycles(
  edges: ConfigDependencyEdge[]
): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.dependent) ?? [];
    list.push(edge.required);
    adjacency.set(edge.dependent, list);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const inCycle = new Set<string>();

  const visit = (node: string, stack: string[]): void => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) {
        // 回边：栈上从 next 到栈顶的节点都在环上
        const start = stack.indexOf(next);
        for (const member of stack.slice(start)) {
          inCycle.add(member);
        }
      } else if (state === WHITE) {
        visit(next, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      visit(node, []);
    }
  }

  return [...inCycle].sort();
}

// ────────────────────────── 互斥对（conflictsWith） ──────────────────────────
//
// 与依赖边的差别：互斥关系是**对称**的（A 与 B 互斥 ⇔ B 与 A 互斥），而依赖边
// 是有向的（A requires B ≠ B requires A）。因此互斥对只需在任一侧声明一次，
// 展开时补出双向两条，门禁（set / reset / profile 批量应用）无需感知方向——
// 改 A 或改 B 都会命中同一对。

/** 一条互斥对：两个布尔键不得同时为 true */
export interface ConfigConflictPair {
  a: string;
  b: string;
}

/**
 * 从定义表派生全部互斥对（`conflictsWith` 声明的展开 + 双向补齐 + 去重）。
 *
 * 只允许单边声明：同一对若两侧都写了，按 `key < pair` 字典序去重——声明侧没有
 * 信息量，还会让「改一侧忘了另一侧」变成静默的双份维护。
 * 结果按 `a|b` 排序，保证单测与 invariant 的比对稳定。
 */
export function getConflictPairs(
  definitions: RuntimeConfigDefinition[]
): ConfigConflictPair[] {
  const seen = new Set<string>();
  const pairs: ConfigConflictPair[] = [];
  for (const def of definitions) {
    for (const other of def.conflictsWith ?? []) {
      const a = def.key < other ? def.key : other;
      const b = def.key < other ? other : def.key;
      const id = `${a}|${b}`;
      if (seen.has(id)) continue;
      seen.add(id);
      pairs.push({ a, b });
    }
  }
  return pairs.sort((x, y) => `${x.a}|${x.b}`.localeCompare(`${y.a}|${y.b}`));
}

/**
 * 找出「新制造」的互斥违规：最终态里互斥对两端同时为 true，且当前态并非已处于
 * 该共存状态。
 *
 * 已存在的遗留共存（门禁上线前的状态）不算新违规——与 findNewDependencyViolations
 * 同一分工：门禁拦「新制造」，一致性检测（detectConflictViolations）揪「已存在」。
 *
 * 对称性：传入的 pairs 由 getConflictPairs 补齐为双向，故本函数无需关心本次
 * 变更的是 a 还是 b。
 */
export function findNewConflictViolations(
  pairs: ConfigConflictPair[],
  current: Record<string, boolean>,
  final: Record<string, boolean>
): ConfigConflictViolation[] {
  const result: ConfigConflictViolation[] = [];
  for (const pair of pairs) {
    const bothOn = final[pair.a] === true && final[pair.b] === true;
    if (!bothOn) continue;
    const alreadyOn =
      current[pair.a] === true && current[pair.b] === true;
    if (alreadyOn) continue;
    result.push({ key: pair.a, other: pair.b });
  }
  return result;
}
