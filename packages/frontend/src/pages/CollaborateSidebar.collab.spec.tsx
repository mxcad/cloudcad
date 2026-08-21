/**
 * CollaborateSidebar — 协同链接 auto-join 端到端回归
 *
 * 场景：URL 带 collabWorkId，已登录用户打开协同面板（visible=true）
 * 预期：auto-join 自动 joinWork → 协同加入 → fromShare 解除 → 图纸状态补齐
 * 历史 bug：fromShare 阻断 fetchWorks 致 currentFileId 永不补齐；骨架屏卡死
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { clearDrawingSessionListeners, patchSessionFlags } from '@/services/drawingSession';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CollaborateSidebar } from '../components/CollaborateSidebar';

const userMock = { id: 'u1', username: 'tester', avatar: null };

const cooperateMock = vi.hoisted(() => ({
  joinWork: vi.fn(
    (_workId: number, cb: (ret: number) => void) => cb(0)
  ),
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: userMock, isAuthenticated: true }),
}));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/drawingSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/drawingSession')>();
  return { ...actual };
});
vi.mock('../services/mxcadManager', () => ({
  mxcadManager: mxcadManagerMock,
  setPersonalSpaceId: vi.fn(),
  setOpenedBackInfo: vi.fn(),
  refreshFileName: vi.fn(),
  getCooperate: vi.fn(() => cooperateMock),
  exitCurrentCollaboration: vi.fn(),
  checkAndConfirmUnsavedChanges: vi.fn(async () => true),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ fetchQuery: vi.fn(async () => []), getQueryData: vi.fn(() => null) }),
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

describe('CollaborateSidebar — 协同链接 auto-join 端到端', () => {
  it('auto-join 自动 joinWork → 协同加入 → fromShare 解除 → 图纸名补齐', async () => {
    const onFileLoaded = vi.fn();
    render(<CollaborateSidebar visible={true} onFileLoaded={onFileLoaded} />);

    // 引擎已就绪（isReady true）+ 500ms 延时后 tryJoin
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    // 核心断言：auto-join 调用了 joinWork
    expect(cooperateMock.joinWork).toHaveBeenCalledWith(
      3,
      expect.any(Function),
      'u1',
      expect.any(String)
    );
    // 协同已加入
    expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
    expect(useCADEditorStore.getState().collaborationWorkId).toBe(3);
    // 分享模式解除：fromShare=false
    expect(useCADEditorStore.getState().fromShare).toBe(false);
    // 图纸名已补齐（pendingJoinWorkIdRef effect 从 work_data.drawingName 恢复）
    expect(useCADEditorStore.getState().currentFileName).toBe('空白图纸.dwg');
    // 骨架屏关闭信号（onFileLoaded 500ms 后触发）
    expect(onFileLoaded).toHaveBeenCalled();
  });
});