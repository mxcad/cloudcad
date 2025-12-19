/**
 * 前端类型定义
 * 导入 API 类型并定义前端特定类型
 */

// 导入从后端生成的 API 类型
export * from './types/api';

// 导入组件类型
import { components } from './types/api';

// 为了向后兼容，重新导出 User 类型
export type User = components['schemas']['UserDto'];

// ==================== 前端特定类型 ====================

/** 权限枚举 */
export enum Permission {
  // System
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_ROLES = 'MANAGE_ROLES',

  // Projects
  PROJECT_CREATE = 'PROJECT_CREATE',
  PROJECT_DELETE = 'PROJECT_DELETE',
  PROJECT_VIEW_ALL = 'PROJECT_VIEW_ALL', // Admin can view all projects regardless of membership

  // Assets
  LIBRARY_MANAGE = 'LIBRARY_MANAGE', // Create/Delete libraries
  ASSET_UPLOAD = 'ASSET_UPLOAD',
}

/** 角色接口 */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem?: boolean; // Cannot be deleted if true
}

/** 文件节点类型（前端文件系统使用） */
export type FileType = 'folder' | 'image' | 'cad' | 'font' | 'block' | 'pdf';

/** 文件节点接口（前端文件管理） */
export interface FileNode {
  /** 文件节点ID */
  id: string;
  /** 父节点ID */
  parentId: string | null;
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: FileType;
  /** 文件大小（字节） */
  size: number;
  /** 更新时间 */
  updatedAt: string;
  /** 所有者ID */
  ownerId: string;
  /** 是否共享 */
  shared: boolean;
  /** 分享链接 */
  shareLink?: string;
  /** 缩略图 */
  thumbnail?: string;
  /** 删除时间（在回收站中） */
  deletedAt?: string;
  /** 允许访问的用户ID（根文件夹访问控制） */
  allowedUserIds?: string[];
}

/** 资源库接口（前端资源管理） */
export interface Library {
  /** 资源库ID */
  id: string;
  /** 资源库名称 */
  name: string;
  /** 资源库类型 */
  type: 'block' | 'font';
  /** 资源库描述 */
  description: string;
  /** 封面图URL */
  coverUrl?: string;
  /** 资源数量 */
  itemCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 允许访问的用户ID */
  allowedUserIds?: string[];
}

/** 资源项接口（前端资源展示） */
export interface Asset {
  /** 资源ID */
  id: string;
  /** 所属资源库ID */
  libraryId: string;
  /** 资源名称 */
  name: string;
  /** 资源分类 */
  category: 'block' | 'font';
  /** 资源URL */
  url: string;
  /** 资源标签 */
  tags: string[];
  /** 资源大小 */
  size: number;
}

// ==================== 前端常量 ====================

/** 最大上传文件大小（50MB） */
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
