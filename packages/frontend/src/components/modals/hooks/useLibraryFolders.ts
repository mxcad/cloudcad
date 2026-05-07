import { useCallback } from 'react';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingChildren,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockChildren,
} from '@/api-sdk';
import type { FileSystemNode } from '../../../types/filesystem';

interface FolderNode extends FileSystemNode {
  id: string;
  expanded: boolean;
  children?: FolderNode[];
  loading?: boolean;
  hasChildren?: boolean;
}

interface LibraryMeta {
  id: string;
  name: string;
}

type LibraryType = 'drawing' | 'block';

export const useLibraryFolders = (libraryType: LibraryType) => {
  const getLibraryApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingLibrary
      : libraryControllerGetBlockLibrary;

  const getChildrenApi =
    libraryType === 'drawing'
      ? libraryControllerGetDrawingChildren
      : libraryControllerGetBlockChildren;

  const getLibrary = useCallback(async (): Promise<LibraryMeta> => {
    const result = await getLibraryApi();
    if (result.error) throw result.error;
    const data = result as { id: string; name: string };
    return { id: data.id, name: data.name };
  }, [getLibraryApi]);

  const getChildren = useCallback(
    async (
      nodeId: string,
      excludeNodeId: string
    ): Promise<FolderNode[]> => {
      try {
        const result = await getChildrenApi({
          path: { nodeId },
          query: { page: 1, limit: 100 },
        });
        if (result.error) throw result.error;

        let children: FileSystemNode[] = [];

        if (result && result.nodes) {
          children = result.nodes as FileSystemNode[];
        }

        const folders: FolderNode[] = children
          .filter((child) => {
            const isFolder = child.isFolder;
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
      } catch {
        return [];
      }
    },
    [getChildrenApi]
  );

  return { getLibrary, getChildren };
};
