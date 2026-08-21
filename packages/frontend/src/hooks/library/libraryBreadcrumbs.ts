///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { FileSystemNodeDto } from '@/api-sdk';
import { getNodeApi, type BreadcrumbItem, type LibraryType } from './libraryQueryHelpers';

async function getNodePath(
  type: LibraryType,
  nodeId: string,
  libraryId: string
): Promise<BreadcrumbItem[]> {
  const nodeApi = getNodeApi(type);
  const nodeResponse = await nodeApi({ path: { nodeId } });
  if (nodeResponse.error) throw nodeResponse.error;

  // FileSystemNodeDto 没有 parent 字段，但 API 响应实际包含
  const nodeData = nodeResponse.data as FileSystemNodeDto & {
    parent?: { id: string; name: string };
  };

  if (nodeData.id === libraryId) {
    return [];
  }

  let path: BreadcrumbItem[] = [];
  if (nodeData.parentId && nodeData.parentId !== libraryId) {
    path = await getNodePath(type, nodeData.parentId, libraryId);
  }

  path.push({ id: nodeData.id, name: nodeData.name });
  return path;
}

export async function buildBreadcrumbs(
  type: LibraryType,
  libraryData: { libraryId: string },
  nodeId: string
): Promise<BreadcrumbItem[]> {
  const nodeApi = getNodeApi(type);

  try {
    const nodeResponse = await nodeApi({ path: { nodeId } });
    if (nodeResponse.error) throw nodeResponse.error;
    const nodeData = nodeResponse.data as FileSystemNodeDto & {
      parent?: { id: string; name: string };
    };

    if (nodeData.id === libraryData.libraryId) {
      return [];
    }

    // 获取子节点路径（不包含根节点）
    const pathNodes = await getNodePath(
      type,
      nodeData.id,
      libraryData.libraryId
    );
    return pathNodes;
  } catch {
    try {
      const nodeResponse = await nodeApi({ path: { nodeId } });
      if (!nodeResponse.error) {
        const nodeData = nodeResponse.data as FileSystemNodeDto & {
          parent?: { id: string; name: string };
        };
        if (nodeData.parent && nodeData.parent.id !== libraryData.libraryId) {
          return [
            {
              id: nodeData.parent.id,
              name: nodeData.parent.name,
            },
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
}
