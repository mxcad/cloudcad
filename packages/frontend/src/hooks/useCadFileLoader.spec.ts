import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useCadFileLoader,
  type CadFileLoaderState,
  type CadFileLoaderCallbacks,
} from './useCadFileLoader';
import {
  emit,
  subscribe,
  clearDrawingSessionListeners,
} from '@/services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';

const { mxcadManagerMock, initMxCADConfigMock } = vi.hoisted(() => ({
  mxcadManagerMock: {
    isCreated: vi.fn(() => false),
    isReady: vi.fn(() => true),
    openFile: vi.fn(async () => {}),
    showMxCAD: vi.fn(),
  },
  initMxCADConfigMock: vi.fn(async () => {}),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode: vi.fn(),
  nodeControllerGetRootNode: vi.fn(() => ({ data: null })),
  libraryControllerGetDrawingNode: vi.fn(),
  libraryControllerGetBlockNode: vi.fn(),
  shareControllerResolveShareNode: vi.fn(),
}));
vi.mock('@/services/mxcadManager', () => ({
  mxcadManager: mxcadManagerMock,
  setNavigateFunction: vi.fn(),
  initMxCADConfig: initMxCADConfigMock,
  initThemeSync: vi.fn(async () => {}),
  setPersonalSpaceId: vi.fn(),
  setOpenedBackInfo: vi.fn(),
  refreshFileName: vi.fn(),
  restoreEditorTitle: vi.fn(),
  hasDocumentLoaded: vi.fn(() => false),
  waitForDocumentLoaded: vi.fn(async () => true),
}));
vi.mock('@/services/loadingService', () => ({
  showGlobalLoading: vi.fn(),
  hideGlobalLoading: vi.fn(),
}));
vi.mock('./conversion/useConversionPolling', () => ({
  waitForConversion: vi.fn(async () => ({ completed: true })),
}));
vi.mock('@/languages', () => ({ t: (s: string) => s }));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: vi.fn(),
  globalShowConfirm: vi.fn(async () => true),
}));
vi.mock('@/utils/errorHandler', () => ({
  getErrorMessage: vi.fn(() => ''),
}));

import { nodeControllerGetNode } from '@/api-sdk';

const mockedGetNode = vi.mocked(nodeControllerGetNode);

const FILE = {
  id: 'f-1',
  path: '202609/node-1/a.mxweb',
  fileHash: 'hash-1',
  isRoot: true,
  name: 'a.mxweb',
  updatedAt: '2026-09-16T10:00:00Z',
  fileStatus: 'COMPLETED',
};

function createDeps(
  overrides: Partial<CadFileLoaderState> = {}
): CadFileLoaderState {
  return {
    fileId: null,
    collabWorkId: null,
    isAuthenticated: false,
    personalSpaceId: null,
    libraryKeyParam: null,
    shareTokenParam: null,
    versionParam: null,
    nodeIdParam: null,
    shareFileNameParam: null,
    hasLibraryDrawingManage: false,
    hasLibraryBlockManage: false,
    isInitializedRef: { current: false },
    loadedFileUrlRef: { current: null },
    currentFileIdRef: { current: null },
    isActive: false,
    ...overrides,
  };
}

function createFns(): CadFileLoaderCallbacks {
  return {
    onError: vi.fn(),
    onStoreError: vi.fn(),
    onLoading: vi.fn(),
    onStoreLoading: vi.fn(),
    setStoreFileId: vi.fn(),
    setStoreFileName: vi.fn(),
    setFromShare: vi.fn(),
    setStoreProjectId: vi.fn(),
    onNewFile: vi.fn(),
  };
}

/** flush 动态 import + API await + effect 内的异步链 */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve();
  });
}

