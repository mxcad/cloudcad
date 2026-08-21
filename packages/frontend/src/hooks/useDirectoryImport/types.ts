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
export interface FileTreeNode {
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
export interface ImportStats {
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
export interface ImportProgress {
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
export interface ImportResult {
  success: boolean;
  stats: ImportStats;
  errors: Array<{ fileName: string; error: string }>;
}
