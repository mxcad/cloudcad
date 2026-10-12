///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback } from 'react';
import { nodeControllerGetNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import {
  resolveAncestorPath,
  type AncestorClient,
  type BreadcrumbItem,
} from '@/lib/ancestorPath';

export type { BreadcrumbItem } from '@/lib/ancestorPath';

/**
 * 构建面包屑路径（seam adapter：遍历到根，失败/空路径降级为根目录占位）。
 *
 * 祖先链遍历本身在 `resolveAncestorPath`（唯一实现）；本 hook 只负责
 * nodeController 客户端注入与「空路径 → 根目录占位」的失败语义。
 */
export function useBuildBreadcrumbs() {
  const buildBreadcrumbPath = useCallback(
    async (nodeId: string): Promise<BreadcrumbItem[]> => {
      const client: AncestorClient = {
        getNode: async (id) => {
          // SDK 默认不抛错：失败时错误在 result.error，throwOnError 显式抛出让核心记录真实原因
          const result = await nodeControllerGetNode({
            throwOnError: true,
            path: { nodeId: id },
          });
          return (result.data ?? null) as BreadcrumbItem & {
            parentId?: string | null;
          } | null;
        },
      };

      try {
        const { path, complete, failedId, error } =
          await resolveAncestorPath(nodeId, { client });
        if (!complete) {
          handleError(
            error ?? new Error('ancestor path incomplete'),
            `useBuildBreadcrumbs: 获取节点 ${failedId ?? nodeId} 失败`
          );
        }

        if (path.length === 0) {
          return [{ id: nodeId, name: t('根目录') }];
        }

        return path;
      } catch (error: unknown) {
        handleError(error, 'useBuildBreadcrumbs: 构建面包屑路径失败');
        return [{ id: nodeId, name: t('根目录') }];
      }
    },
    []
  );

  return { buildBreadcrumbPath };
}
