import { useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { t } from '@/languages';
import {
  libraryControllerGetDrawingChildren,
  libraryControllerGetBlockChildren,
  libraryControllerCreateDrawingFolder,
  libraryControllerCreateBlockFolder,
  FileSystemNodeDto,
} from '@/api-sdk';
import { UploadQueue } from './uploadQueue';
import {
  ConflictStrategy,
  FileTreeNode,
  ImportProgress,
  ImportResult,
  ImportStats,
  ExtRefSummary,
} from './types';
import { uploadFileWithRetry } from './uploadUtils';
import { calculateFileHash } from '../../utils/hashUtils';
import { processExternalReferences } from './externalReferences';
import { isCadFile } from '../../utils/fileUtils';

/**
 * 导入执行子 hook
 * 职责：并发文件上传（executeImport）与取消（cancelImport）
 */
export function useImportExecutor(
  setProgress: Dispatch<SetStateAction<ImportProgress>>
) {
  const abortRef = useRef(false);
  const uploadQueueRef = useRef<UploadQueue | null>(null);

  /**
   * 执行导入
   */
  const executeImport = useCallback(
    async (
      tree: FileTreeNode,
      targetParentId: string,
      libraryType: 'drawing' | 'block',
      strategy: ConflictStrategy,
      enableAutoXrefDiscovery: boolean = false,
      onExtRefUpdate?: (summary: ExtRefSummary) => void
    ): Promise<ImportResult> => {
      abortRef.current = false;
      const stats: ImportStats = {
        totalFiles: 0,
        totalFolders: 0,
        successFiles: 0,
        skippedFiles: 0,
        failedFiles: 0,
        createdFolders: 0,
        skippedFolders: 0,
      };
      const errors: Array<{ fileName: string; error: string }> = [];
      const uploadedFileNodes: Array<{ nodeId: string; fileName: string }> = [];

      // 统计文件数
      // 仅统计可导入的 CAD 文件；图片等文件保留在文件树中作为外部参照匹配源，不参与普通上传
      const countFiles = (node: FileTreeNode) => {
        if (!node.children) return;
        for (const child of node.children) {
          if (child.isFolder) {
            stats.totalFolders++;
            countFiles(child);
          } else {
            const ext = '.' + (child.name.split('.').pop() || '').toLowerCase();
            if (!isCadFile(ext)) continue;
            stats.totalFiles++;
          }
        }
      };
      countFiles(tree);

      // 初始化上传队列
      // 从配置中读取并发数，默认 3
      const maxConcurrent = 3; // 可从环境变量或配置文件读取
      uploadQueueRef.current = new UploadQueue(maxConcurrent);

      setProgress({
        currentFile: 0,
        totalFiles: stats.totalFiles,
        currentFileName: '',
        percentage: 0,
        status: 'uploading',
        message: t('开始导入...'),
      });

      // 递归导入
      const importNode = async (
        node: FileTreeNode,
        currentParentId: string
      ) => {
        if (abortRef.current) return;
        if (!node.children) return;

        // 先创建文件夹
        for (const child of node.children) {
          if (child.isFolder) {
            try {
              const result =
                libraryType === 'drawing'
                  ? await libraryControllerCreateDrawingFolder({
                      body: {
                        name: child.name,
                        parentId: currentParentId,
                        skipIfExists: true,
                      },
                    })
                  : await libraryControllerCreateBlockFolder({
                      body: {
                        name: child.name,
                        parentId: currentParentId,
                        skipIfExists: true,
                      },
                    });

              // result 已是解包后的数据
              const folderData: FileSystemNodeDto | undefined = result.data;
              if (folderData?.id) {
                const isNewFolder =
                  folderData.createdAt === folderData.updatedAt;
                if (isNewFolder) {
                  stats.createdFolders++;
                } else {
                  stats.skippedFolders++;
                }
                // 无论新建还是已存在，都递归导入子节点
                await importNode(child, folderData.id);
              } else {
                // 如果返回数据异常，尝试通过查询获取已存在的文件夹
                const childrenResponse =
                  libraryType === 'drawing'
                    ? await libraryControllerGetDrawingChildren({
                        path: { nodeId: currentParentId },
                      })
                    : await libraryControllerGetBlockChildren({
                        path: { nodeId: currentParentId },
                      });
                const nodeList =
                  childrenResponse.data?.nodes ||
                  childrenResponse.data?.nodes ||
                  [];
                const existingFolder = nodeList.find(
                  (n: FileSystemNodeDto) =>
                    n.isFolder &&
                    n.name.toLowerCase() === child.name.toLowerCase()
                );
                if (existingFolder) {
                  stats.skippedFolders++;
                  await importNode(child, existingFolder.id);
                } else {
                  throw new Error(t('文件夹创建失败且未找到已存在的文件夹'));
                }
              }
            } catch (error) {
              // 文件夹创建失败，尝试查找已存在的文件夹
              try {
                const childrenResponse =
                  libraryType === 'drawing'
                    ? await libraryControllerGetDrawingChildren({
                        path: { nodeId: currentParentId },
                      })
                    : await libraryControllerGetBlockChildren({
                        path: { nodeId: currentParentId },
                      });
                const nodeList =
                  childrenResponse.data?.nodes ||
                  childrenResponse.data?.nodes ||
                  [];
                const existingFolder = nodeList.find(
                  (n: FileSystemNodeDto) =>
                    n.isFolder &&
                    n.name.toLowerCase() === child.name.toLowerCase()
                );
                if (existingFolder) {
                  stats.skippedFolders++;
                  // 找到已存在的文件夹，继续递归导入子节点
                  await importNode(child, existingFolder.id);
                } else {
                  // 确实不存在，记录错误
                  errors.push({
                    fileName: child.name,
                    error:
                      error instanceof Error
                        ? error.message
                        : t('创建文件夹失败'),
                  });
                  stats.failedFiles++;
                }
              } catch (fallbackError) {
                // fallback 也失败，记录错误
                errors.push({
                  fileName: child.name,
                  error:
                    fallbackError instanceof Error
                      ? fallbackError.message
                      : t('创建文件夹失败'),
                });
                stats.failedFiles++;
              }
            }
          }
        }

        // 再上传文件（使用并发队列）
        const fileUploadTasks: Promise<void>[] = [];

        for (const child of node.children) {
          if (child.isFolder || !child.file) continue;

          // 仅上传 CAD 文件；图片等文件保留在文件树中，作为外部参照匹配源
          const ext = '.' + (child.name.split('.').pop() || '').toLowerCase();
          if (!isCadFile(ext)) continue;

          // 使用并发队列上传文件
          const queue = uploadQueueRef.current;
          if (!queue) {
            throw new Error(t('上传队列未初始化'));
          }
          const uploadTask = queue.enqueue(async () => {
            if (abortRef.current) return;

            setProgress({
              currentFile:
                stats.successFiles + stats.skippedFiles + stats.failedFiles,
              totalFiles: stats.totalFiles,
              currentFileName: child.name,
              percentage: Math.round(
                ((stats.successFiles + stats.skippedFiles + stats.failedFiles) /
                  stats.totalFiles) *
                  100
              ),
              status: 'uploading',
              message: `${t('正在上传: ')}${child.name}`,
            });

            try {
              // 上传文件（后端根据 conflictStrategy 处理同名）
              // 必须用内容 MD5：后端以 32 位 hex 校验 fileHash 并据此生成转换产物/preloading 路径
              const hash = await calculateFileHash(child.file!);
              const uploadResult = await uploadFileWithRetry(
                child.file!,
                hash,
                currentParentId,
                strategy
              );

              if (uploadResult) {
                // 检查是否是秒传（文件已存在）
                if (
                  uploadResult.isUseServerExistingFile &&
                  strategy === 'skip'
                ) {
                  stats.skippedFiles++;
                } else {
                  stats.successFiles++;
                }
                // 记录 nodeId 用于后续外部参照处理
                if (uploadResult.nodeId) {
                  uploadedFileNodes.push({
                    nodeId: uploadResult.nodeId,
                    fileName: child.name,
                  });
                }
              } else {
                stats.failedFiles++;
                errors.push({
                  fileName: child.name,
                  error: t('上传失败'),
                });
              }
            } catch (error) {
              stats.failedFiles++;
              errors.push({
                fileName: child.name,
                error: error instanceof Error ? error.message : t('上传失败'),
              });
            }
          });

          fileUploadTasks.push(uploadTask);
        }

        // 等待当前文件夹下所有文件上传完成
        await Promise.all(fileUploadTasks);
      };

      await importNode(tree, targetParentId);

      // 等待一小段时间确保数据库写入完成
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 静默处理外部参照——当 enableAutoXrefDiscovery 为 true 时异步处理，不阻塞弹框关闭
      if (
        enableAutoXrefDiscovery &&
        uploadedFileNodes.length > 0 &&
        !abortRef.current
      ) {
        // 异步处理外部参照（fire-and-forget，不阻塞弹框关闭），汇总经 onExtRefUpdate 上报
        processExternalReferences(
          uploadedFileNodes,
          tree,
          onExtRefUpdate
        ).catch((err) => {
          console.warn('外部参照处理异常:', err);
          onExtRefUpdate?.({
            status: 'error',
            matched: 0,
            uploaded: 0,
            failed: 0,
            missing: 0,
          });
        });
      }

      const finalProgress: ImportProgress = {
        currentFile: stats.totalFiles,
        totalFiles: stats.totalFiles,
        currentFileName: '',
        percentage: 100,
        status: abortRef.current ? 'failed' : 'completed',
        message: abortRef.current
          ? t('导入已取消')
          : `${t('导入完成：成功 ')}${stats.successFiles}${t('，跳过 ')}${stats.skippedFiles}${t('，失败 ')}${stats.failedFiles}`,
      };

      setProgress(finalProgress);

      return {
        success: !abortRef.current && stats.failedFiles === 0,
        stats,
        errors,
      };
    },
    [setProgress]
  );

  /**
   * 取消导入
   */
  const cancelImport = useCallback(() => {
    abortRef.current = true;
    setProgress((prev) => ({
      ...prev,
      status: 'failed',
      message: t('导入已取消'),
    }));
  }, [setProgress]);

  const resetExecutor = useCallback(() => {
    abortRef.current = false;
    uploadQueueRef.current = null;
  }, []);

  return { executeImport, cancelImport, resetExecutor };
}
