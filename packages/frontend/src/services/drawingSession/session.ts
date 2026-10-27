/**
 * 图纸会话（Drawing Session）— 会话实现
 *
 * 「编辑器里正开着一张图纸」状态的唯一 writer（ADR-0039）：setFileContext 是
 * FileContext（单一事实源）的唯一写入者，同步派生 currentFileInfo/currentFileId/
 * currentFileName/currentProjectId 兼容字段并发布 FILE_CONTEXT_CHANGED——所有
 * 消费方（协同面板/标题/URL/保存门控）订阅这一个事件，不再各自监听零散
 * CAD 事件手拼状态。openSession/newSession/closeSession/patchSession/
 * patchSessionFlags 全部收敛为 setFileContext 的语义包装。
 * 脏标记（isModified）单一写点为 setModified，由 database-modified 信号置脏、
 * save/close 复位。useCADEditorStore 仍是状态家（ADR-0030），本模块是 writer
 * 权威，不是新的状态容器。
 */
import { CAD_EVENTS } from '@/constants/events';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import {
  FILE_CONTEXT_NONE,
  type CurrentFileInfo,
  type FileContext,
} from '../mxcadManager/mxcadTypes';
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

/**
 * FileContext 身份键：kind + fileId + fileHash。消费方据此去重——
 * 仅名称变化（协同名称同步）不触发列表重拉，身份变化才触发。
 */
export function contextIdentity(ctx: FileContext): string {
  return `${ctx.kind}:${ctx.fileId ?? ''}:${ctx.fileHash ?? ''}`;
}

/** 上下文是否实质变化（引用可能不同但内容相同的不算，避免重复事件与重渲染） */
function contextChanged(a: FileContext, b: FileContext): boolean {
  return (
    a.kind !== b.kind ||
    a.fileId !== b.fileId ||
    a.name !== b.name ||
    a.fileHash !== b.fileHash ||
    a.projectId !== b.projectId ||
    a.parentId !== b.parentId ||
    a.personalSpaceId !== b.personalSpaceId ||
    a.libraryKey !== b.libraryKey ||
    a.path !== b.path ||
    a.updatedAt !== b.updatedAt ||
    a.expectedTimestamp !== b.expectedTimestamp
  );
}

/**
 * FileContext → 兼容字段 currentFileInfo 的派生映射：
 * none/new 无云端身份 → null（保存/分享命令走「无文件」分支进另存为）；
 * local → fileId 恒 '' 的 CurrentFileInfo（fileHash 为协同识别依据）；
 * cloud → 完整 CurrentFileInfo。
 */
function deriveCurrentFileInfo(ctx: FileContext): CurrentFileInfo | null {
  if (ctx.kind === 'none' || ctx.kind === 'new') return null;
  const info: CurrentFileInfo = {
    fileId: ctx.fileId ?? '',
    parentId: ctx.parentId ?? null,
    projectId: ctx.projectId ?? null,
    name: ctx.name ?? '',
    personalSpaceId: ctx.personalSpaceId ?? null,
  };
  if (ctx.path) info.path = ctx.path;
  if (ctx.libraryKey) info.libraryKey = ctx.libraryKey;
  if (ctx.fromPlatform !== undefined) info.fromPlatform = ctx.fromPlatform;
  if (ctx.updatedAt) info.updatedAt = ctx.updatedAt;
  if (ctx.expectedTimestamp) info.expectedTimestamp = ctx.expectedTimestamp;
  if (ctx.kind === 'local' && ctx.fileHash) info.fileHash = ctx.fileHash;
  return info;
}

/**
 * 唯一 writer：写入当前文件上下文（单一事实源）并同步派生兼容字段。
 *
 * 上下文实质变化时发布 FILE_CONTEXT_CHANGED（payload = 变更后的 FileContext），
 * 全部消费方订阅这一个事件；未变化时只保证幂等落位，不发布、不换引用
 * （openFileComplete 对新建图纸的幂等确认会重放同一上下文）。
 */
