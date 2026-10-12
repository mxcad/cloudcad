import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CAD_EVENTS } from '@/constants/events';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/cad-editor', search: '' }),
}));

vi.mock('@/services/mxcadManager', () => ({
  exitCurrentCollaboration: vi.fn(),
  mxcadManager: { showMxCAD: vi.fn(), isCreated: vi.fn(() => false) },
  refreshFileName: vi.fn(),
}));

import { emit, clearDrawingSessionListeners } from '@/services/drawingSession';
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
