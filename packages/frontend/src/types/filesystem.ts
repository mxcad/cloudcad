///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 文件系统相关类型定义
 * 
 * 原则：优先使用 Swagger 自动生成的 DTO 类型（从 @/api-sdk 导入）
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
  PreloadingDataDto,
  CheckReferenceResponseDto,
  StorageInfoDto,
  ProjectMemberDto,
} from '@/api-sdk';

// ============================================
// 前端扩展类型（在 DTO 基础上添加前端专用属性）
// ============================================

/**
 * 文件系统节点（前端扩展）
 * 
 * 扩展属性说明：
 * - extension: 文件扩展名（前端从 mimeType 或 name 解析）
 * - _count: 子节点统计（前端计算用）
 * - children: 子节点列表（树形结构）
 * - originalName: 原始文件名
 */
export interface AncestorItem {
  id: string;
  name: string;
  isRoot: boolean;
}

/** 跨项目转移模式（与后端 CrossProjectTransferMode 枚举对齐） */
export type TransferMode = 'NONE' | 'COPY_ONLY' | 'MOVE_ONLY' | 'ALL';

/** 跨项目转移 6 域设置（项目根节点，PROJECT_TRANSFER_MANAGE 管理） */
export interface TransferSettings {
  transferOutToProject?: TransferMode;
  transferOutToPersonalSpace?: TransferMode;
  transferOutToLibrary?: TransferMode;
  transferInFromProject?: TransferMode;
  transferInFromPersonalSpace?: TransferMode;
  transferInFromLibrary?: TransferMode;
}

export interface FileSystemNode extends FileSystemNodeDto, TransferSettings {
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
  /** 回收站中被级联删除的子节点数量 */
  childrenCountTrash?: number;

  /** 子节点列表（树形结构） */
  children?: FileSystemNode[];
  /** 祖先链（从根到当前节点，由后端一次递归查询返回） */
  ancestors?: AncestorItem[];
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
export type TrashItem = FileSystemNodeDto;
export type PreloadingData = PreloadingDataDto;
export type CheckReferenceExistsResult = CheckReferenceResponseDto;
export type StorageInfo = StorageInfoDto;

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
  /** 编辑时显示的名称（标识符），如 'drawing'/'block'，用于路由匹配 */
  editName?: string;
  isRoot: boolean;
  isFolder?: boolean;
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
  /** 文件大小（字节） */
  size?: number;
  /** 上传状态 */
  uploadState: UploadState;
  /** 上传进度（0-100） */
  progress: number;
  /** 选中的文件对象 */
  source?: File;
  /** 文件是否已存在 */
  exists?: boolean;
  /** 替换模式时的原始外部参照文件名（为 undefined 时表示追加模式） */
  originalXrefName?: string;
}

/**
 * useExternalReferenceUpload 配置
 */
export interface UseExternalReferenceUploadConfig {
  /** 节点 ID（用于已登录用户） */
  nodeId?: string;
  /** 文件 hash（用于未登录用户） */
  fileHash?: string;
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
  /**
   * 检查缺失的外部参照
   * @param identifier 可选的节点ID或文件hash
   * @param shouldRetry 是否启用重试逻辑（上传后为 true，手动点击为 false）
   * @param forceOpen 是否强制打开弹框（手动点击为 true，上传后为 false）
   */
  checkMissingReferences: (identifier?: string, shouldRetry?: boolean, forceOpen?: boolean) => Promise<boolean>;
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
  /** 选择文件并自动上传（替换模式时传入目标文件） */
  selectAndUploadFiles: (targetFile?: ExternalReferenceFile) => void;
  /** 替换单个外部参照文件 */
  replaceFile: (file: ExternalReferenceFile) => void;
  /** 下载外部参照文件 */
  downloadFile: (file: ExternalReferenceFile) => Promise<void>;
  /** 刷新外部参照列表 */
  refresh: () => Promise<void>;
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
 * 从文件名提取扩展名（带点）
 * @returns 返回带点的扩展名（如 ".dwg"），无扩展名时返回 undefined
 */
export function getFileExtension(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return undefined;
  return filename.slice(lastDot).toLowerCase();
}

/**
 * 从 PreloadingFileInfoDto 或 string 中提取文件名
 * 兼容后端 on-disk 格式（string[]）和 API 响应格式（PreloadingFileInfoDto[]）
 */
export function getXrefName(
  item: string | { name?: string } | null | undefined
): string {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item?.name || '';
}

/**
 * 从 PreloadingFileInfoDto 或 string 中提取文件大小
 * 仅对象格式有 size，字符串格式返回 undefined
 */
export function getXrefSize(
  item: string | { size?: number } | null | undefined
): number | undefined {
  if (!item || typeof item === 'string') return undefined;
  return item.size;
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
 * 将 ProjectDto 或 FileSystemNodeDto 转换为 FileSystemNode（用于统一显示）
 */
export function projectToNode(project: FileSystemNodeDto): FileSystemNode {
  return {
    ...project,
    isFolder: true,
    isRoot: true,
    extension: undefined,
    originalName: project.name,
  };
}

