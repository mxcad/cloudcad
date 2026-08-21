import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CAD_EVENTS } from '@/constants/events';
import {
  openSession,
  closeSession,
  patchSession,
  patchSessionFlags,
  setModified,
  getModified,
  clearCurrentFileDeleted,
  setCurrentFileUrl,
  getCurrentFileUrl,
  setCacheTimestamp,
  getCacheTimestamp,
  resetSessionRuntime,
  emitFileOpened,
  emitOpenComplete,
  emit,
  subscribe,
  useDrawingSession,
  clearDrawingSessionListeners,
} from '../index';

function resetStore(): void {
  useCADEditorStore.setState({
    isActive: false,
    loading: false,
    error: null,
    canSave: false,
    canExport: false,
    canManageExternalRef: false,
    currentFileId: null,
    currentFileName: null,
    currentProjectId: null,
    isPersonalSpaceMode: false,
    fromShare: false,
    fromCollabShare: false,
    targetCollabWorkId: null,
    collabShareLibraryKey: null,
    isInCollaboration: false,
    collaborationWorkId: null,
    currentFileInfo: null,
    isDirty: false,
    isCurrentFileDeleted: false,
    isLeavingPage: false,
    navigateFunction: null,
    openedBackUrl: null,
    openedInitialFileId: null,
  });
}

const sampleInfo = {
  fileId: 'file-1',
  parentId: 'parent-1',
  projectId: 'project-1',
  name: 'drawing.dwg',
  personalSpaceId: 'ps-1',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  resetStore();
  resetSessionRuntime();
  // 注意：不清空 bus 监听——session 内部有 database-modified → 置脏 的常驻订阅
});

describe('openSession / closeSession — 唯一 writer', () => {
  it('写入 currentFileInfo（含 expectedTimestamp）/ currentFileId / currentFileName', () => {
    openSession(sampleInfo);
    const state = useCADEditorStore.getState();
    expect(state.currentFileId).toBe('file-1');
    expect(state.currentFileName).toBe('drawing.dwg');
    expect(state.currentFileInfo).toEqual({
      ...sampleInfo,
      expectedTimestamp: sampleInfo.updatedAt,
    });
  });

  it('切换文件时清 back-info', () => {
    useCADEditorStore.getState().setCurrentFileId('file-1');
    useCADEditorStore.getState().setOpenedBackInfo('/projects', 'file-1');
    openSession({ ...sampleInfo, fileId: 'file-2' });
    expect(useCADEditorStore.getState().openedBackUrl).toBeNull();
    expect(useCADEditorStore.getState().openedInitialFileId).toBeNull();
  });

  it('打开同一文件时不误清 back-info', () => {
    useCADEditorStore.getState().setOpenedBackInfo('/projects', 'file-1');
    openSession(sampleInfo);
    expect(useCADEditorStore.getState().openedBackUrl).toBe('/projects');
  });

  it('closeSession 清空会话相关 store 字段', () => {
    useCADEditorStore.getState().setNavigateFunction(() => undefined);
    openSession(sampleInfo);
    closeSession();
    const state = useCADEditorStore.getState();
    expect(state.currentFileInfo).toBeNull();
    expect(state.currentFileId).toBeNull();
    expect(state.currentFileName).toBeNull();
    expect(state.currentProjectId).toBeNull();
    expect(state.navigateFunction).toBeNull();
    expect(state.isCurrentFileDeleted).toBe(false);
  });

  it('closeSession 同时重置引擎侧运行态（currentFileUrl / cacheTimestamp）', () => {
    setCurrentFileUrl('/api/v1/mxcad/filesData/1/demo.mxweb?t=1');
    setCacheTimestamp(999);
    openSession(sampleInfo);
    closeSession();
    expect(getCurrentFileUrl()).toBeNull();
    expect(getCacheTimestamp()).toBeUndefined();
  });

  it('patchSession 合并更新文件信息', () => {
    openSession(sampleInfo);
    patchSession({ name: 'renamed.dwg' });
    expect(useCADEditorStore.getState().currentFileInfo?.name).toBe(
      'renamed.dwg'
    );
    expect(useCADEditorStore.getState().currentFileInfo?.fileId).toBe('file-1');
  });

  it('patchSession 支持 fromShare（DTO 显式映射到 store 顶层字段，无类型断言 hack）', () => {
    openSession(sampleInfo);
    patchSession({ fromShare: true, name: 'renamed.dwg' });
    const state = useCADEditorStore.getState();
    expect(state.fromShare).toBe(true);
    expect(state.currentFileInfo?.name).toBe('renamed.dwg');
  });

  it('patchSessionFlags 更新顶层会话字段（协同加入/分享打开/打开完成）', () => {
    patchSessionFlags({
      fileId: 'file-9',
      fileName: 'shared.dwg',
      projectId: 'project-9',
      fromShare: true,
    });
    const state = useCADEditorStore.getState();
    expect(state.currentFileId).toBe('file-9');
    expect(state.currentFileName).toBe('shared.dwg');
    expect(state.currentProjectId).toBe('project-9');
    expect(state.fromShare).toBe(true);
  });

  it('patchSessionFlags 未提供的字段保持不变', () => {
    openSession(sampleInfo);
    patchSessionFlags({ fromShare: true });
    const state = useCADEditorStore.getState();
    expect(state.currentFileId).toBe('file-1');
    expect(state.currentFileName).toBe('drawing.dwg');
    expect(state.currentProjectId).toBeNull();
    expect(state.fromShare).toBe(true);
  });

  it('patchSessionFlags 支持显式置 null 清空', () => {
    patchSessionFlags({
      fileId: 'file-9',
      fileName: 'shared.dwg',
      projectId: 'project-9',
    });
    patchSessionFlags({ fileId: null, fileName: null, projectId: null });
    const state = useCADEditorStore.getState();
    expect(state.currentFileId).toBeNull();
    expect(state.currentFileName).toBeNull();
    expect(state.currentProjectId).toBeNull();
  });

  it('clearCurrentFileDeleted 清除已删除标记（另存为成功/新建文件）', () => {
    useCADEditorStore.getState().setIsCurrentFileDeleted(true);
    clearCurrentFileDeleted();
    expect(useCADEditorStore.getState().isCurrentFileDeleted).toBe(false);
  });
});

