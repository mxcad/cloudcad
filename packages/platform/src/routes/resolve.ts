/**
 * 跨端路由解析——正反向的唯一出口。
 *
 * 刻意不产出完整 URL：部署 base（`/` vs `/mxcad_mobile/`）、hash 模式（`#` 前
 * 还是之后）、凭证搬运都是端侧的事。本函数只负责「业务语义 → 路由 path + query」。
 *
 * 约定：映射表中 mobilePath 的路径参数名必须与 pcPath 同名（如 `:projectId`
 * 两端都是 `:projectId`），才能被 `renderPathPattern` 直接承接；其余差异用
 * `queryFromParams` 以 query 形式搬运。
 */

import {
  MOBILE_TO_PC_ALIASES,
  NON_MAPPABLE_PC_PREFIXES,
  ROUTE_ALIASES,
  type RouteAlias,
} from './aliases';
import { matchPathPattern, renderPathPattern } from './match';

export interface ResolvedRoute {
  /** 目标端路由 path（`:param` 已替换为实际值） */
  path: string;
  /** 合并后的 query 字段 */
  query: Record<string, string>;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 畸形编码（半截 %E4）保持原样，不抛错中断整条路由解析
    return value;
  }
}

/**
 * 解析 search 串为字段表。容忍前导 `?` 与空串。
 *
 * 手写解析而非迭代 `URLSearchParams`：本包源码会被消费端一起 type-check，
 * 移动端 tsconfig 的 lib 不含 `DOM.Iterable`，`for...of URLSearchParams` 会报
 * TS2488。顺带避开了 `URLSearchParams` 对 `+` 的自动归一化（此处不做）。
 */
export function parseSearch(search: string | undefined): Record<string, string> {
  if (!search) return {};
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  if (trimmed.length === 0) return {};

  const out: Record<string, string> = {};
  for (const part of trimmed.split('&')) {
    if (part.length === 0) continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? '' : part.slice(eq + 1);
    out[decodeSegment(rawKey)] = decodeSegment(rawValue);
  }
  return out;
}

function matchAlias(
  pcPathname: string
): { alias: RouteAlias; params: Record<string, string> } | null {
  for (const entry of ROUTE_ALIASES) {
    const params = matchPathPattern(entry.pcPattern, pcPathname);
    if (params) return { alias: entry, params };
  }
  return null;
}

/**
 * 该 PC 路径是否有移动端对应。
 *
 * 命中不可映射前缀（`/admin/*` 等桌面管理端）一律返回 false。
 */
export function isMappableRoute(pcPathname: string): boolean {
  if (NON_MAPPABLE_PC_PREFIXES.some((prefix) => pcPathname.startsWith(prefix))) {
    return false;
  }
  return matchAlias(pcPathname) !== null;
}

/**
 * 正向解析：PC 路径 → 移动端路由。
 *
 * 返回 null 表示不可映射。调用方不应把 null 当错误——「无法映射」是正常的
 * 业务分支，走降级提示即可，而不是报错或静默白屏。
 *
 * query 合并顺序：原 query（用户上下文，如 shareToken / v / back）
 * → fixedQuery（语义固有，如 domain=personal）→ queryFromParams（实例参数，
 * 如 fileId）。后者优先，确保语义固有属性不被用户 query 覆盖。
 */
export function resolveMobileRoute(input: {
  pcPathname: string;
  pcSearch?: string;
}): ResolvedRoute | null {
  const matched = matchAlias(input.pcPathname);
  if (!matched) return null;

  const { alias, params } = matched;

  const query: Record<string, string> = { ...parseSearch(input.pcSearch) };
  for (const [key, value] of Object.entries(alias.fixedQuery ?? {})) {
    query[key] = value;
  }
  for (const [queryKey, paramKey] of Object.entries(alias.queryFromParams ?? {})) {
    const value = params[paramKey];
    if (value !== undefined) {
      query[queryKey] = value;
    }
  }

  return {
    path: renderPathPattern(alias.mobilePattern, params),
    query,
  };
}

/**
 * 反向解析：移动端页面 → PC canonical 路径。
 *
 * 只覆盖页面级语义。文件级的精确返回依赖当前文件的 projectId / path 上下文，
 * 由各端编辑器状态处理，不在静态表内。
 *
 * 用于移动端「用电脑端打开」入口；返回的是纯 path，base 与 query 由调用方拼。
 */
export function resolvePcPath(input: { mobilePathname: string }): string | null {
  for (const entry of MOBILE_TO_PC_ALIASES) {
    const params = matchPathPattern(entry.mobilePattern, input.mobilePathname);
    if (params) return renderPathPattern(entry.pcPattern, params);
  }
  return null;
}
