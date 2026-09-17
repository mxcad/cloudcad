/**
 * CADEditorDirect — fileUrl 外部参照打开路径的 OPEN_COMPLETE 订阅生命周期
 *
 * 回归目标（code-review 发现）：openExternalRef 的 3s 超时兜底路径不取消
 * OPEN_COMPLETE 订阅（超时后泄漏），且组件卸载时不清订阅。本 spec 锁定
 * 「超时后订阅被清理」与「卸载后订阅被清理」两个行为。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { CAD_EVENTS } from '@/constants/events';
import { clearDrawingSessionListeners } from '@/services/drawingSession';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CADEditorDirect } from './CADEditorDirect';

const { subscriptions } = vi.hoisted(() => ({
  subscriptions: [] as boolean[],
}));

const { mxcadManagerMock } = vi.hoisted(() => ({
  mxcadManagerMock: {
    isReady: vi.fn(() => true),
    getCurrentFileName: vi.fn(() => 'empty_template.mxweb'),
    openFile: vi.fn(async () => {}),
    reloadCurrentFile: vi.fn(async () => {}),
  },
}));

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({ isAuthenticated: true, user: null })),
}));

const { useFileRouteParserMock } = vi.hoisted(() => ({
  useFileRouteParserMock: vi.fn(() => ({
    fileId: null,
    isHomeMode: false,
    libraryKey: null,
    shareToken: null,
    collabWorkId: null,
    collabDrawingId: null,
    collabProjectId: null,
    shareFileName: null,
    versionParam: null,
    nodeIdParam: null,
    urlProjectId: '',
  })),
}));

const { useFileOpenGuardMock } = vi.hoisted(() => ({
  useFileOpenGuardMock: {
    setShowLoginPrompt: vi.fn(),
    setLoginPromptAction: vi.fn(),
  },
}));

vi.mock('@/services/drawingSession', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/drawingSession')>();
  return {
    ...actual,
    subscribe: vi.fn((event: never, handler: never) => {
      const unsub = actual.subscribe(event, handler);
      const idx = subscriptions.length;
      subscriptions.push(false);
      return () => {
        subscriptions[idx] = true;
        unsub();
      };
    }),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: useAuthMock,
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => false }),
}));
vi.mock('@/hooks/usePersonalSpaceQuery', () => ({
  usePersonalSpaceQuery: () => ({ data: { id: null } }),
}));
vi.mock('@/hooks/useFileRouteParser', () => ({
  useFileRouteParser: useFileRouteParserMock,
  useHistoryBackFix: vi.fn(),
}));
vi.mock('@/hooks/useCadFileLoader', () => ({ useCadFileLoader: vi.fn() }));
vi.mock('@/hooks/useFileOpenGuard', () => ({
  useFileOpenGuard: vi.fn(() => ({
    isActive: true,
    showLoginPrompt: false,
    loginPromptAction: null,
    handleLoginClick: vi.fn(),
    handleLoginPromptClose: vi.fn(),
    loginPromptDismissedRef: { current: false },
    setShowLoginPrompt: useFileOpenGuardMock.setShowLoginPrompt,
    setLoginPromptAction: useFileOpenGuardMock.setLoginPromptAction,
  })),
}));
vi.mock('@/hooks/useCadPermissions', () => ({
  useCadPermissions: vi.fn(() => ({
    canSave: false,
    canExport: false,
    canManageExternalRef: false,
  })),
}));
vi.mock('@/hooks/useExternalRefCompletion', () => ({
  useExternalRefCompletion: vi.fn(),
}));
vi.mock('@/hooks/useCollabShare', () => ({ useCollabShare: vi.fn() }));
vi.mock('@/hooks/useFileInsert', () => ({
  useFileInsert: vi.fn(() => ({ handleInsertFile: vi.fn() })),
}));
vi.mock('@/hooks/useHomeInit', () => ({ useHomeInit: vi.fn() }));
vi.mock('@/hooks/useExternalReferenceUpload', () => ({
  useExternalReferenceUpload: vi.fn(() => ({
    isOpen: false,
    files: [],
    loading: false,
    selectAndUploadFiles: vi.fn(),
    replaceFile: vi.fn(),
    refresh: vi.fn(),
    complete: vi.fn(),
    skip: vi.fn(),
  })),
}));
vi.mock('@/hooks/useFileDropToOpen', () => ({
  useFileDropToOpen: () => ({ isDragOver: false }),
}));
vi.mock('@/components/export', () => ({
  ExportModals: React.forwardRef(() => null),
}));
vi.mock('@/components/modals/ImagePreviewModal', () => ({
  ImagePreviewModal: () => null,
}));
vi.mock('@/components/modals/ExternalReferencePanel', () => ({
  ExternalReferencePanel: () => null,
}));
vi.mock('@/components/sidebar/SidebarContainer', () => ({
  SidebarContainer: () => null,
}));
vi.mock('@/components/auth/LoginPrompt', () => ({ LoginPrompt: () => null }));
vi.mock('@/components/drop-indicator/DropIndicator', () => ({
  DropIndicator: () => null,
}));
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));
vi.mock('@voerkai18n/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@voerkai18n/react')>();
  return {
    ...actual,
    useVoerkaI18n: () => ({ activeLanguage: 'zh-CN' }),
  };
});
vi.mock('mxcad-app', () => ({
  mxcadApp: { i18nScope: { on: vi.fn(), off: vi.fn() } },
}));
vi.mock('../services/mxcadManager', () => ({
  mxcadManager: mxcadManagerMock,
  setPersonalSpaceId: vi.fn(),
  setOpenedBackInfo: vi.fn(),
  refreshFileName: vi.fn(),
}));

const EXTERNAL_REF_URL = '/api/v1/mxcad/external-ref-view/node-1/a.mxweb';

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

beforeEach(() => {
  resetStore();
  clearDrawingSessionListeners();
  subscriptions.length = 0;
  vi.clearAllMocks();
  mxcadManagerMock.getCurrentFileName.mockReturnValue('empty_template.mxweb');
  mxcadManagerMock.openFile.mockResolvedValue(undefined);
  useAuthMock.mockImplementation(() => ({
    isAuthenticated: true,
    user: null,
  }));
  useFileRouteParserMock.mockImplementation(() => ({
    fileId: null,
    isHomeMode: false,
    libraryKey: null,
    shareToken: null,
    collabWorkId: null,
    collabDrawingId: null,
    collabProjectId: null,
    shareFileName: null,
    versionParam: null,
    nodeIdParam: null,
    urlProjectId: '',
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CADEditorDirect — fileUrl 外部参照 3s 超时路径', () => {
  function renderWithFileUrl() {
    window.history.replaceState(
      {},
      '',
      `/?fileUrl=${encodeURIComponent(EXTERNAL_REF_URL)}`
    );
    return render(
      <MemoryRouter>
        <NotificationProvider>
          <CADEditorDirect />
        </NotificationProvider>
      </MemoryRouter>
    );
  }

  it('3s 超时兜底后仍调用 openFile，并清理 OPEN_COMPLETE 订阅', async () => {
    vi.useFakeTimers();
    renderWithFileUrl();
    // 冲刷动态 import 与 effect 微任务，等待订阅建立
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mxcadManagerMock.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: EXTERNAL_REF_URL })
    );
    // 超时路径必须取消订阅（修复前该订阅泄漏）
    expect(subscriptions.some((cleaned) => cleaned)).toBe(true);
  });

  it('OPEN_COMPLETE 事件提前到达时不等待 3s 超时', async () => {
    vi.useFakeTimers();
    const { emit } = await import('@/services/drawingSession');
    renderWithFileUrl();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      emit(CAD_EVENTS.OPEN_COMPLETE, { fileId: 'node-1', fileName: 'a.mxweb' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mxcadManagerMock.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: EXTERNAL_REF_URL })
    );
  });

  it('等待期间卸载组件时清理 OPEN_COMPLETE 订阅', async () => {
    vi.useFakeTimers();
    const { unmount } = renderWithFileUrl();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 此时应已建立订阅（openExternalRef 等待订阅 + loading 兜底订阅）
    expect(subscriptions.length).toBeGreaterThanOrEqual(1);
    act(() => {
      unmount();
    });
    // 修复前 openExternalRef 的订阅在卸载时泄漏（未标记清理）
    expect(subscriptions.every((cleaned) => cleaned)).toBe(true);
  });
});

describe('CADEditorDirect — 协同链接未登录（游客）场景', () => {
  it('游客访问协同链接时弹出登录提示，未登录不能加入协同', async () => {
    // 游客：未认证
    useAuthMock.mockImplementation(() => ({
      isAuthenticated: false,
      user: null,
    }));
    // 协同链接 URL：?collabWorkId=9
    useFileRouteParserMock.mockImplementation(() => ({
      fileId: null,
      isHomeMode: false,
      libraryKey: null,
      shareToken: null,
      collabWorkId: '9',
      collabDrawingId: null,
      collabProjectId: null,
      shareFileName: null,
      versionParam: null,
      nodeIdParam: null,
      urlProjectId: '',
    }));

    render(
      <MemoryRouter>
        <NotificationProvider>
          <CADEditorDirect />
        </NotificationProvider>
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
    });

    // 触发登录提示：设置动作文案 + 弹出提示（游客不能加入协同）
    expect(useFileOpenGuardMock.setLoginPromptAction).toHaveBeenCalledWith(
      '加入协同'
    );
    expect(useFileOpenGuardMock.setShowLoginPrompt).toHaveBeenCalledWith(true);
  });

  it('已登录用户访问协同链接时不弹登录提示', async () => {
    // 已登录（默认 beforeEach 即 isAuthenticated: true）
    useFileRouteParserMock.mockImplementation(() => ({
      fileId: null,
      isHomeMode: false,
      libraryKey: null,
      shareToken: null,
      collabWorkId: '9',
      collabDrawingId: null,
      collabProjectId: null,
      shareFileName: null,
      versionParam: null,
      nodeIdParam: null,
      urlProjectId: '',
    }));

    render(
      <MemoryRouter>
        <NotificationProvider>
          <CADEditorDirect />
        </NotificationProvider>
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(useFileOpenGuardMock.setShowLoginPrompt).not.toHaveBeenCalled();
  });
});
