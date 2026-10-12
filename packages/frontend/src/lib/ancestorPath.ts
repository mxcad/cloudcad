///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * 祖先路径项（面包屑最小形状：id + name）——全仓唯一声明。
 * 消费方（useBuildBreadcrumbs / libraryBreadcrumbs / 面板 props）一律引用本类型，
 * 禁止再各自声明副本。内核导航项（含 isRoot/editName）是另一个概念，见
 * `@/types/filesystem` 的 BreadcrumbItem。
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
}

/** 祖先链遍历返回的节点形状（parentId 可选：根节点无父） */
export interface AncestorNode {
  id: string;
  name: string;
  parentId?: string | null;
}

/** 节点读取客户端：adapter 各自注入（nodeController / 库类型 API） */
export interface AncestorClient {
  getNode(nodeId: string): Promise<AncestorNode | null>;
}

export interface ResolveAncestorPathOptions {
  client: AncestorClient;
  /** 命中即停止且该节点不入路径（如库根）；缺省仅 parentId 为空时停止 */
  stopAt?: (node: AncestorNode) => boolean;
  /** 最大遍历深度，防无限循环，默认 20 */
  maxDepth?: number;
}

export interface AncestorPathResult {
  /** 根→叶顺序（stopAt 命中的节点不含在内） */
  path: BreadcrumbItem[];
  /** true = 到达停止条件（根/stopAt）；false = 被错误/深度上限/节点缺失中断 */
  complete: boolean;
  /** complete=false 时中断处的节点 ID */
  failedId?: string;
  /** complete=false 且由错误中断时的原始错误（供 adapter 记录/降级） */
  error?: unknown;
}

/**
 * 从 nodeId 沿 parentId 向上遍历祖先链（全仓唯一遍历实现）。
 *
 * 只返回结构化事实（已解析路径 + 是否完整 + 中断点），不吞错、不占位——
 * 失败语义由 seam 上的 adapter 决定（根目录占位 / 空数组降级等）。
 */
export async function resolveAncestorPath(
  nodeId: string,
  options: ResolveAncestorPathOptions
): Promise<AncestorPathResult> {
  const { client, stopAt, maxDepth = 20 } = options;
  const path: BreadcrumbItem[] = [];
  let currentId: string | null = nodeId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    let node: AncestorNode | null;
    try {
      node = await client.getNode(currentId);
    } catch (error) {
      return { path, complete: false, failedId: currentId, error };
    }
    if (!node) {
      return { path, complete: false, failedId: currentId };
    }
    if (stopAt?.(node)) {
      return { path, complete: true };
    }
    path.unshift({ id: node.id, name: node.name });
    currentId = node.parentId || null;
    depth++;
  }

  return { path, complete: currentId === null };
}
