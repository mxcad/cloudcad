/**
 * 图纸会话（Drawing Session）— 会话实现
 *
 * 「编辑器里正开着一张图纸」状态的唯一 writer（ADR-0039）：openSession/closeSession
 * 编排 store 相关字段、切换文件时清 back-info；脏标记（isModified）单一写点为
 * setModified，由 database-modified 信号置脏、save/close 复位。
 * useCADEditorStore 仍是状态家（ADR-0030），本模块是 writer 权威，不是新的状态容器。
 */
import { CAD_EVENTS } from '@/constants/events';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { emit, subscribePermanent } from './sessionBus';
import type { FileOpenedDetail, OpenCompleteDetail } from './sessionEvents';

/** 打开图纸所需的最小信息 */
export interface OpenFileInfo {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block';
  path?: string;
  fromPlatform?: boolean;
  fromShare?: boolean;
  updatedAt?: string;
  fileHash?: string;
}

/** 会话补丁（含 expectedTimestamp，保存后同步 updatedAt 用） */
export type OpenFileInfoPatch = Partial<OpenFileInfo> & {
  expectedTimestamp?: string;
};

/** 会话顶层字段补丁：协同加入、分享打开、打开完成后单字段同步 */
export interface SessionFlagsPatch {
  fileId?: string | null;
  fileName?: string | null;
  projectId?: string | null;
  fromShare?: boolean;
}

/** 引擎侧当前打开文件 URL（原 mxcadManagerCore 模块级变量收编于此） */
let currentFileUrl: string | null = null;

/** 引擎侧缓存时间戳（原 mxcadManagerCore 模块级变量收编于此） */
let cacheTimestamp: number | undefined = undefined;

/** 唯一 writer：打开图纸。切换文件时清 back-info */
export function openSession(info: OpenFileInfo): void {
  const store = useCADEditorStore.getState();
  if (store.currentFileId && store.currentFileId !== info.fileId) {
    store.clearOpenedBackInfo();
  }
  store.setCurrentFileInfo({ ...info, expectedTimestamp: info.updatedAt });
  store.setCurrentFileId(info.fileId);
  store.setCurrentFileName(info.name || null);
  store.setIsCurrentFileDeleted(false);
}

/** 唯一 writer：关闭图纸（退出登录等场景），脏标记一并复位，引擎侧运行态一并重置 */
export function closeSession(): void {
  const store = useCADEditorStore.getState();
  store.setNavigateFunction(null);
  store.setCurrentFileInfo(null);
  store.setCurrentFileId(null);
  store.setCurrentFileName(null);
  store.setCurrentProjectId(null);
  store.setIsCurrentFileDeleted(false);
  store.setIsDirty(false);
  resetSessionRuntime();
}

/**
 * 会话补丁：合并更新当前文件信息（改名、保存后时间戳同步等）。
 * fromShare 是会话顶层字段（store.fromShare），显式 DTO 映射避免类型断言。
 */
export function patchSession(partial: OpenFileInfoPatch): void {
  const store = useCADEditorStore.getState();
  const { fromShare, ...infoPatch } = partial;
  if (fromShare !== undefined) store.setFromShare(fromShare);
  store.patchCurrentFileInfo(infoPatch);
}

/**
 * 唯一 writer：会话顶层字段补丁（currentFileId / currentProjectId /
 * currentFileName / fromShare）。协同加入、分享链接打开、打开完成回调等
 * 单字段同步场景走此命令，禁止组件直写 store 裸 setter（ADR-0039）。
 */
export function patchSessionFlags(patch: SessionFlagsPatch): void {
  const store = useCADEditorStore.getState();
  if (patch.fileId !== undefined) store.setCurrentFileId(patch.fileId);
  if (patch.fileName !== undefined) store.setCurrentFileName(patch.fileName);
  if (patch.projectId !== undefined) store.setCurrentProjectId(patch.projectId);
  if (patch.fromShare !== undefined) store.setFromShare(patch.fromShare);
}

/** 脏标记单一写点（database-modified 置脏；save / close 复位） */
export function setModified(modified: boolean): void {
  useCADEditorStore.getState().setIsDirty(modified);
}

/** 唯一 writer：清除「当前文件已被删除」标记（另存为成功、新建文件后调用） */
export function clearCurrentFileDeleted(): void {
  useCADEditorStore.getState().setIsCurrentFileDeleted(false);
}

/** 脏标记非 React 读取（协同检查、beforeunload 等） */
export function getModified(): boolean {
  return useCADEditorStore.getState().isDirty;
}

/** 设置引擎侧当前打开文件 URL（mxcadManagerCore 调用） */
export function setCurrentFileUrl(url: string | null): void {
  currentFileUrl = url;
}

/** 读取引擎侧当前打开文件 URL */
export function getCurrentFileUrl(): string | null {
  return currentFileUrl;
}

/** 设置引擎侧缓存时间戳（打开流程调用） */
export function setCacheTimestamp(timestamp: number | undefined): void {
  cacheTimestamp = timestamp;
}

/** 读取引擎侧缓存时间戳 */
export function getCacheTimestamp(): number | undefined {
  return cacheTimestamp;
}

/** 重置引擎侧运行态（新建文件时清 URL 与缓存时间戳） */
export function resetSessionRuntime(): void {
  currentFileUrl = null;
  cacheTimestamp = undefined;
}

/** 发布文件打开信号（原 mxcadOpenFile 3 处 dispatchEvent） */
export function emitFileOpened(detail: FileOpenedDetail): void {
  emit(CAD_EVENTS.FILE_OPENED, detail);
}

/** 发布引擎打开完成信号（原 mxcadManagerCore dispatchEvent） */
export function emitOpenComplete(detail: OpenCompleteDetail): void {
  emit(CAD_EVENTS.OPEN_COMPLETE, detail);
}

/** database-modified 信号 → 置脏（引擎监听方只负责 emit）；常驻订阅，clear 不清除 */
subscribePermanent(CAD_EVENTS.DATABASE_MODIFIED, () => setModified(true));

export { emit, subscribe } from './sessionBus';
