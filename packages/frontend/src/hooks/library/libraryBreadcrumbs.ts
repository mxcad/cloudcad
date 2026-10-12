///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { FileSystemNodeDto } from '@/api-sdk';
import {
  resolveAncestorPath,
  type AncestorClient,
  type BreadcrumbItem,
} from '@/lib/ancestorPath';
import { getNodeApi, type LibraryType } from './libraryQueryHelpers';

/**
 * 降级路径：主链遍历失败后，用非 throwOnError 的单次请求拼「父 + 节点」两段；
 * 仍失败则静默返回空数组（库侧边栏面包屑允许缺失，不阻塞列表展示）。
 */
async function fallbackBreadcrumbs(
  type: LibraryType,
  libraryId: string,
  nodeId: string
): Promise<BreadcrumbItem[]> {
  try {
    const nodeResponse = await getNodeApi(type)({ path: { nodeId } });
    if (!nodeResponse.error) {
      // FileSystemNodeDto 没有 parent 字段，但 API 响应实际包含
      const nodeData = nodeResponse.data as FileSystemNodeDto & {
        parent?: { id: string; name: string };
      };
      if (nodeData.parent && nodeData.parent.id !== libraryId) {
        return [
          { id: nodeData.parent.id, name: nodeData.parent.name },
          { id: nodeData.id, name: nodeData.name },
        ];
      }
      return [{ id: nodeData.id, name: nodeData.name }];
    }
  } catch {
    // 静默失败
  }
  return [];
}

/**
 * 构建库内面包屑（seam adapter：遍历到库根即止，库根不入路径）。
 *
 * 祖先链遍历本身在 `resolveAncestorPath`（唯一实现）；本 adapter 只负责
 * 库类型 API 客户端注入、stopAt=库根，以及失败时的两段降级/空数组语义。
 */
export async function buildBreadcrumbs(
  type: LibraryType,
  libraryData: { libraryId: string },
  nodeId: string
): Promise<BreadcrumbItem[]> {
  const client: AncestorClient = {
    getNode: async (id) => {
      const nodeResponse = await getNodeApi(type)({
        throwOnError: true,
        path: { nodeId: id },
      });
      return (nodeResponse.data ?? null) as BreadcrumbItem & {
        parentId?: string | null;
      } | null;
    },
  };

  const { path, complete } = await resolveAncestorPath(nodeId, {
    client,
    stopAt: (node) => node.id === libraryData.libraryId,
  });
  if (complete) {
    return path;
  }
  return fallbackBreadcrumbs(type, libraryData.libraryId, nodeId);
}
