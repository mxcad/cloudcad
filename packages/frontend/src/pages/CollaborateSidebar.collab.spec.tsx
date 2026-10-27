/**
 * 协同链接 auto-join 端到端（真实挂载链）
 *
 * 场景：URL 带 collabWorkId，已登录用户打开编辑器。CADEditorDirect 挂载的是
 * 「路由级 useCollabAutoJoin + 协同面板」两段真实链：意图由路由 hook 执行，
 * 面板负责对账。历史 bug 正是测试绕开了真实挂载链（直接 render 面板 + 传
 * onFileLoaded prop），happy path 全绿而真实断点零测试，静默拦下能长期存活。
 * 本测试用 harness 同时挂 useCollabAutoJoin 与 CollaborateSidebar，复刻真实挂载。
 *
 * 回归点：
 * 1. auto-join 自动 joinWork（面板门禁不再吞意图）
 * 2. 协同加入 → fromShare 解除 → 面板强制拉取 works
 * 3. pendingJoinWorkId 对账：work_data.drawingName 补齐 currentFileName
 * 4. 骨架屏关闭（onFileLoaded）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { clearDrawingSessionListeners } from '@/services/drawingSession';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CollaborateSidebar } from '../components/CollaborateSidebar';
import { useCollabAutoJoin } from '../hooks/useCollabAutoJoin';

const userMock = { id: 'u1', username: 'tester', avatar: null };

const cooperateMock = vi.hoisted(() => ({
  joinWork: vi.fn((_workId: number, cb: (ret: number) => void) => cb(0)),
  createWork: vi.fn(),
  exitWork: vi.fn(),
  getWorks: vi.fn((cb: (list: unknown[]) => void) =>
    cb([
      {
        work_id: 3,
        work_data: JSON.stringify({
          v: 3,
          drawingId: '',
          projectId: null,
          drawingName: '空白图纸.dwg',
          sourceType: 'local',
          creatorId: 'u1',
          creatorName: 'tester',
        }),
        real_user_id: 'u1',
        link_user_ids: ['u1'],
        link_user_data: [],
      },
    ])
  ),
}));

const mxcadManagerMock = vi.hoisted(() => ({
  isReady: vi.fn(() => true),
  isCreated: vi.fn(() => true),
  showMxCAD: vi.fn(),
  getCurrentFileName: vi.fn(() => 'empty_template.mxweb'),
  openFile: vi.fn(async () => {}),
  reloadCurrentFile: vi.fn(async () => {}),
  adjustContainerPosition: vi.fn(),
}));

const { showGlobalLoadingMock, hideGlobalLoadingMock, globalShowToastMock } =
  vi.hoisted(() => ({
    showGlobalLoadingMock: vi.fn(),
    hideGlobalLoadingMock: vi.fn(),
    globalShowToastMock: vi.fn(),
  }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: userMock, isAuthenticated: true }),
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/loadingService', () => ({
  showGlobalLoading: showGlobalLoadingMock,
  hideGlobalLoading: hideGlobalLoadingMock,
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: globalShowToastMock,
}));
vi.mock('@/services/drawingSession', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/drawingSession')>();
  return { ...actual };
});
vi.mock('../services/mxcadManager', () => ({
  mxcadManager: mxcadManagerMock,
  setPersonalSpaceId: vi.fn(),
  setOpenedBackInfo: vi.fn(),
  refreshFileName: vi.fn(),
  getCooperate: vi.fn(() => cooperateMock),
  exitCollaboration: vi.fn(async () => ({
    exited: true,
    wasPending: false,
  })),
  exitCurrentCollaboration: vi.fn(),
  checkAndConfirmUnsavedChanges: vi.fn(async () => true),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      fetchQuery: vi.fn(async () => []),
      getQueryData: vi.fn(() => null),
    }),
  };
});
vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode: vi.fn(async () => ({ data: null })),
  projectControllerGetProjects: vi.fn(async () => ({ data: { nodes: [] } })),
}));

function resetStore(): void {
  useCADEditorStore.setState({
    isActive: true,
    loading: true,
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
  clearDrawingSessionListeners();
  vi.clearAllMocks();
  mxcadManagerMock.getCurrentFileName.mockReturnValue('empty_template.mxweb');
  mxcadManagerMock.openFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

/** 复刻 CADEditorDirect 真实挂载链：路由级 auto-join + 协同面板 */
function CollabHarness({ onFileLoaded }: { onFileLoaded: () => void }) {
  useCollabAutoJoin(onFileLoaded);
  return <CollaborateSidebar visible={true} />;
}

describe('协同链接 auto-join 端到端（真实挂载链）', () => {
  it('auto-join joinWork → 协同加入 → fromShare 解除 → works 拉取 → 图纸名补齐', async () => {
    const onFileLoaded = vi.fn();
    render(<CollabHarness onFileLoaded={onFileLoaded} />);

    // 意图出现即弹 loading（覆盖引擎初始化间隙）
    expect(showGlobalLoadingMock).toHaveBeenCalledWith(
      expect.any(String),
      'autoJoin'
    );

    // 500ms 首试（isReady true）+ join 回调 + onFileLoaded 另 500ms + 面板 fetchWorks/对账
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    // 核心断言：auto-join 调用了 joinWork（面板门禁不再吞意图）
    expect(cooperateMock.joinWork).toHaveBeenCalledWith(
      3,
      expect.any(Function),
      'u1',
      expect.any(String)
    );
    // 协同已加入
    expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
    expect(useCADEditorStore.getState().collaborationWorkId).toBe(3);
    // 分享模式解除：fromShare=false（恢复面板轮询/刷新）
    expect(useCADEditorStore.getState().fromShare).toBe(false);
    // 面板对账：pendingJoinWorkId 已清（work_data.drawingName 补齐 currentFileName）
    expect(useCADEditorStore.getState().pendingJoinWorkId).toBeNull();
    expect(useCADEditorStore.getState().currentFileName).toBe('空白图纸.dwg');
    // 骨架屏关闭信号
    expect(onFileLoaded).toHaveBeenCalled();
  });
});
