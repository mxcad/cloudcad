/**
 * mxcadCollaboration — 协同退出状态机（C5）
 *
 * 回归目标：
 * - idle 短路：不调 exitWork
 * - joined：exitWork + 状态收尾 + exitGuard 置位（3s 窗）
 * - joining：等 in-flight join 落定再决策（落定 joined → 继续退出；
 *   落定 idle → 不退出；超时兜底仍尝试退出）
 * - confirm 弹窗路径：idle 不弹窗；取消不退出
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  MxCppMock,
  cooperateMock,
  globalShowConfirmMock,
  refreshFileNameMock,
} = vi.hoisted(() => ({
  MxCppMock: { getCurrentMxCAD: vi.fn() },
  cooperateMock: {
    init: vi.fn(),
    exitWork: vi.fn(() => 0),
  },
  globalShowConfirmMock: vi.fn(),
  refreshFileNameMock: vi.fn(),
}));

vi.mock('mxcad', () => ({ MxCpp: MxCppMock }));
vi.mock('@/languages', () => ({ t: (key: string) => key }));
vi.mock('@/constants/appConfig', () => ({
  APP_COOPERATE_URL: '/api/cooperate',
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowConfirm: globalShowConfirmMock,
  globalShowThreeButtonConfirm: vi.fn(),
}));
vi.mock('../../drawingSession', () => ({
  getModified: vi.fn(() => false),
  setModified: vi.fn(),
}));
vi.mock('../mxcadHelpers', () => ({
  refreshFileName: refreshFileNameMock,
}));

import {
  confirmExitCollaborationIfNeeded,
  exitCollaboration,
  exitCurrentCollaboration,
} from '../mxcadCollaboration';
import { useCADEditorStore } from '@/stores/useCADEditorStore';

function resetStore(overrides: Record<string, unknown> = {}): void {
  useCADEditorStore.setState({
    isInCollaboration: false,
    collaborationWorkId: null,
    collabPhase: 'idle',
    collabExitGuard: false,
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetStore();
  MxCppMock.getCurrentMxCAD.mockReturnValue({
    getCooperate: () => cooperateMock,
  });
  cooperateMock.exitWork.mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('exitCollaboration 状态机', () => {
  it('idle：短路，不调 exitWork', async () => {
    const result = await exitCollaboration();
    expect(result).toEqual({ exited: false, wasPending: false });
    expect(cooperateMock.exitWork).not.toHaveBeenCalled();
  });

  it('joined：exitWork 成功 → 清状态 + exitGuard 置位 + 刷新文件名', async () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });

    const result = await exitCollaboration();

    expect(result).toEqual({ exited: true, wasPending: false });
    expect(cooperateMock.exitWork).toHaveBeenCalledTimes(1);
    const store = useCADEditorStore.getState();
    expect(store.isInCollaboration).toBe(false);
    expect(store.collaborationWorkId).toBeNull();
    expect(store.collabPhase).toBe('idle');
    expect(store.collabExitGuard).toBe(true);
    expect(refreshFileNameMock).toHaveBeenCalled();
  });

  it('exitGuard 3s 窗后自动解除', async () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });
    await exitCollaboration();
    expect(useCADEditorStore.getState().collabExitGuard).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(useCADEditorStore.getState().collabExitGuard).toBe(false);
  });

  it('joined：exitWork 失败（ret≠0）→ 不清状态，返回错误码', async () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });
    cooperateMock.exitWork.mockReturnValue(-7);

    const result = await exitCollaboration();

    expect(result).toEqual({ exited: false, wasPending: false, exitCode: -7 });
    const store = useCADEditorStore.getState();
    expect(store.isInCollaboration).toBe(true);
    expect(store.collabPhase).toBe('joined');
    expect(store.collabExitGuard).toBe(false);
  });

  it('joining → 落定 joined：等回调后继续退出（wasPending）', async () => {
    resetStore({ collabPhase: 'joining' });
    const settle = setTimeout(() => {
      useCADEditorStore.setState({
        isInCollaboration: true,
        collaborationWorkId: 9,
        collabPhase: 'joined',
      });
    }, 100);

    // 命令在 joining 窗口内发起，随后引擎回调落定到 joined
    const pending = exitCollaboration();
    await vi.advanceTimersByTimeAsync(200);
    clearTimeout(settle);
    const result = await pending;

    expect(result).toEqual({ exited: true, wasPending: true });
    expect(cooperateMock.exitWork).toHaveBeenCalledTimes(1);
    expect(useCADEditorStore.getState().collabPhase).toBe('idle');
  });

  it('joining → 落定 idle：无需退出（wasPending）', async () => {
    resetStore({ collabPhase: 'joining' });
    const settle = setTimeout(() => {
      useCADEditorStore.setState({ collabPhase: 'idle' });
    }, 100);

    const pending = exitCollaboration();
    await vi.advanceTimersByTimeAsync(200);
    clearTimeout(settle);
    const result = await pending;

    expect(result).toEqual({ exited: false, wasPending: true });
    expect(cooperateMock.exitWork).not.toHaveBeenCalled();
  });

  it('joining → 超时兜底：引擎永不回调仍尝试退出', async () => {
    resetStore({ collabPhase: 'joining' });

    const pending = exitCollaboration();
    // 推进过 10s 轮询超时上限
    await vi.advanceTimersByTimeAsync(10_500);
    const result = await pending;

    // 超时后 phase 仍为 joining（非 idle）→ 尽力执行 exitWork
    expect(result.wasPending).toBe(true);
    expect(result.exited).toBe(true);
    expect(cooperateMock.exitWork).toHaveBeenCalledTimes(1);
  });
});

describe('exitCurrentCollaboration 同步尽力版', () => {
  it('idle → true，不调 exitWork', () => {
    expect(exitCurrentCollaboration()).toBe(true);
    expect(cooperateMock.exitWork).not.toHaveBeenCalled();
  });

  it('joined → 立即 exitWork 并收尾', () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });
    expect(exitCurrentCollaboration()).toBe(true);
    expect(cooperateMock.exitWork).toHaveBeenCalledTimes(1);
    expect(useCADEditorStore.getState().collabExitGuard).toBe(true);
  });

  it('cooperate 不可用 → false 不抛错', () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });
    MxCppMock.getCurrentMxCAD.mockReturnValue(null);
    expect(exitCurrentCollaboration()).toBe(false);
    expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
  });
});

describe('confirmExitCollaborationIfNeeded', () => {
  it('idle → 直接放行，不弹窗', async () => {
    await expect(confirmExitCollaborationIfNeeded()).resolves.toBe(true);
    expect(globalShowConfirmMock).not.toHaveBeenCalled();
    expect(cooperateMock.exitWork).not.toHaveBeenCalled();
  });

  it('joined + 用户取消 → false，不退出', async () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });
    globalShowConfirmMock.mockResolvedValue(false);

    await expect(confirmExitCollaborationIfNeeded()).resolves.toBe(false);
    expect(cooperateMock.exitWork).not.toHaveBeenCalled();
    expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
  });

  it('joined + 用户确认 → 走完整退出命令', async () => {
    resetStore({
      isInCollaboration: true,
      collaborationWorkId: 5,
      collabPhase: 'joined',
    });
    globalShowConfirmMock.mockResolvedValue(true);

    await expect(confirmExitCollaborationIfNeeded()).resolves.toBe(true);
    expect(cooperateMock.exitWork).toHaveBeenCalledTimes(1);
    expect(useCADEditorStore.getState().isInCollaboration).toBe(false);
  });
});
