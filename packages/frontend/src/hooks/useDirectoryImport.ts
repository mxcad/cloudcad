///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef } from 'react';
// TODO: Replace with SDK when backend adds write/create endpoints for library. Upload methods use mxcadUploadUtils which needs its own migration.
import { libraryApi } from '../services/libraryApi';
import { mxcadApi } from '../services/mxcadApi';
import {
  uploadMxCadFile,
  MxCadUploadOptions,
  MxCadUploadResult,
} from '../utils/mxcadUploadUtils';
import type {
  NodeListResponseDto,
  FileSystemNodeDto,
} from '../types/api-client';

/**
 * 冲突策略
 */
export type ConflictStrategy = 'overwrite' | 'skip' | 'rename';

/**
 * 导入模式
 */
export type ImportMode = 'content' | 'folder';

/**
 * 文件树节点
 */
interface FileTreeNode {
  name: string;
  relativePath: string;
  isFolder: boolean;
  file?: File;
  children?: FileTreeNode[];
}

/**
 * 已选择的目录
 */
export interface SelectedDirectory {
  name: string;
  rootPath: string;
  fileCount: number;
  folderCount: number;
  mode: 'content' | 'folder';
}

/**
 * 导入统计
 */
interface ImportStats {
  totalFiles: number;
  totalFolders: number;
  successFiles: number;
  skippedFiles: number;
  failedFiles: number;
  createdFolders: number;
  skippedFolders: number;
}

/**
 * 导入进度
 */
interface ImportProgress {
  currentFile: number;
  totalFiles: number;
  currentFileName: string;
  percentage: number;
  status:
    | 'idle'
    | 'scanning'
    | 'preparing'
    | 'uploading'
    | 'completed'
    | 'failed';
  message: string;
}

/**
 * 导入结果
 */
interface ImportResult {
  success: boolean;
  stats: ImportStats;
  errors: Array<{ fileName: string; error: string }>;
}

/**
 * 上传队列
 */
/**
 * 上传队列 - 支持真正的并发执行
 */
class UploadQueue {
  private maxConcurrent: number;
  private running: number;
  private queue: Array<{ task: () => Promise<void>; resolve: () => void; reject: (error: Error) => void }>;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  /**
   * 将任务加入队列并返回 Promise
   * 任务会在并发限制允许时自动执行
   */
  enqueue(task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 处理队列中的任务
   * 关键：不 await task()，让任务异步并行执行
   */
  private processQueue(): void {
    // 启动尽可能多的任务（直到达到并发上限或队列为空）
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.running++;
      const { task, resolve, reject } = this.queue.shift()!;

      // 不 await，让任务异步执行
      task()
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          this.running--;
          // 任务完成后处理下一个
          this.processQueue();
        });
    }
  }

  /**
   * 获取当前队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 获取当前运行中的任务数
   */
  getRunningCount(): number {
    return this.running;
  }
}

/**
 * 生成唯一文件名（处理冲突）
 */
function generateUniqueFileName(
  fileName: string,
  existingNames: Set<string>
): string {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  const extension = fileName.match(/\.[^.]+$/)?.[0] || '';

  let newName = fileName;
  let counter = 1;

  while (existingNames.has(newName.toLowerCase())) {
    newName = `${nameWithoutExt}(${counter})${extension}`;
    counter++;
  }

  return newName;
}

/**
 * 批量目录导入 Hook
 */
