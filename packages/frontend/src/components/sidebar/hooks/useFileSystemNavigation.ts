import { useCallback } from 'react';
import { t } from '@/languages';
import {
  fileSystemControllerGetNode,
  fileSystemControllerGetRootNode,
} from '@/api-sdk';
import type { FileSystemNode } from '../../../types/filesystem';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';

export const useFileSystemNavigation = (isAuthenticated: boolean) => {
  // 查询私人空间（使用共享 hook）
  const { data: personalSpaceData } = usePersonalSpaceQuery({
    enabled: isAuthenticated,
  });
  const personalSpaceId = personalSpaceData?.id || null;

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
            if (!file.id) throw new Error(t('节点ID缺失'));
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

        const { openUploadedFile } = await import('../../../services/mxcadManager');
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