export function setFileContext(
  ctx: FileContext,
  opts: { resetDirty?: boolean; clearBackInfo?: boolean } = {}
): void {
  const store = useCADEditorStore.getState();
  const changed = contextChanged(store.fileContext, ctx);
  if (changed) {
    store.setFileContext(ctx);
    store.setCurrentFileInfo(deriveCurrentFileInfo(ctx));
    store.setCurrentFileId(ctx.fileId);
    store.setCurrentFileName(ctx.name);
    store.setCurrentProjectId(ctx.projectId ?? null);
  }
  store.setIsCurrentFileDeleted(false);
  if (opts.resetDirty) store.setIsDirty(false);
  if (opts.clearBackInfo) store.clearOpenedBackInfo();
  if (changed) emit(CAD_EVENTS.FILE_CONTEXT_CHANGED, ctx);
}

/** OpenFileInfo → FileContext：fileId 非空 = 云图，否则 = 本地图 */
export function contextFromFileInfo(info: OpenFileInfo): FileContext {
  if (info.fileId) {
    const ctx: FileContext = {
      kind: 'cloud',
      fileId: info.fileId,
      name: info.name || null,
    };
    if (info.parentId !== undefined) ctx.parentId = info.parentId;
    if (info.projectId !== undefined) ctx.projectId = info.projectId;
    if (info.personalSpaceId !== undefined)
      ctx.personalSpaceId = info.personalSpaceId;
    if (info.libraryKey) ctx.libraryKey = info.libraryKey;
    if (info.fromPlatform !== undefined) ctx.fromPlatform = info.fromPlatform;
    if (info.path) ctx.path = info.path;
    if (info.updatedAt) {
      ctx.updatedAt = info.updatedAt;
      ctx.expectedTimestamp = info.updatedAt;
    }
    return ctx;
  }
  const ctx: FileContext = { kind: 'local', fileId: '', name: info.name || null };
  if (info.fileHash) ctx.fileHash = info.fileHash;
  return ctx;
}

/** 唯一 writer：打开图纸。切换文件时清 back-info */
export function openSession(info: OpenFileInfo): void {
  const store = useCADEditorStore.getState();
  const prevFileId = store.currentFileId;
  setFileContext(contextFromFileInfo(info), {
    clearBackInfo: !!prevFileId && prevFileId !== info.fileId,
  });
}

/**
 * 唯一 writer：新建空白图纸（替换当前会话）。
 *
 * 必须先清掉上一张图纸的全部文件身份再记录新文件——若只 patch 部分字段，
 * 新图纸会继承旧图纸的 projectId / fromShare / 脏标记，后续保存归属与
 * 权限判断全部落在已关闭的旧文件上。新建图纸无云端身份（kind 'new'，
 * currentFileInfo 派生为 null），保存/分享走「无文件」分支进另存为。
 * 不触碰编辑器生命周期（isActive/loading/error）、权限位与协同会话：
 * 新建图纸不等于退出协同，那由协同层自行收尾。
 */
export function newSession(): void {
  const store = useCADEditorStore.getState();
  store.setIsPersonalSpaceMode(false);
  store.setFromShare(false);
  setFileContext(
    { kind: 'new', fileId: null, name: null },
    { resetDirty: true, clearBackInfo: true }
  );
}

/** 唯一 writer：关闭图纸（退出登录等场景），脏标记一并复位，引擎侧运行态一并重置 */
export function closeSession(): void {
  const store = useCADEditorStore.getState();
  store.setNavigateFunction(null);
  setFileContext(FILE_CONTEXT_NONE, { resetDirty: true });
  resetSessionRuntime();
}

/** 会话补丁中按 key 合并的标量字段（显式 undefined 也覆盖，支持「清除」语义） */
const CONTEXT_PATCH_KEYS = [
  'name',
  'fileHash',
  'projectId',
  'parentId',
  'personalSpaceId',
  'libraryKey',
  'path',
  'fromPlatform',
  'updatedAt',
  'expectedTimestamp',
] as const;

/**
 * 把会话补丁合并进当前 FileContext：
 * - fileId 非空 → 升级为 cloud；'' → local（'new' 保持 new：新建图纸不因此获得身份）
 * - none + 仅名称/哈希 → 升级为 local（协同 auto-join 名称同步场景：
 *   会话尚未建立但引擎已加载了文件）
 */