export function useDirectoryImport() {
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [conflicts, setConflicts] = useState<
    Array<{
      fileName: string;
      relativePath: string;
      strategy: ConflictStrategy;
    }>
  >([]);
  const [progress, setProgress] = useState<ImportProgress>({
    currentFile: 0,
    totalFiles: 0,
    currentFileName: '',
    percentage: 0,
    status: 'idle',
    message: '',
  });

  const abortRef = useRef(false);
  const uploadQueueRef = useRef<UploadQueue | null>(null);
  const selectedDirsRef = useRef<SelectedDirectory[]>([]);
  const currentRootNameRef = useRef<string>('');

  /**
   * 调整文件树路径（添加前缀以防止多目录冲突）
   */
  const adjustTreePaths = (
    node: FileTreeNode,
    prefix: string
  ): FileTreeNode => {
    if (node.isFolder) {
      return {
        ...node,
        relativePath: prefix
          ? `${prefix}/${node.relativePath}`
          : node.relativePath,
        children: node.children?.map((child) => adjustTreePaths(child, prefix)),
      };
    } else {
      return {
        ...node,
        relativePath: prefix
          ? `${prefix}/${node.relativePath}`
          : node.relativePath,
      };
    }
  };

  /**
   * 扫描目录，构建文件树
   * @param files - FileList
   * @param mode - 导入模式：'content'=导入目录内容，'folder'=将目录作为子目录
   */
  const scanDirectory = useCallback(
    async (
      files: FileList,
      mode: ImportMode = 'content'
    ): Promise<FileTreeNode> => {
      setProgress({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: '',
        percentage: 0,
        status: 'scanning',
        message: '正在扫描目录...',
      });

      const root: FileTreeNode = {
        name: 'root',
        relativePath: '',
        isFolder: true,
        children: [],
      };

      const folderMap = new Map<string, FileTreeNode>();
      folderMap.set('', root);

      let fileCount = 0;
      let folderCount = 0;

      // 遍历所有文件
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        // @ts-ignore - webkitRelativePath 是标准属性
        const rawPath = (file as any).webkitRelativePath || file.name;

        // 'content' 模式：跳过第一层目录前缀，只导入内容
        // 'folder' 模式：保留整个目录结构作为子目录
        let pathParts: string[];
        const normalizedPath = rawPath.replace(/\\/g, '/');
        if (mode === 'content' && normalizedPath.includes('/')) {
          pathParts = normalizedPath.split('/').slice(1);
        } else {
          pathParts = normalizedPath.split('/');
        }

        // 跳过根目录文件（没有路径）
        if (pathParts.length === 0 || !pathParts[0]) {
          fileCount++;
          root.children!.push({
            name: file.name,
            relativePath: file.name,
            isFolder: false,
            file,
          });
          continue;
        }

        let currentPath = '';

        // 创建文件夹节点
        for (let j = 0; j < pathParts.length - 1; j++) {
          const partName = pathParts[j];
          if (!partName) continue;
          const parentPath = currentPath;
          currentPath = currentPath ? `${currentPath}/${partName}` : partName;

          if (!folderMap.has(currentPath)) {
            folderCount++;
            const folderNode: FileTreeNode = {
              name: partName,
              relativePath: currentPath,
              isFolder: true,
              children: [],
            };

            folderMap.set(currentPath, folderNode);

            // 添加到父节点
            const parentNode = folderMap.get(parentPath);
            if (parentNode && parentNode.children) {
              parentNode.children.push(folderNode);
            }
          }
        }

        // 添加文件节点
        fileCount++;
        const lastPart = pathParts[pathParts.length - 1];
        const parentPath = pathParts.slice(0, -1).join('/');
        const parentNode = folderMap.get(parentPath);

        if (parentNode && parentNode.children && file && lastPart) {
          parentNode.children.push({
            name: lastPart,
            relativePath: pathParts.join('/'),
            isFolder: false,
            file,
          });
        }
      }

      setFileTree(root);
      setProgress({
        currentFile: 0,
        totalFiles: fileCount,
        currentFileName: '',
        percentage: 0,
        status: 'preparing',
        message: `扫描完成：${fileCount} 个文件，${folderCount} 个文件夹`,
      });

      return root;
    },
    []
  );

  /**
   * 添加目录（支持多选）
   * @param files - FileList
   * @param mode - 'content' = 导入目录内容，'folder' = 将目录作为子目录
   */
  const addDirectory = useCallback(
    async (
      files: FileList,
      mode: 'content' | 'folder' = 'content'
    ): Promise<SelectedDirectory[]> => {
      setProgress({
        currentFile: 0,
        totalFiles: 0,
        currentFileName: '',
        percentage: 0,
        status: 'scanning',
        message: '正在扫描目录...',
      });

      // 获取根目录名称（从第一个文件的路径提取）
      const firstFile = files[0];
      // @ts-ignore - webkitRelativePath 是标准属性
      const firstPath = (firstFile as any).webkitRelativePath || firstFile.name;
      let rootName = 'root';

      if (firstPath && firstPath.includes('/')) {
        rootName = firstPath.split('/')[0];
      }

      currentRootNameRef.current = rootName;

      // 构建单个目录的文件树
      const buildTreeFromFiles = (
        fileList: FileList,
        importMode: 'content' | 'folder'
      ) => {
        const root: FileTreeNode = {
          name: rootName,
          relativePath: '',
          isFolder: true,
          children: [],
        };

        const folderMap = new Map<string, FileTreeNode>();
        folderMap.set('', root);

        let fileCount = 0;
        let folderCount = 0;

        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          if (!file) continue;

          // @ts-ignore - webkitRelativePath 是标准属性
          const rawPath = (file as any).webkitRelativePath || file.name;

          // 'content' 模式：跳过第一层目录前缀，只导入内容
          // 'folder' 模式：保留整个目录结构作为子目录
          let pathParts: string[];
          const normalizedPath = rawPath.replace(/\\/g, '/');
          if (importMode === 'content' && normalizedPath.includes('/')) {
            pathParts = normalizedPath.split('/').slice(1);
          } else {
            pathParts = normalizedPath.split('/');
          }

          // 跳过根目录文件（没有路径）
          if (pathParts.length === 0 || !pathParts[0]) {
            fileCount++;
            root.children!.push({
              name: file.name,
              relativePath: file.name,
              isFolder: false,
              file,
            });
            continue;
          }

          let currentPath = '';

          // 创建文件夹节点
          for (let j = 0; j < pathParts.length - 1; j++) {
            const partName = pathParts[j];
            if (!partName) continue;
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${partName}` : partName;

            if (!folderMap.has(currentPath)) {
              folderCount++;
              const folderNode: FileTreeNode = {
                name: partName,
                relativePath: currentPath,
                isFolder: true,
                children: [],
              };

              folderMap.set(currentPath, folderNode);

              // 添加到父节点
              const parentNode = folderMap.get(parentPath);
              if (parentNode && parentNode.children) {
                parentNode.children.push(folderNode);
              }
            }
          }

          // 添加文件节点
          fileCount++;
          const lastPart = pathParts[pathParts.length - 1];
          const parentPath = pathParts.slice(0, -1).join('/');
          const parentNode = folderMap.get(parentPath);

          if (parentNode && parentNode.children && file && lastPart) {
            parentNode.children.push({
              name: lastPart,
              relativePath: pathParts.join('/'),
              isFolder: false,
              file,
            });
          }
        }

        return { tree: root, fileCount, folderCount };
      };

      // 根据模式构建文件树
      const {
        tree: newTree,
        fileCount,
        folderCount,
      } = buildTreeFromFiles(files, mode);

      // 记录已选择的目录
      const newDir: SelectedDirectory = {
        name: rootName,
        rootPath: '',
        fileCount,
        folderCount,
        mode,
      };
      selectedDirsRef.current = [...selectedDirsRef.current, newDir];

      // 合并到现有文件树
      if (fileTree && fileTree.children && fileTree.children.length > 0) {
        // 将新目录的文件添加到现有根节点
        for (const child of newTree.children || []) {
          // 为防止冲突，为每个节点生成唯一的相对路径
          const adjustedChild = adjustTreePaths(child, rootName);
          fileTree.children.push(adjustedChild);
        }
        setFileTree({ ...fileTree });
      } else {
        // 首次添加
        setFileTree(newTree);
      }

      const totalFiles = selectedDirsRef.current.reduce(
        (sum, d) => sum + d.fileCount,
        0
      );
      const totalFolders = selectedDirsRef.current.reduce(
        (sum, d) => sum + d.folderCount,
        0
      );

      setProgress({
        currentFile: 0,
        totalFiles,
        currentFileName: '',
        percentage: 0,
        status: 'preparing',
        message: `已选择 ${selectedDirsRef.current.length} 个目录，共 ${totalFiles} 个文件，${totalFolders} 个文件夹`,
      });

      return selectedDirsRef.current;
    },
    [fileTree]
  );

  /**
   * 检测冲突
   */
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
              const response = await libraryApi.getChildren(
                libraryType,
                currentParentId
              );
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

  /**
   * 执行导入
   */
  const executeImport = useCallback(
    async (
      tree: FileTreeNode,
      targetParentId: string,
      libraryType: 'drawing' | 'block',
      strategy: ConflictStrategy
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

      // 统计文件数
      const countFiles = (node: FileTreeNode) => {
        if (!node.children) return;
        for (const child of node.children) {
          if (child.isFolder) {
            stats.totalFolders++;
            countFiles(child);
          } else {
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
        message: '开始导入...',
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
              const result = await libraryApi.createFolder(libraryType, {
                name: child.name,
                parentId: currentParentId,
                skipIfExists: true,
              });

              // result 已是解包后的数据
              const folderData = result as unknown as FileSystemNodeDto;
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
                const childrenResponse = await libraryApi.getChildren(
                  libraryType,
                  currentParentId
                );
                const nodeList =
                  (childrenResponse as any).data?.nodes ||
                  (childrenResponse as any).nodes ||
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
                  throw new Error('文件夹创建失败且未找到已存在的文件夹');
                }
              }
            } catch (error) {
              // 文件夹创建失败，尝试查找已存在的文件夹
              try {
                const childrenResponse = await libraryApi.getChildren(
                  libraryType,
                  currentParentId
                );
                const nodeList =
                  (childrenResponse as any).data?.nodes ||
                  (childrenResponse as any).nodes ||
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
                      error instanceof Error ? error.message : '创建文件夹失败',
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
                      : '创建文件夹失败',
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

          // 使用并发队列上传文件
          const uploadTask = uploadQueueRef.current!.enqueue(async () => {
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
              message: `正在上传: ${child.name}`,
            });

            try {
              // 上传文件（后端根据 conflictStrategy 处理同名）
              const hash = await computeFileHash(child.file!);
              const uploadResult = await uploadFileWithRetry(
                child.file!,
                hash,
                currentParentId,
                strategy
              );

              if (uploadResult) {
                // 检查是否是秒传（文件已存在）
                if (uploadResult.isUseServerExistingFile && strategy === 'skip') {
                  stats.skippedFiles++;
                } else {
                  stats.successFiles++;
                }
              } else {
                stats.failedFiles++;
                errors.push({
                  fileName: child.name,
                  error: '上传失败',
                });
              }
            } catch (error) {
              stats.failedFiles++;
              errors.push({
                fileName: child.name,
                error: error instanceof Error ? error.message : '上传失败',
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

      const finalProgress: ImportProgress = {
        currentFile: stats.totalFiles,
        totalFiles: stats.totalFiles,
        currentFileName: '',
        percentage: 100,
        status: abortRef.current ? 'failed' : 'completed',
        message: abortRef.current
          ? '导入已取消'
          : `导入完成：成功 ${stats.successFiles}，跳过 ${stats.skippedFiles}，失败 ${stats.failedFiles}`,
      };

      setProgress(finalProgress);

      return {
        success: !abortRef.current && stats.failedFiles === 0,
        stats,
        errors,
      };
    },
    []
  );

  /**
   * 取消导入
   */
  const cancelImport = useCallback(() => {
    abortRef.current = true;
    setProgress((prev) => ({
      ...prev,
      status: 'failed',
      message: '导入已取消',
    }));
  }, []);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setFileTree(null);
    setConflicts([]);
    selectedDirsRef.current = [];
    currentRootNameRef.current = '';
    setProgress({
      currentFile: 0,
      totalFiles: 0,
      currentFileName: '',
      percentage: 0,
      status: 'idle',
      message: '',
    });
    abortRef.current = false;
  }, []);

  return {
    fileTree,
    conflicts,
    progress,
    scanDirectory,
    addDirectory,
    detectConflicts,
    executeImport,
    cancelImport,
    reset,
  };
}

/**
 * 计算文件 Hash（简化版，使用文件名+大小作为标识）
 * 实际项目中应使用 SparkMD5 等库计算真实 Hash
 */
async function computeFileHash(file: File): Promise<string> {
  // 简化实现：使用文件名+大小生成哈希
  // 生产环境应使用 SparkMD5 计算真实文件内容哈希
  const data = `${file.name}-${file.size}-${file.lastModified}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 带重试的文件上传
 */
async function uploadFileWithRetry(
  file: File,
  hash: string,
  nodeId: string,
  conflictStrategy?: 'skip' | 'overwrite' | 'rename',
  maxRetries: number = 3
): Promise<MxCadUploadResult | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const options: MxCadUploadOptions = {
        file,
        hash,
        nodeId,
        conflictStrategy,
      };

      return await uploadMxCadFile(options);
    } catch (error) {
      console.error(`上传失败 (尝试 ${i + 1}/${maxRetries}):`, error);
      if (i === maxRetries - 1) {
        throw error;
      }
      // 等待一段时间后重试
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return null;
}
