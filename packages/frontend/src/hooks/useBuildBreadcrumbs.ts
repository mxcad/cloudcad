///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback } from 'react';
import { nodeControllerGetNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

/**
 * 构建面包屑路径
 *
 * 从指定 nodeId 向上遍历 parentId，构建完整的面包屑路径。
 * 支持最大深度限制防止无限循环。
 */
export function useBuildBreadcrumbs() {
  const buildBreadcrumbPath = useCallback(
    async (nodeId: string): Promise<BreadcrumbItem[]> => {
      try {
        const path: BreadcrumbItem[] = [];
        let currentId: string | null = nodeId;
        let depth = 0;
        const MAX_DEPTH = 20;

        while (currentId && depth < MAX_DEPTH) {
          try {
            const result = await nodeControllerGetNode({
              path: { nodeId: currentId },
            });
            // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
            if (result.error) throw result.error;
            const node = result.data as
              | { id: string; name: string; parentId?: string | null }
              | undefined;
            if (node) {
              path.unshift({ id: node.id, name: node.name });
              currentId = node.parentId || null;
              depth++;
            } else {
              break;
            }
          } catch (error: unknown) {
            handleError(
              error,
              `useBuildBreadcrumbs: 获取节点 ${currentId} 失败`
            );
            break;
          }
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
