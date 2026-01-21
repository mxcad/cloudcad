export interface FileSystemNode {
  id: string;
  name: string;
  isFolder: boolean;
  isRoot: boolean;
  parentId: string | null;
  originalName?: string;
  path?: string; // 改为存储访问路径：/mxcad/file/xxx.dwg.mxweb
  size?: number | null;
  mimeType?: string | null;
  extension?: string | null;
  fileStatus?: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DELETED';
  fileHash?: string | null;
  description?: string | null;
  projectStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  children?: FileSystemNode[];
  _count?: {
    children: number;
    files: number;
    folders: number;
  };

  // 缺失外部参照标识（任务008）
  hasMissingExternalReferences?: boolean;
  missingExternalReferencesCount?: number;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot: boolean;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'info';
}

/**
 * 外部参照预加载数据
 */
export interface PreloadingData {
  /** 是否为图纸 */
  tz: boolean;
  /** 源文件哈希值 */
  src_file_md5: string;
  /** 图片列表 */
  images: string[];
  /** 外部参照列表 */
  externalReference: string[];
}

/**
 * 外部参照文件存在性检查结果
 */
export interface CheckReferenceExistsResult {
  /** 文件是否存在 */
  exists: boolean;
}

/**
 * 外部参照文件上传状态
 */
export type UploadState = 'notSelected' | 'uploading' | 'success' | 'fail';

/**
 * 外部参照文件信息
 */
export interface ExternalReferenceFile {
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: 'img' | 'ref';
  /** 上传状态 */
  uploadState: UploadState;
  /** 上传进度（0-100） */
  progress: number;
  /** 选中的文件对象 */
  source?: File;
  /** 文件是否已存在 */
  exists?: boolean;
}

/**
 * useExternalReferenceUpload 配置
 */
export interface UseExternalReferenceUploadConfig {
  /** 节点 ID（用于权限验证） */
  nodeId: string;
  /** 文件哈希值 */
  fileHash: string;
  /** 上传成功回调 */
  onSuccess?: () => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 跳过上传回调 */
  onSkip?: () => void;
}

/**
 * useExternalReferenceUpload 返回值
 */
export interface UseExternalReferenceUploadReturn {
  /** 模态框是否打开 */
  isOpen: boolean;
  /** 外部参照文件列表 */
  files: ExternalReferenceFile[];
  /** 是否正在上传 */
  loading: boolean;
  /** 检查缺失的外部参照 */
  checkMissingReferences: (fileHash?: string) => Promise<boolean>;
  /** 选择文件 */
  selectFiles: () => void;
  /** 上传文件 */
  uploadFiles: () => Promise<void>;
  /** 关闭模态框 */
  close: () => void;
  /** 完成上传 */
  complete: () => void;
  /** 跳过上传 */
  skip: () => void;
  /** 打开模态框准备上传（任务009 - 随时上传） */
  openModalForUpload: () => void;
}

/**
 * 项目查询参数
 */
export interface QueryProjectsParams {
  /** 搜索关键词（匹配名称或描述） */
  search?: string;
  /** 项目状态 */
  projectStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 子节点查询参数
 */
export interface QueryChildrenParams {
  /** 搜索关键词（匹配名称或描述） */
  search?: string;
  /** 节点类型 */
  nodeType?: 'folder' | 'file';
  /** 文件扩展名 */
  extension?: string;
  /** 文件状态 */
  fileStatus?: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DELETED';
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
