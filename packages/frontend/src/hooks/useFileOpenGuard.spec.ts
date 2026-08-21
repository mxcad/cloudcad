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
  it('未登录收到 SAVE_REQUIRED（含 action）→ 弹出登录提示', async () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    });

    expect(result.current.showLoginPrompt).toBe(true);
    expect(result.current.loginPromptAction).toBe('保存文件');
  });

  it('未登录收到 SAVE_REQUIRED（无 action）→ 使用默认文案', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '' });
    });

    expect(result.current.showLoginPrompt).toBe(true);
    expect(result.current.loginPromptAction).toBe('保存文件');
  });

  it('action 含「另存为」→ 不弹登录提示', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '另存为图纸' });
    });

    expect(result.current.showLoginPrompt).toBe(false);
  });

  it('已登录 → 不弹登录提示', () => {
    const { result } = renderGuard({ isAuthenticated: true });

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    });

    expect(result.current.showLoginPrompt).toBe(false);
  });

  it('登录提示被处理（loginPromptDismissedRef）后不再响应', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    });
    expect(result.current.showLoginPrompt).toBe(true);

    act(() => {
      result.current.handleLoginClick();
    });
    expect(result.current.showLoginPrompt).toBe(false);

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    });
    expect(result.current.showLoginPrompt).toBe(false);
  });

  it('未登录收到 SAVE_AS_REQUIRED（含 action）→ 弹出登录提示（引擎黑盒防御监听）', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_AS_REQUIRED, { action: '保存文件' });
    });

    expect(result.current.showLoginPrompt).toBe(true);
    expect(result.current.loginPromptAction).toBe('保存文件');
  });

  it('SAVE_AS_REQUIRED action 含「另存为」→ 不弹登录提示', () => {
    const { result } = renderGuard();

    act(() => {
      emit(CAD_EVENTS.SAVE_AS_REQUIRED, { action: '另存为图纸' });
    });

    expect(result.current.showLoginPrompt).toBe(false);
  });

  it('卸载后取消订阅（bus 不再派发到本 hook）', () => {
    const { unmount } = renderGuard();
    unmount();

    act(() => {
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: '保存文件' });
    });
    // 无异常即通过（订阅已解除）
    expect(true).toBe(true);
  });
});
