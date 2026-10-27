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
import { t } from '@/languages';
import type { McDbRasterImage } from 'mxcad';
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
  expectedTimestamp?: string;
  /**
   * 文件内容唯一标识（本地文件 = 原始文件 MD5）。
   * 本地 mxweb / dwg / dxf 打开时计算并记录，作为本地图纸协同识别依据；
   * 云图（nodeId）场景不使用该字段（以 fileId 为准）。
   */
  fileHash?: string;
}

/**
 * 当前文件上下文（「编辑器里正开着一张什么图纸」的单一事实源）
 *
 * kind 显式区分四态，消除历史 null/''/真实id 三态混用（三个写入者各写各的
 * 派生字段，消费方无法判断「没开文件 / 新建空白图 / 本地图 / 云图」）：
 * - none：未打开文件（初始态 / 关闭会话）
 * - new：新建空白图纸（Mx_NewFile，无云端身份，fileId 恒 null）
 * - local：本地文件（fileId 恒 ''，以 fileHash 或名称识别）
 * - cloud：云端文件（fileId = 节点 ID）
 *
 * 唯一写入者是 drawingSession 的 setFileContext（ADR-0039 延伸），它同步派生
 * currentFileInfo/currentFileId/currentFileName/currentProjectId 兼容字段并
 * 发布 FILE_CONTEXT_CHANGED 事件；消费方（协同面板/标题/URL/保存门控）一律
 * 订阅该事件，禁止各自监听零散 CAD 事件手拼状态。
 */
export interface FileContext {
  kind: 'none' | 'new' | 'local' | 'cloud';
  /** cloud：节点 ID；local：''；new/none：null */
  fileId: string | null;
  name: string | null;
  /** local：原始文件内容 MD5（本地图纸协同识别的唯一标识）；cloud 不使用 */
  fileHash?: string;
  projectId?: string | null;
  parentId?: string | null;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block' | null;
  fromPlatform?: boolean;
  path?: string;
  updatedAt?: string;
  expectedTimestamp?: string;
}

/** 未打开文件时的空上下文（store 初始值 / closeSession 目标态） */
export const FILE_CONTEXT_NONE: FileContext = {
  kind: 'none',
  fileId: null,
  name: null,
};

/**
 * 待上传的图片
 */
export interface PendingImage {
  url: string;
  fileName: string;
  entity: McDbRasterImage;
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
 * 等待文件就绪的返回类型
 */
export interface FileReadyInfo {
  fileHash: string;
  path: string;
  name: string;
  parentId: string;
}

/**
 * 文件打开请求载荷
 * 统一由 MxCADInstanceManager.openFile() 消费，状态仅在成功后设置
 */
export interface OpenFilePayload {
  url: string;
  fileInfo?: CurrentFileInfo;
  noCache?: boolean;
  /** 引擎 fetchAttributes 覆盖（缺省按 noCache 推导）：新建空模板传 1（仅载入内存） */
  fetchAttributes?: number;
  onSuccess?: () => void;
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
  LOADING: t('正在加载...'),
  CALCULATING_HASH: t('正在计算文件哈希...'),
  UPLOADING: t('正在上传'),
  OPENING_FILE: t('正在打开文件...'),
} as const;

/** 文件上传配置 */
export const FILE_UPLOAD_CONFIG = {
  FILE_PICKER_ID: 'mxcad-file-picker',
  ALLOWED_EXTENSIONS: '.dwg,.dxf,.dwt,.mxweb',
} as const;

/** 文件重试配置 */
export const FILE_OPEN_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

/** MxCADView 初始化等待超时（ms）：openFile 在视图未就绪时等待初始化完成 */
export const VIEW_INIT_TIMEOUT_MS = 60000;

/** 外部参照打开前的引擎就绪等待超时（ms）：超时按失败处理（区别于首开的超时兜底继续） */
export const EXTERNAL_REF_READY_TIMEOUT_MS = 20_000;

/** 引擎就绪等待轮询间隔（ms）：ensureEngineReady 唯一轮询实现使用 */
export const ENGINE_READY_POLL_INTERVAL_MS = 200;
