/**
 * 文件系统相关类型定义
 * 
 * 原则：优先使用 Swagger 自动生成的 DTO 类型（从 ./api-client 导入）
 * 本文件仅保留：
 * 1. 前端扩展类型（在 DTO 基础上添加前端专用属性）
 * 2. 前端专用的 UI 状态类型
 * 3. 类型别名（向后兼容）
 */

// ============================================
// 从 API DTO 导入基础类型
// ============================================

import type {
  FileSystemNodeDto,
  NodeTreeResponseDto,
  ProjectDto,
  ProjectListResponseDto,
  NodeListResponseDto,
  TrashListResponseDto,
  TrashItemDto,
  PreloadingDataDto,
  CheckReferenceResponseDto,
  StorageInfoDto,
  UserDto,
  ProjectMemberDto,
} from './api-client';

// ============================================
// 前端扩展类型（在 DTO 基础上添加前端专用属性）
// ============================================

/**
 * 文件系统节点（前端扩展）
 * 
 * 扩展属性说明：
 * - extension: 文件扩展名（前端从 mimeType 或 name 解析）
 * - _count: 子节点统计（前端计算用）
 * - hasMissingExternalReferences: 是否有缺失的外部参照
 * - missingExternalReferencesCount: 缺失的外部参照数量
 * - children: 子节点列表（树形结构）
 * - originalName: 原始文件名
 */
export interface FileSystemNode extends FileSystemNodeDto {
  /** 文件扩展名（前端解析） */
  extension?: string;
  /** 原始文件名 */
  originalName?: string;
  /** 子节点统计 */
  _count?: {
    children: number;
    files: number;
    folders: number;
  };
  /** 是否有缺失的外部参照 */
  hasMissingExternalReferences?: boolean;
  /** 缺失的外部参照数量 */
  missingExternalReferencesCount?: number;

  /** 子节点列表（树形结构） */
  children?: FileSystemNode[];
}

/**
 * 文件夹节点（用于选择器等场景）
 */
export interface FolderNode extends FileSystemNode {
  /** 是否展开（前端 UI 状态） */
  expanded: boolean;
  /** 子文件夹 */
  children?: FolderNode[];
  /** 是否正在加载 */
  loading?: boolean;
}

/**
 * 项目节点（前端扩展）
 */
export interface ProjectNode extends ProjectDto {
  /** 是否为文件夹（项目根节点始终是文件夹） */
  isFolder: true;
  /** 子节点统计 */
  childrenCount?: number;
}

// ============================================
// 类型别名（向后兼容）
// ============================================

export type NodeTree = NodeTreeResponseDto;
export type Project = ProjectDto;
export type ProjectListResponse = ProjectListResponseDto;
export type NodeListResponse = NodeListResponseDto;
export type TrashListResponse = TrashListResponseDto;
export type TrashItem = TrashItemDto;
export type PreloadingData = PreloadingDataDto;
export type CheckReferenceExistsResult = CheckReferenceResponseDto;
export type StorageInfo = StorageInfoDto;
export type User = UserDto;
export type Member = ProjectMemberDto;

// ============================================
// 前端专用类型（API 无对应）
// ============================================

/**
 * 面包屑导航项
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot: boolean;
  isFolder?: boolean;
}

/**
 * 确认对话框状态
 */
export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'info';
}

/**
 * 外部参照文件上传状态
 */
export type UploadState = 'notSelected' | 'uploading' | 'success' | 'fail';

/**
 * 外部参照文件信息（前端 UI 状态）
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
  /** 节点 ID（用于权限验证和API调用） */
  nodeId: string;
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
  checkMissingReferences: (nodeId?: string) => Promise<boolean>;
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
  /** 选择文件并自动上传 */
  selectAndUploadFiles: () => void;
}

/**
 * 字体信息（匹配后端 FontInfoDto）
 */
export interface FontInfo {
  name: string;
  size: number;
  extension: string;
  existsInBackend: boolean;
  existsInFrontend: boolean;
  createdAt: string;
  updatedAt: string;
  creator?: string;
}

// ============================================
// 类型转换工具函数
// ============================================

/**
 * 从文件名提取扩展名
 */
export function getFileExtension(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return undefined;
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * 将 FileSystemNodeDto 转换为 FileSystemNode（添加前端扩展属性）
 */
export function toFileSystemNode(dto: FileSystemNodeDto): FileSystemNode {
  return {
    ...dto,
    extension: getFileExtension(dto.name),
    originalName: dto.name,
  };
}

/**
 * 将 ProjectDto 转换为 FileSystemNode（用于统一显示）
 */
export function projectToNode(project: ProjectDto): FileSystemNode {
  return {
    ...project,
    isFolder: true,
    extension: undefined,
    originalName: project.name,
    childrenCount: project.memberCount,
  };
}

/**
 * 将 TrashItemDto 转换为 FileSystemNode
 */
export function trashItemToNode(item: TrashItemDto): FileSystemNode {
  return {
    ...item,
    extension: getFileExtension(item.name),
    originalName: item.name,
  };
}
