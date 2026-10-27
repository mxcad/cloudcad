/**
 * useCollabAutoJoin — 协同链接（?collabWorkId=）路由级 auto-join
 *
 * 回归目标（历史缺陷）：
 * 1. auto-join 曾挂在 CollaborateSidebar 面板里，受 collaborationEnabled /
 *    isCollaborationAllowed / 侧边栏 isVisible / activeTab 四重门禁支配，
 *    任一关掉即静默吞掉 URL 意图——本 hook 上移路由级，脱离全部面板门禁。
 * 2. loading 曾被 isCadReady 门禁压到引擎就绪之后，最慢的 WASM 初始化段裸奔；
 *    本 hook 从意图出现即 showGlobalLoading。
 * 3. effect 依赖曾含 user 对象（AuthContext.refreshUser 每次产生新对象），
 *    成员变更 SSE 触发 effect 重跑、cleanup 掐断在途 join 重试链——现依赖 user?.id。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollabAutoJoin } from './useCollabAutoJoin';
import { useCADEditorStore } from '../stores/useCADEditorStore';

const { authState, mxcadManagerMock, cooperateMock, patchSessionMock,
  patchSessionFlagsMock, showGlobalLoadingMock, hideGlobalLoadingMock,
  globalShowToastMock } = vi.hoisted(() => ({
  authState: { user: { id: 'u1', username: 'tester', avatar: null } },
  mxcadManagerMock: { isReady: vi.fn(() => true) },
  cooperateMock: { joinWork: vi.fn(), exitWork: vi.fn() },
  patchSessionMock: vi.fn(),
  patchSessionFlagsMock: vi.fn(),
  showGlobalLoadingMock: vi.fn(),
  hideGlobalLoadingMock: vi.fn(),
  globalShowToastMock: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock('../services/mxcadManager', () => ({
  mxcadManager: mxcadManagerMock,
  getCooperate: vi.fn(() => cooperateMock),
  refreshFileName: vi.fn(),
  isEmptyDocumentName: vi.fn(() => false),
}));
vi.mock('../services/drawingSession', () => ({
  patchSession: patchSessionMock,
  patchSessionFlags: patchSessionFlagsMock,
}));
vi.mock('../services/loadingService', () => ({
  showGlobalLoading: showGlobalLoadingMock,
  hideGlobalLoading: hideGlobalLoadingMock,
}));
vi.mock('../utils/notificationEvents', () => ({
  globalShowToast: globalShowToastMock,
}));

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
    fromShare: true,
    fromCollabShare: true,
    targetCollabWorkId: 3,
    collabShareLibraryKey: null,
    isInCollaboration: false,
    collaborationWorkId: null,
    collabPhase: 'idle',
    collabExitGuard: false,
    pendingJoinWorkId: null,
    currentFileInfo: null,
    isDirty: false,
    isCurrentFileDeleted: false,
    isLeavingPage: false,
    navigateFunction: null,
    openedBackUrl: null,
    openedInitialFileId: null,
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  authState.user = { id: 'u1', username: 'tester', avatar: null };
  mxcadManagerMock.isReady.mockReturnValue(true);
});

/** 推进 timer：isReady 后 500ms 首试 + iRet===0 路径 onFileLoaded 另 500ms */
async function advanceBy(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useCollabAutoJoin — 路由级意图驱动', () => {
  it('未登录（user null）：不发起 joinWork，意图保留（等待登录后重跑）', async () => {
    authState.user = null;
    vi.useFakeTimers();
    try {
      renderHook(() => useCollabAutoJoin(vi.fn()));
      await advanceBy(1000);
      expect(cooperateMock.joinWork).not.toHaveBeenCalled();
      expect(useCADEditorStore.getState().fromCollabShare).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('意图不存在（fromCollabShare=false）：不发起 joinWork', async () => {
    useCADEditorStore.setState({ fromCollabShare: false });
    vi.useFakeTimers();
    try {
      renderHook(() => useCollabAutoJoin(vi.fn()));
      await advanceBy(1000);
      expect(cooperateMock.joinWork).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('成功（iRet===0）：joinWork → 协同加入 → 解除分享模式 → onFileLoaded', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(0)
    );
    const onFileLoaded = vi.fn();
    vi.useFakeTimers();
    try {
      renderHook(() => useCollabAutoJoin(onFileLoaded));
      // 意图出现即弹 loading（覆盖引擎初始化间隙）
      expect(showGlobalLoadingMock).toHaveBeenCalledWith(
        expect.any(String),
        'autoJoin'
      );
      // 500ms 首试
      await advanceBy(600);
      expect(cooperateMock.joinWork).toHaveBeenCalledWith(
        3,
        expect.any(Function),
        'u1',
        expect.any(String)
      );
      // 协同已加入
      expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
      expect(useCADEditorStore.getState().collaborationWorkId).toBe(3);
      // 分享模式解除（恢复协同面板轮询/刷新/名称解析）
      expect(patchSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ fromShare: false })
      );
      // 链接参数已消费，避免 effect 重复加入
      expect(useCADEditorStore.getState().fromCollabShare).toBe(false);
      // 骨架屏关闭信号（iRet===0 路径 onFileLoaded 在 500ms 后触发）
      await advanceBy(600);
      expect(onFileLoaded).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('iRet===17（已在协同中）：同样加入 + 解除分享模式 + onFileLoaded', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(17)
    );
    const onFileLoaded = vi.fn();
    vi.useFakeTimers();
    try {
      renderHook(() => useCollabAutoJoin(onFileLoaded));
      await advanceBy(600);
      expect(cooperateMock.joinWork).toHaveBeenCalled();
      expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
      expect(useCADEditorStore.getState().collaborationWorkId).toBe(3);
      expect(patchSessionFlagsMock).toHaveBeenCalledWith(
        expect.objectContaining({ fromShare: false })
      );
      expect(onFileLoaded).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('iRet 为正其他值（协同已关闭）：toast + 清除意图 + onFileLoaded', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(9)
    );
    const onFileLoaded = vi.fn();
    vi.useFakeTimers();
    try {
      renderHook(() => useCollabAutoJoin(onFileLoaded));
      await advanceBy(600);
      // 失败也须关 loading + 清意图（不永久停留在加载态）
      expect(useCADEditorStore.getState().fromCollabShare).toBe(false);
      expect(globalShowToastMock).toHaveBeenCalled();
      expect(hideGlobalLoadingMock).toHaveBeenCalled();
      expect(onFileLoaded).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('引擎未就绪：轮询至 isReady 后发起 joinWork', async () => {
    mxcadManagerMock.isReady.mockReturnValue(false);
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(0)
    );
    vi.useFakeTimers();
    try {
      renderHook(() => useCollabAutoJoin(vi.fn()));
      await advanceBy(400);
      expect(cooperateMock.joinWork).not.toHaveBeenCalled();
      // 引擎就绪后 200ms 轮询间隔内捕获
      mxcadManagerMock.isReady.mockReturnValue(true);
      await advanceBy(1000);
      expect(cooperateMock.joinWork).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
