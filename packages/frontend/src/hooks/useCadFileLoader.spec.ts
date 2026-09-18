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

const {
  mxcadManagerMock,
  initMxCADConfigMock,
  guardBeforeOpenMock,
  queueStoreMock,
  broadcastConversionActivityMock,
  showGlobalLoadingMock,
  hideGlobalLoadingMock,
} = vi.hoisted(() => ({
  mxcadManagerMock: {
    isCreated: vi.fn(() => false),
    isReady: vi.fn(() => true),
    openFile: vi.fn(async () => {}),
    showMxCAD: vi.fn(),
    initializeMxCADView: vi.fn(async () => {}),
  },
  initMxCADConfigMock: vi.fn(async () => {}),
  guardBeforeOpenMock: vi.fn(async () => true),
  queueStoreMock: {
    refreshCloud: vi.fn(),
    expandByTask: vi.fn(),
  },
  broadcastConversionActivityMock: vi.fn(),
  showGlobalLoadingMock: vi.fn(),
  hideGlobalLoadingMock: vi.fn(),
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
  guardBeforeOpen: guardBeforeOpenMock,
}));
vi.mock('@/services/loadingService', () => ({
  showGlobalLoading: showGlobalLoadingMock,
  hideGlobalLoading: hideGlobalLoadingMock,
}));
vi.mock('@/stores/conversionQueueStore', () => ({
  useConversionQueueStore: { getState: () => queueStoreMock },
  broadcastConversionActivity: broadcastConversionActivityMock,
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
    onFileOpened: vi.fn(),
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

describe('useCadFileLoader — 转换等待期不锁编辑器 + 打开前守卫复查', () => {
  const PROCESSING_FILE = {
    id: 'f-1',
    path: null,
    fileHash: null,
    isRoot: true,
    name: 'a.dwg',
    updatedAt: '2026-09-16T10:00:00Z',
    fileStatus: 'PROCESSING',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mxcadManagerMock.isCreated.mockReturnValue(true);
    mxcadManagerMock.isReady.mockReturnValue(true);
  });

  afterEach(() => {
    clearDrawingSessionListeners();
  });

  it('转换等待：展开面板 + 重拉云端 + 跨标签页广播，等待期不显示全屏遮罩', async () => {
    // 首查 PROCESSING（无 fileHash）→ 进入转换等待；转换完成后重查得到就绪节点
    mockedGetNode
      .mockReturnValueOnce({ data: PROCESSING_FILE, error: undefined })
      .mockReturnValueOnce({ data: FILE, error: undefined });

    renderHook(
      () =>
        useCadFileLoader(
          createDeps({
            fileId: 'f-1',
            isActive: true,
            isAuthenticated: true,
            personalSpaceId: 'ps-1',
          }),
          createFns()
        )
    );
    await flush();

    expect(mxcadManagerMock.openFile).toHaveBeenCalledTimes(1);
    expect(queueStoreMock.expandByTask).toHaveBeenCalled();
    expect(queueStoreMock.refreshCloud).toHaveBeenCalled();
    expect(broadcastConversionActivityMock).toHaveBeenCalled();
    // 等待期不显示「文件转换中」遮罩（转换面板提供进度反馈）；
    // 唯一的 show 是打开时的「正在加载图纸...」
    const showMessages = showGlobalLoadingMock.mock.calls.map((c) => c[0]);
    expect(showMessages).not.toContain('文件转换中，请稍候...');
    expect(showMessages).toContain('正在加载图纸...');
  });

  it('转换等待：用户取消守卫 → 不打开、不记录打开状态（onFileOpened 不触发）', async () => {
    guardBeforeOpenMock.mockResolvedValueOnce(false);
    mockedGetNode
      .mockReturnValueOnce({ data: PROCESSING_FILE, error: undefined })
      .mockReturnValueOnce({ data: FILE, error: undefined });

    const fns = createFns();
    renderHook(
      () =>
        useCadFileLoader(
          createDeps({
            fileId: 'f-1',
            isActive: true,
            isAuthenticated: true,
            personalSpaceId: 'ps-1',
          }),
          fns
        )
    );
    await flush();

    expect(guardBeforeOpenMock).toHaveBeenCalled();
    expect(mxcadManagerMock.openFile).not.toHaveBeenCalled();
    expect(fns.onFileOpened).not.toHaveBeenCalled();
    expect(fns.onError).not.toHaveBeenCalledWith(expect.any(String));
  });
});

describe('useCadFileLoader — 首开（?hash= 直接进入）打开期必须有 loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 首次进入：引擎视图尚未创建（isCreated=false）→ 走初始化 + 首开打开分支
    mxcadManagerMock.isCreated.mockReturnValue(false);
    mxcadManagerMock.isReady.mockReturnValue(true);
  });

  afterEach(() => {
    clearDrawingSessionListeners();
  });

  it('?hash= 首开发 __openWebFile__（openFile）期间显示全局 loading，打开结束即摘', async () => {
    renderHook(
      () =>
        useCadFileLoader(
          createDeps({
            hashParam: '6dab381a35f2691743d8258b84534f8a',
            shareFileNameParam: '七幕地下-电气施工图.DWG',
            isActive: true,
          }),
          createFns()
        )
    );
    await vi.waitFor(() =>
      expect(mxcadManagerMock.openFile).toHaveBeenCalledTimes(1)
    );

    const showOrder = showGlobalLoadingMock.mock.invocationCallOrder[0]!;
    const openOrder = mxcadManagerMock.openFile.mock.invocationCallOrder[0]!;
    const hideOrder = hideGlobalLoadingMock.mock.invocationCallOrder[0]!;
    // 容器此刻尚未 showMxCAD（延后到 RAF 之后），打开期只有全局遮罩提供反馈
    expect(showOrder).toBeLessThan(openOrder);
    expect(showGlobalLoadingMock.mock.calls[0]![0]).toBe('正在加载图纸...');
    expect(hideOrder).toBeGreaterThan(openOrder);
  });

  it('首开打开失败（openFile 抛错）→ 遮罩同样摘除，不永久 loading', async () => {
    mxcadManagerMock.openFile.mockRejectedValueOnce(new Error('文件打开超时'));

    const fns = createFns();
    renderHook(
      () =>
        useCadFileLoader(
          createDeps({
            hashParam: '6dab381a35f2691743d8258b84534f8a',
            shareFileNameParam: '图纸.DWG',
            isActive: true,
          }),
          fns
        )
    );
    await vi.waitFor(() => expect(hideGlobalLoadingMock).toHaveBeenCalled());

    expect(showGlobalLoadingMock).toHaveBeenCalledWith('正在加载图纸...');
    expect(hideGlobalLoadingMock).toHaveBeenCalled();
    // 失败原因透传，不用「CAD编辑器初始化失败」兜底误导用户
    expect(fns.onError).toHaveBeenCalledWith('文件打开超时');
  });
});