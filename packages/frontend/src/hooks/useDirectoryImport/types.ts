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

/**
 * 外部参照自动发现处理汇总（异步上报，供导入结果页展示）
 */
export interface ExtRefSummary {
  /** processing=处理中；done=处理结束；error=整体异常 */
  status: 'processing' | 'done' | 'error';
  /** 目录中找到并尝试上传的参照数 */
  matched: number;
  /** 上传成功数 */
  uploaded: number;
  /** 上传失败数（接口返回非 0 或请求异常） */
  failed: number;
  /** preloading 中声明但目录里找不到的参照数 */
  missing: number;
}
