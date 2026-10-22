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