describe('useCadFileLoader — NEW_FILE 走类型化 bus（T8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearDrawingSessionListeners();
  });

  it('bus emit NEW_FILE 触发 onNewFile 回调', () => {
    const fns = createFns();
    renderHook(() => useCadFileLoader(createDeps(), fns));

    act(() => {
      emit(CAD_EVENTS.NEW_FILE, {
        fileId: null,
        parentId: null,
        projectId: null,
      });
    });

    expect(fns.onNewFile).toHaveBeenCalledTimes(1);
  });

  it('bus payload 完整透传（fileId/parentId/projectId 字段保持）', () => {
    const received: unknown[] = [];
    const unsubscribe = subscribe(CAD_EVENTS.NEW_FILE, (detail) => {
      received.push(detail);
    });
    const fns = createFns();
    renderHook(() => useCadFileLoader(createDeps(), fns));

    act(() => {
      emit(CAD_EVENTS.NEW_FILE, {
        fileId: 'f-1',
        parentId: 'p-1',
        projectId: 'prj-1',
      });
    });

    expect(received).toEqual([
      { fileId: 'f-1', parentId: 'p-1', projectId: 'prj-1' },
    ]);
    expect(fns.onNewFile).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('unmount 后取消订阅，emit 不再触发 onNewFile', () => {
    const fns = createFns();
    const { unmount } = renderHook(() => useCadFileLoader(createDeps(), fns));
    unmount();

    act(() => {
      emit(CAD_EVENTS.NEW_FILE, {
        fileId: null,
        parentId: null,
        projectId: null,
      });
    });

    expect(fns.onNewFile).not.toHaveBeenCalled();
  });
});

describe('useCadFileLoader — 视图已创建时仍必须发打开命令', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetNode.mockReturnValue({ data: FILE, error: undefined });
    mxcadManagerMock.isCreated.mockReturnValue(true);
    mxcadManagerMock.isReady.mockReturnValue(true);
  });

  afterEach(() => {
    clearDrawingSessionListeners();
  });

  it('isInitializedRef 归零（组件卸载再挂载）→ 走已创建分支调 openFile，不静默跳过', async () => {
    const isInitializedRef = { current: false };
    const deps = createDeps({
      fileId: 'f-1',
      isActive: true,
      isAuthenticated: true,
      personalSpaceId: 'ps-1',
      isInitializedRef,
    });

    renderHook(() => useCadFileLoader(deps, createFns()));
    await flush();

    // 已创建分支不重新初始化引擎。此断言用于区分两条路径：若回退修复让代码落到
    // 全新初始化主路径，openFile 同样会被调用（构造性通过），但 initMxCADConfig 会变红。
    expect(initMxCADConfigMock).not.toHaveBeenCalled();
    expect(mxcadManagerMock.openFile).toHaveBeenCalledTimes(1);
    expect(mxcadManagerMock.openFile.mock.calls[0]![0]!.url).toContain(
      '/api/v1/mxcad/filesData/202609/node-1/a.mxweb'
    );
    expect(isInitializedRef.current).toBe(true);
  });

  it('isInitializedRef 已为 true（首次打开完成后再切图纸）→ 同样走 openFile', async () => {
    renderHook(
      () =>
        useCadFileLoader(
          createDeps({
            fileId: 'f-1',
            isActive: true,
            isAuthenticated: true,
            personalSpaceId: 'ps-1',
            isInitializedRef: { current: true },
          }),
          createFns()
        )
    );
    await flush();

    expect(mxcadManagerMock.openFile).toHaveBeenCalledTimes(1);
  });

  it('同一 URL 已打开（isInitializedRef=true 且 URL 相等）→ 不重复发起打开', async () => {
    const loadedFileUrlRef = {
      current: `/api/v1/mxcad/filesData/${FILE.path}?t=${new Date(
        FILE.updatedAt!
      ).getTime()}`,
    };
    renderHook(
      () =>
        useCadFileLoader(
          createDeps({
            fileId: 'f-1',
            isActive: true,
            isAuthenticated: true,
            personalSpaceId: 'ps-1',
            isInitializedRef: { current: true },
            loadedFileUrlRef,
          }),
          createFns()
        )
    );
    await flush();

    expect(mxcadManagerMock.openFile).not.toHaveBeenCalled();
    expect(mxcadManagerMock.showMxCAD).toHaveBeenCalled();
  });
});