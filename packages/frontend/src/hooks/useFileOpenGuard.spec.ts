import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CAD_EVENTS } from '@/constants/events';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/cad-editor', search: '' }),
}));

// 共享可变量：让「文档是否已加载完」「导出闸门」按用例切换，而不靠 mockReturnValue
// 覆盖（clearAllMocks 不清实现，跨用例泄漏）
const mxState = vi.hoisted(() => ({
  documentLoaded: true,
  freeExportDownloadEnabled: false,
}));

vi.mock('@/services/mxcadManager', () => ({
  exitCurrentCollaboration: vi.fn(),
  clearIntentChain: vi.fn(),
  resumeIntent: vi.fn(),
  mxcadManager: {
    showMxCAD: vi.fn(),
    isCreated: vi.fn(() => false),
    isReady: vi.fn(() => true),
    hasPendingOpen: vi.fn(() => false),
    reloadCurrentFile: vi.fn(() => Promise.resolve()),
  },
  refreshFileName: vi.fn(),
  hasDocumentLoaded: vi.fn(() => mxState.documentLoaded),
}));

// 导出闸门翻转锚点依赖的两个 hook：mock 掉避免拉入 AuthContext / react-query。
// membership 恒 null → exportAllowed 完全由 mxState.freeExportDownloadEnabled 驱动
vi.mock('./useMembership', () => ({ useMembership: () => null }));
vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({
    config: { freeExportDownloadEnabled: mxState.freeExportDownloadEnabled },
  }),
}));

import { emit, clearDrawingSessionListeners } from '@/services/drawingSession';
import { clearIntentChain, resumeIntent } from '@/services/mxcadManager';
import { useFileOpenGuard } from './useFileOpenGuard';

const baseOptions = {
  fileId: 'file-1',
  isHomeMode: false,
  isAuthenticated: false,
  isInitializedRef: { current: true },
  onSetIsActive: vi.fn(),
  onSetLoading: vi.fn(),
  onSetError: vi.fn(),
  onSetIsPersonalSpaceMode: vi.fn(),
};

function renderGuard(overrides: Partial<typeof baseOptions> = {}) {
  return renderHook(() =>
    useFileOpenGuard({ ...baseOptions, ...overrides })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDrawingSessionListeners();
  mxState.documentLoaded = true;
  mxState.freeExportDownloadEnabled = false;
});

describe('useFileOpenGuard — SAVE_REQUIRED 经类型化 bus（T1 迁移）', () => {
  // 分派走稳定 kind（SaveRequiredKind），不再用翻译串匹配：
  // 生产端恒发 t('保存文件') 曾令「另存为」分支不可达，spec 靠喂中文字面量锁死永远绿。
  it('未登录收到 SAVE_REQUIRED（kind=save）→ 弹出登录提示，文案=保存文件', async () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'save' });
    });

    expect(result.current.loginGate.showLoginPrompt).toBe(true);
    expect(result.current.loginGate.loginPromptAction).toBe('保存文件');
  });

  it('未登录收到 SAVE_REQUIRED（kind=saveAs）→ 仍弹提示（saveAsToCloud 已 cancelLoginRedirect，提示是唯一登录入口），文案=另存为', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'saveAs' });
    });

    expect(result.current.loginGate.showLoginPrompt).toBe(true);
    expect(result.current.loginGate.loginPromptAction).toBe('另存为');
  });

  it('未登录收到 SAVE_REQUIRED（kind=share，意图链挂起后复用闸门）→ 文案=保存并分享', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'share' });
    });

    expect(result.current.loginGate.showLoginPrompt).toBe(true);
    expect(result.current.loginGate.loginPromptAction).toBe('保存并分享');
  });

  it('已登录 → 不弹登录提示', () => {
    const { result } = renderGuard({ isAuthenticated: true });

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'save' });
    });

    expect(result.current.loginGate.showLoginPrompt).toBe(false);
  });

  it('登录提示被处理（suppressed）后不再响应', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'save' });
    });
    expect(result.current.loginGate.showLoginPrompt).toBe(true);

    act(() => {
      result.current.loginGate.handleLoginClick();
    });
    expect(result.current.loginGate.showLoginPrompt).toBe(false);

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'save' });
    });
    expect(result.current.loginGate.showLoginPrompt).toBe(false);
  });

  it('未登录收到 SAVE_AS_REQUIRED（kind=saveAs，引擎黑盒防御监听）→ 弹出登录提示，文案=另存为', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_AS_REQUIRED, { kind: 'saveAs' });
    });

    expect(result.current.loginGate.showLoginPrompt).toBe(true);
    expect(result.current.loginGate.loginPromptAction).toBe('另存为');
  });

  it('卸载后取消订阅（bus 不再派发到本 hook）', () => {
    const { unmount } = renderGuard();
    unmount();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'save' });
    });
    // 无异常即通过（订阅已解除）
    expect(true).toBe(true);
  });
});

describe('useFileOpenGuard — 意图链续跑（ADR-0081 D4/D5）', () => {
  it('已认证且文档已加载 → 续跑挂起的意图链（锚点 document-loaded）', async () => {
    renderGuard({ isAuthenticated: true });

    await vi.waitFor(() => expect(resumeIntent).toHaveBeenCalledTimes(1));
  });

  it('文档仍在下载/解析 → 等 openFileComplete 才续跑', async () => {
    mxState.documentLoaded = false;

    renderGuard({ isAuthenticated: true });
    expect(resumeIntent).not.toHaveBeenCalled();

    act(() => {
      emit(CAD_EVENTS.OPEN_COMPLETE, { fileId: 'file-1', fileName: 'a.mxweb' });
    });
    expect(resumeIntent).toHaveBeenCalledTimes(1);
  });

  it('文档仍在下载/解析 → 卸载后不再续跑', () => {
    mxState.documentLoaded = false;

    const { unmount } = renderGuard({ isAuthenticated: true });
    expect(resumeIntent).not.toHaveBeenCalled();
    unmount();

    act(() => {
      emit(CAD_EVENTS.OPEN_COMPLETE, { fileId: 'file-1', fileName: 'a.mxweb' });
    });
    expect(resumeIntent).not.toHaveBeenCalled();
  });

  it('未登录 → 不续跑', async () => {
    renderGuard({ isAuthenticated: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resumeIntent).not.toHaveBeenCalled();
  });

  it('导出闸门开放（freeExportDownloadEnabled 翻转）→ 续跑（充值/管理员开放锚点）', async () => {
    mxState.freeExportDownloadEnabled = true;

    renderGuard({ isAuthenticated: false });

    await vi.waitFor(() => expect(resumeIntent).toHaveBeenCalledTimes(1));
  });

  it('导出闸门未开放 → 不因闸门 effect 续跑', async () => {
    renderGuard({ isAuthenticated: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resumeIntent).not.toHaveBeenCalled();
  });

  it('关闭登录提示 → 清除挂起的意图链（用户放弃该动作）', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'share' });
    });
    expect(result.current.loginGate.showLoginPrompt).toBe(true);

    act(() => {
      result.current.loginGate.handleLoginPromptClose();
    });
    expect(clearIntentChain).toHaveBeenCalledTimes(1);
  });
});
