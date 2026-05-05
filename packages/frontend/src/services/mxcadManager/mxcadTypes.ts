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

/**
 * MxCAD Manager — 类型定义
 * 集中的类型定义，供所有子模块使用
 */

/**
 * 当前文件信息
 */
export interface CurrentFileInfo {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  path?: string;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block';
  fromPlatform?: boolean;
  updatedAt?: string;
}

/**
 * 待上传的图片
 */
export interface PendingImage {
  url: string;
  fileName: string;
  entity: unknown;
  file?: File;
}

/**
 * 上传目标节点信息
 */
export interface UploadTargetInfo {
  nodeId: string;
  personalSpaceId: string | null;
}

/**
 * 保存参数
 */
export interface SaveMxwebParams {
  nodeId: string;
  blob: Blob;
  filename: string;
  commitMessage?: string;
  expectedTimestamp?: string;
}

/**
 * 外部参照上传参数
 */
export interface ExtRefUploadParams {
  file: File;
  nodeId: string;
  fileName: string;
}

/**
 * 外部参照上传结果
 */
export interface ExtRefUploadResult {
  success: boolean;
  nodeId?: string;
  error?: string;
}

/**
 * 文件去重检查结果
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingNodeId: string | null;
}

/**
 * 等待文件就绪的返回类型
 */
export interface FileReadyInfo {
  fileHash: string;
  path: string;
  name: string;
  parentId: string;
}

/** CSS 类名配置 */
export const CSS_CLASSES = {
  GLOBAL_CONTAINER: 'mxcad-global-container',
  LOADING_OVERLAY: 'mxcad-loading-overlay',
  LOADING_SPINNER: 'mxcad-loading-spinner',
  LOADING_MESSAGE: 'mxcad-loading-message',
} as const;

/** 默认消息文本 */
export const DEFAULT_MESSAGES = {
  LOADING: '正在加载...',
  CALCULATING_HASH: '正在计算文件哈希...',
  UPLOADING: '正在上传',
  OPENING_FILE: '正在打开文件...',
} as const;

/** 文件上传配置 */
export const FILE_UPLOAD_CONFIG = {
  FILE_PICKER_ID: 'mxcad-file-picker',
  ALLOWED_EXTENSIONS: '.dwg,.dxf,.dwt,.mxweb,.mxwbe',
} as const;

/** 文件重试配置 */
export const FILE_OPEN_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

/** 缩略图配置 */
export const THUMBNAIL_CONFIG = {
  MIN_DRAWING_SIZE: 100,
  TARGET_SIZE: 200,
} as const;