function mergeContextPatch(
  ctx: FileContext,
  patch: OpenFileInfoPatch
): FileContext {
  const next: FileContext = { ...ctx };
  if ('fileId' in patch && patch.fileId !== undefined) {
    if (patch.fileId) {
      next.kind = 'cloud';
      next.fileId = patch.fileId;
    } else {
      next.kind = ctx.kind === 'new' ? 'new' : 'local';
      next.fileId = ctx.kind === 'new' ? null : '';
    }
  }
  for (const key of CONTEXT_PATCH_KEYS) {
    if (key in patch)
      (next as unknown as Record<string, unknown>)[key] = patch[key];
  }
  if (next.kind === 'none' && (next.name || next.fileHash)) {
    next.kind = 'local';
    next.fileId = '';
  }
  return next;
}

/**
 * 会话补丁：合并更新当前文件信息（改名、保存后时间戳同步等）。
 * fromShare 是会话顶层字段（store.fromShare），显式 DTO 映射避免类型断言。
 */
export function patchSession(partial: OpenFileInfoPatch): void {
  const store = useCADEditorStore.getState();
  const { fromShare, ...infoPatch } = partial;
  if (fromShare !== undefined) store.setFromShare(fromShare);
  if (Object.keys(infoPatch).length === 0) return;
  setFileContext(mergeContextPatch(store.fileContext, infoPatch));
}

/**
 * 唯一 writer：会话顶层字段补丁（文件身份 / currentProjectId / fromShare）。
 * 协同加入、分享链接打开、打开完成回调等单字段同步场景走此命令，
 * 禁止组件直写 store 裸 setter（ADR-0039）。
 * fileId：非空 → cloud；'' → local；显式 null → 清空身份（none）。
 */
export function patchSessionFlags(patch: SessionFlagsPatch): void {
  const store = useCADEditorStore.getState();
  if (patch.fromShare !== undefined) store.setFromShare(patch.fromShare);
  if (
    patch.fileId === undefined &&
    patch.fileName === undefined &&
    patch.projectId === undefined
  ) {
    return;
  }
  const next: FileContext = { ...store.fileContext };
  if (patch.fileId !== undefined) {
    if (patch.fileId) {
      next.kind = 'cloud';
      next.fileId = patch.fileId;
    } else if (patch.fileId === '') {
      next.kind = 'local';
      next.fileId = '';
    } else {
      // 显式 null：清空文件身份（协同分享链接清理 / 新建文件）
      next.kind = 'none';
      next.fileId = null;
      next.name = null;
      next.projectId = null;
      next.parentId = null;
      next.personalSpaceId = null;
      next.libraryKey = null;
      next.fileHash = undefined;
      next.path = undefined;
      next.updatedAt = undefined;
      next.expectedTimestamp = undefined;
      next.fromPlatform = undefined;
    }
  }
  if (patch.fileName !== undefined) next.name = patch.fileName;
  if (patch.projectId !== undefined) next.projectId = patch.projectId;
  if (next.kind === 'none' && (next.name || next.fileHash)) {
    next.kind = 'local';
    next.fileId = '';
  }
  setFileContext(next);
}

/** 脏标记单一写点（database-modified 置脏；save / close 复位） */
export function setModified(modified: boolean): void {
  useCADEditorStore.getState().setIsDirty(modified);
}

/** 唯一 writer：清除「当前文件已被删除」标记（另存为成功、新建文件后调用） */
export function clearCurrentFileDeleted(): void {
  useCADEditorStore.getState().setIsCurrentFileDeleted(false);
}

/**
 * 文件系统动作 → 会话通知：「这些节点已被删除（含服务端 404/DELETED 检测）」。
 * 「删的是当前打开文件才置位」的 id 匹配推导收进 implementation——文件系统
 * hook / 保存序列只报 id 列表，禁止再各自复制 currentFileId 比对（ADR-0039）。
 */
export function notifyNodesDeleted(nodeIds: readonly string[]): void {
  const { currentFileId } = useCADEditorStore.getState();
  if (currentFileId && nodeIds.includes(currentFileId)) {
    useCADEditorStore.getState().setIsCurrentFileDeleted(true);
  }
}

/** 文件系统动作 → 会话通知：「这些节点已被恢复 / 撤销删除」 */
export function notifyNodesRestored(nodeIds: readonly string[]): void {
  const { currentFileId } = useCADEditorStore.getState();
  if (currentFileId && nodeIds.includes(currentFileId)) {
    useCADEditorStore.getState().setIsCurrentFileDeleted(false);
  }
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
