import { useCallback, useState } from 'react';
import {
  libraryControllerGetDrawingChildren,
  libraryControllerGetBlockChildren,
  FileSystemNodeDto,
} from '@/api-sdk';
import { ConflictStrategy, FileTreeNode } from './types';

/**
 * 冲突检测子 hook
 * 职责：递归检测文件树中的同名冲突（文件夹冲突跳过、文件冲突记录默认策略）
 */
export function useConflictDetection() {
  const [conflicts, setConflicts] = useState<
    Array<{
      fileName: string;
      relativePath: string;
      strategy: ConflictStrategy;
    }>
  >([]);

  const detectConflicts = useCallback(
    async (
      tree: FileTreeNode,
      targetParentId: string,
      libraryType: 'drawing' | 'block'
    ) => {
      const conflictList: Array<{
        fileName: string;
        relativePath: string;
        strategy: ConflictStrategy;
      }> = [];

      // 递归检测冲突
      const checkNode = async (node: FileTreeNode, currentParentId: string) => {
        if (!node.children) return;

        for (const child of node.children) {
          if (child.isFolder) {
            // 检查文件夹是否存在
            try {
              const response =
                libraryType === 'drawing'
                  ? await libraryControllerGetDrawingChildren({
                      path: { nodeId: currentParentId },
                    })
                  : await libraryControllerGetBlockChildren({
                      path: { nodeId: currentParentId },
                    });
              const nodeList = response.data?.nodes || [];
              const existingFolder = nodeList.find(
                (c: FileSystemNodeDto) =>
                  c.isFolder &&
                  c.name.toLowerCase() === child.name.toLowerCase()
              );

              if (existingFolder) {
                // 文件夹冲突：总是跳过（不创建）
                await checkNode(child, existingFolder.id);
              }
            } catch (error) {
              console.error('检测文件夹冲突失败:', error);
            }
          } else {
            // 文件冲突：记录到冲突列表
            conflictList.push({
              fileName: child.name,
              relativePath: child.relativePath,
              strategy: 'skip', // 默认策略
            });
          }
        }
      };

      await checkNode(tree, targetParentId);
      setConflicts(conflictList);
      return conflictList;
    },
    []
  );

  const resetConflicts = useCallback(() => {
    setConflicts([]);
  }, []);

  return { conflicts, detectConflicts, resetConflicts };
}
