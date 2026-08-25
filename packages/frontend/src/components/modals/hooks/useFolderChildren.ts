import { useCallback } from 'react';
import { nodeControllerGetChildren } from '@/api-sdk';
import type { FileSystemNode } from '../../../types/filesystem';
import { handleError } from '@/utils/errorHandler';

interface FolderNode extends FileSystemNode {
  id: string;
  expanded: boolean;
  children?: FolderNode[];
  loading?: boolean;
  hasChildren?: boolean;
}

export const useFolderChildren = () => {
  const loadChildren = useCallback(
    async (
      nodeId: string,
      /** 需要从列表剔除的节点（被移动/复制源；支持批量多选集合）——其后代因父链断开而不可达 */
      excludeNodeIds?: string | string[] | null
    ): Promise<FolderNode[]> => {
      try {
        const childrenResponse = await nodeControllerGetChildren({
          path: { nodeId },
        });
        // SDK 默认不抛错：错误在 result.error，必须显式抛出否则 catch 是死代码
        if (childrenResponse?.error) throw childrenResponse.error;

        let children: FileSystemNode[] = [];

        if (childrenResponse?.data?.nodes) {
          children = (childrenResponse.data.nodes || []) as FileSystemNode[];
        }

        const excluded = new Set(
          Array.isArray(excludeNodeIds)
            ? excludeNodeIds
            : excludeNodeIds
              ? [excludeNodeIds]
              : []
        );

        const folders: FolderNode[] = children
          .filter((child) => {
            const isFolder = child.isFolder === true;
            const isExcluded = excluded.has(child.id);
            return isFolder && !isExcluded && child.id;
          })
          .map((folder) => ({
            ...folder,
            id: folder.id!,
            expanded: false,
            children: [],
            loading: false,
            hasChildren: true,
          }));

        return folders;
      } catch (err) {
        handleError(err, 'loadChildren');
        return [];
      }
    },
    []
  );

  return { loadChildren };
};
