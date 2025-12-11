/**
 * 文件相关类型定义
 */

import { FileStatus, FileAccessRole, FileType } from './enums';

export interface FileNode {
  /** 文件ID */
  id: string;
  /** 父级文件夹ID */
  parentId: string | null;
  /** 文件名 */
  name: string;
  /** 原始文件名 */
  originalName?: string;
  /** 文件路径 */
  path: string;
  /** 文件类型 */
  type: FileType;
  /** 文件大小（字节） */
  size: number;
  /** MIME类型 */
  mimeType: string;
  /** 文件状态 */
  status: FileStatus;
  /** 文件所有者ID */
  ownerId: string;
  /** 所属项目ID */
  projectId?: string;
  /** 缩略图URL */
  thumbnail?: string;
  /** 是否共享 */
  shared?: boolean;
  /** 分享链接 */
  shareLink?: string;
  /** 允许访问的用户ID列表 */
  allowedUserIds?: string[];
  /** 软删除时间戳 */
  deletedAt?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

export interface UploadFileDto {
  /** 父级文件夹ID */
  parentId: string | null;
  /** 文件 */
  file: Blob;
  /** 所属项目ID */
  projectId?: string;
}

export interface CreateFolderDto {
  /** 父级文件夹ID */
  parentId: string | null;
  /** 文件夹名称 */
  name: string;
  /** 所属项目ID */
  projectId?: string;
}

export interface UpdateFileDto {
  /** 文件名 */
  name?: string;
  /** 文件状态 */
  status?: FileStatus;
}

export interface FileAccess {
  /** 访问权限ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 文件ID */
  fileId: string;
  /** 访问角色 */
  role: FileAccessRole;
  /** 创建时间 */
  createdAt: string;
}

export interface GrantFileAccessDto {
  /** 用户ID */
  userId: string;
  /** 访问角色 */
  role: FileAccessRole;
}

export interface UpdateFileAccessDto {
  /** 访问角色 */
  role: FileAccessRole;
}

export interface FileListResponse {
  /** 文件列表 */
  data: FileNode[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页数量 */
    limit: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
  };
}

export interface FileStats {
  /** 总文件数 */
  totalFiles: number;
  /** 总项目数 */
  totalProjects: number;
  /** 最近文件 */
  recentFiles: FileNode[];
  /** 存储使用量（字节） */
  storageUsed: number;
  /** 存储总量（字节） */
  storageTotal: number;
}