import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fileSystemControllerGetNode,
  fileSystemControllerGetRootNode,
  fileSystemControllerGetPersonalSpace,
} from '@/api-sdk';
import { openUploadedFile } from '../../../services/mxcadManager';
import type { FileSystemNode } from '../../../types/filesystem';

export const useFileSystemNavigation = (isAuthenticated: boolean) => {
  // 查询私人空间
  const { data: personalSpaceId = null } = useQuery<string | null>({
    queryKey: ['personalSpace'],
    queryFn: async () => {
      const result = await fileSystemControllerGetPersonalSpace();
      if (result.error) throw result.error;
      const data = result.data as { id?: string } | undefined;
      return data?.id || null;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // 获取节点信息
  const getNode = useCallback(async (nodeId: string) => {
    const result = await fileSystemControllerGetNode({ path: { nodeId } });
    return result.data;
  }, []);

  // 获取根节点
  const getRootNode = useCallback(async (nodeId: string) => {
    const result = await fileSystemControllerGetRootNode({ path: { nodeId } });
    return result.data;
  }, []);

  // 打开图纸
  const handleDrawingOpen = useCallback(
    async (node: FileSystemNode, libraryType?: 'drawing' | 'block') => {
      try {
        // 如果是库文件，使用新的打开方式
        if (libraryType === 'drawing' || libraryType === 'block') {
          const { openLibraryDrawing, openLibraryBlock } = await import(
            '../../../services/mxcadManager'
          );

          if (libraryType === 'drawing') {
            await openLibraryDrawing(node.id, node.name, node.path, node.updatedAt);
          } else {
            await openLibraryBlock(node.id, node.name, node.path, node.updatedAt);
          }
          return;
        }

        // 项目文件
        const file = await getNode(node.id);

        if (!file?.fileHash) {
          console.error('文件尚未转换完成');
          return;
        }

        // 获取项目根节点 ID
        let targetProjectId: string | null | undefined = file.parentId || null;
        if (!file.isRoot && file.parentId) {
          try {
            if (!file.id) throw new Error('节点ID缺失');
            const rootNode = await getRootNode(file.id);
            if (rootNode?.id) {
              targetProjectId = rootNode.id;
            }
          } catch (error) {
            console.error('获取根节点失败:', error);
          }
        } else if (file.isRoot) {
          targetProjectId = file.id;
        }

        await openUploadedFile(node.id, file.parentId || targetProjectId || '');
      } catch (error) {
        console.error('打开图纸失败:', error);
      }
    },
    [getNode, getRootNode]
  );

  return {
    personalSpaceId,
    handleDrawingOpen,
    getNode,
    getRootNode,
  };
};