describe('isModified — 脏标记单一写点', () => {
  it('setModified / getModified 读写 isDirty', () => {
    expect(getModified()).toBe(false);
    setModified(true);
    expect(getModified()).toBe(true);
    setModified(false);
    expect(getModified()).toBe(false);
  });

  it('database-modified 信号 → 置脏（生命周期 open→modified→save→close）', () => {
    openSession(sampleInfo);
    expect(getModified()).toBe(false);

    emitOpenComplete({ fileId: 'file-1', fileName: 'drawing.dwg' });
    expect(getModified()).toBe(false);

    // 引擎 databaseModify → bus 事件 → 置脏
    useCADEditorStore.getState().setIsDirty(false);
    emit(CAD_EVENTS.DATABASE_MODIFIED);
    expect(getModified()).toBe(true);

    // 保存 → 复位
    setModified(false);
    expect(getModified()).toBe(false);
  });
});

describe('subscribe / emit — 类型化事件 bus', () => {
  it('file-opened payload 送达订阅者', () => {
    const handler = vi.fn();
    const unsubscribe = subscribe(CAD_EVENTS.FILE_OPENED, handler);
    emitFileOpened({
      fileId: 'file-1',
      parentId: 'parent-1',
      projectId: 'project-1',
      fileName: 'drawing.dwg',
    });
    expect(handler).toHaveBeenCalledWith({
      fileId: 'file-1',
      parentId: 'parent-1',
      projectId: 'project-1',
      fileName: 'drawing.dwg',
    });
    unsubscribe();
    emitFileOpened({ fileId: 'file-2', parentId: null, projectId: null });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('save-required payload 送达订阅者（T1 迁移：SAVE_REQUIRED 走类型化 bus）', () => {
    const handler = vi.fn();
    const unsubscribe = subscribe(CAD_EVENTS.SAVE_REQUIRED, handler);
    emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    expect(handler).toHaveBeenCalledWith({ action: '保存文件' });
    unsubscribe();
    emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('new-file payload 送达订阅者（T8 迁移：NEW_FILE 走类型化 bus）', () => {
    const handler = vi.fn();
    const unsubscribe = subscribe(CAD_EVENTS.NEW_FILE, handler);
    emit(CAD_EVENTS.NEW_FILE, {
      fileId: null,
      parentId: null,
      projectId: null,
    });
    expect(handler).toHaveBeenCalledWith({
      fileId: null,
      parentId: null,
      projectId: null,
    });
    unsubscribe();
    emit(CAD_EVENTS.NEW_FILE, {
      fileId: null,
      parentId: null,
      projectId: null,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('public-file-uploaded payload 送达订阅者（T8 迁移：PUBLIC_FILE_UPLOADED 走类型化 bus）', () => {
    const handler = vi.fn();
    const unsubscribe = subscribe(CAD_EVENTS.PUBLIC_FILE_UPLOADED, handler);
    const callback = vi.fn().mockResolvedValue(undefined);
    emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
      fileHash: 'abc123',
      fileName: 'demo.dwg',
      noCache: false,
      callback,
    });
    expect(handler).toHaveBeenCalledWith({
      fileHash: 'abc123',
      fileName: 'demo.dwg',
      noCache: false,
      callback,
    });
    unsubscribe();
    emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
      fileHash: 'abc123',
      fileName: 'demo.dwg',
      noCache: false,
      callback,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('open-complete payload 送达订阅者', () => {
    const handler = vi.fn();
    subscribe(CAD_EVENTS.OPEN_COMPLETE, handler);
    emitOpenComplete({ fileId: 'file-1', fileName: 'drawing.dwg' });
    expect(handler).toHaveBeenCalledWith({
      fileId: 'file-1',
      fileName: 'drawing.dwg',
    });
  });

  it('取消订阅后不再收到事件', () => {
    const handler = vi.fn();
    const unsubscribe = subscribe(CAD_EVENTS.OPEN_COMPLETE, handler);
    unsubscribe();
    emitOpenComplete({ fileId: 'file-1', fileName: null });
    expect(handler).not.toHaveBeenCalled();
  });

  it('clearDrawingSessionListeners 清空全部订阅', () => {
    const handler = vi.fn();
    subscribe(CAD_EVENTS.OPEN_COMPLETE, handler);
    clearDrawingSessionListeners();
    emitOpenComplete({ fileId: 'file-1', fileName: null });
    expect(handler).not.toHaveBeenCalled();
  });

  it('clearDrawingSessionListeners 保留常驻订阅（DATABASE_MODIFIED → 置脏仍生效）', () => {
    clearDrawingSessionListeners();
    useCADEditorStore.getState().setIsDirty(false);
    emit(CAD_EVENTS.DATABASE_MODIFIED);
    expect(getModified()).toBe(true);
  });

  it('emit 中某个 handler 抛异常不阻断后续 handler（并记录错误日志）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const okHandler = vi.fn();
    subscribe(CAD_EVENTS.OPEN_COMPLETE, () => {
      throw new Error('handler boom');
    });
    subscribe(CAD_EVENTS.OPEN_COMPLETE, okHandler);
    emitOpenComplete({ fileId: 'file-1', fileName: 'drawing.dwg' });
    expect(okHandler).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('引擎侧运行态（currentFileUrl / cacheTimestamp）', () => {
  it('set/get currentFileUrl', () => {
    expect(getCurrentFileUrl()).toBeNull();
    setCurrentFileUrl('/api/v1/mxcad/filesData/1/demo.mxweb?t=123');
    expect(getCurrentFileUrl()).toBe(
      '/api/v1/mxcad/filesData/1/demo.mxweb?t=123'
    );
  });

  it('set/get cacheTimestamp', () => {
    expect(getCacheTimestamp()).toBeUndefined();
    setCacheTimestamp(123456);
    expect(getCacheTimestamp()).toBe(123456);
  });

  it('resetSessionRuntime 清空两者', () => {
    setCurrentFileUrl('/api/1.mxweb');
    setCacheTimestamp(123);
    resetSessionRuntime();
    expect(getCurrentFileUrl()).toBeNull();
    expect(getCacheTimestamp()).toBeUndefined();
  });
});

describe('useDrawingSession — React 薄读 hook', () => {
  it('返回响应式会话状态', () => {
    const { result } = renderHook(() => useDrawingSession());
    expect(result.current.fileId).toBeNull();
    expect(result.current.isModified).toBe(false);

    act(() => {
      openSession(sampleInfo);
    });
    expect(result.current.fileId).toBe('file-1');
    expect(result.current.fileName).toBe('drawing.dwg');
    expect(result.current.fileInfo?.projectId).toBe('project-1');

    act(() => {
      setModified(true);
    });
    expect(result.current.isModified).toBe(true);

    act(() => {
      closeSession();
    });
    expect(result.current.fileId).toBeNull();
    expect(result.current.isModified).toBe(false);
  });

  it('状态未变化时返回稳定引用（selector 引用稳定性，避免破坏 memo/useEffect）', () => {
    const { result, rerender } = renderHook(() => useDrawingSession());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
