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
    async (nodeId: string, excludeNodeId: string): Promise<FolderNode[]> => {
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

        const folders: FolderNode[] = children
          .filter((child) => {
            const isFolder = child.isFolder === true;
            const isExcluded = child.id === excludeNodeId;
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
