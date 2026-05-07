import { useCallback } from 'react';
import { fileSystemControllerGetChildren } from '@/api-sdk';
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
        const childrenResponse = await fileSystemControllerGetChildren({
          path: { nodeId },
        });

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
