import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/mxcadManager', () => ({
  mxcadManager: {
    isReady: vi.fn(() => false),
    getOpenState: vi.fn(() => ({ inFlight: 0, settled: 0 })),
  },
}));

import { mxcadManager } from '../services/mxcadManager';
import { useSidebarContentReady } from './useSidebarContentReady';

const mockedManager = vi.mocked(mxcadManager);

const baseOptions = {
  isActive: true,
  isHomeMode: false,
  isCollabLink: false,
  error: null,
};

function renderReady(overrides: Partial<typeof baseOptions> = {}) {
  return renderHook(() =>
    useSidebarContentReady({ ...baseOptions, ...overrides })
  );
}

/** 设置打开生命周期状态（inFlight = 在途打开数，settled = 已回报 openFileComplete 数） */
function setOpenState(state: { inFlight?: number; settled?: number } = {}) {
  mockedManager.getOpenState.mockReturnValue({
    inFlight: 0,
    settled: 0,
    ...state,
  });
}

/** 让 effect 内的动态 import + async probe 与 React state 更新落地 */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

/** 推进轮询间隔，触发下一次 probe */
async function tick(ms = 200) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockedManager.isReady.mockReturnValue(false);
  setOpenState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSidebarContentReady - gate', () => {
  it('!isActive -> ready and no polling', async () => {
    const { result } = renderReady({ isActive: false });
    expect(result.current).toBe(true);
    await settle();
    expect(mockedManager.isReady).not.toHaveBeenCalled();
  });

  it('engine not ready -> not ready', async () => {
    const { result } = renderReady();
    await settle();
    expect(mockedManager.isReady).toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('home mode + engine ready -> ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    const { result } = renderReady({ isHomeMode: true });
    await settle();
    expect(result.current).toBe(true);
  });

  it('collab link + engine ready -> ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    const { result } = renderReady({ isCollabLink: true });
    await settle();
    expect(result.current).toBe(true);
  });

  it('engine ready but nothing opened yet -> not ready (two-phase first open gap)', async () => {
    mockedManager.isReady.mockReturnValue(true);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);
  });

  it('open in flight -> not ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ inFlight: 1 });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);
  });

  it('open dispatched then settled -> ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ inFlight: 1 });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    // openFileComplete 到达：settled 累加、inFlight 归零
    setOpenState({ settled: 1 });
    await tick();
    expect(result.current).toBe(true);
  });

  it('in flight open not preempted by an older settled open', async () => {
    mockedManager.isReady.mockReturnValue(true);
    // 上一次打开已终态，但下一次打开已派发：必须继续等
    setOpenState({ inFlight: 1, settled: 1 });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    setOpenState({ inFlight: 0, settled: 2 });
    await tick();
    expect(result.current).toBe(true);
  });

  it('engine-internal / collab load (settled without ever seeing inFlight) -> ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    // 协同 auto-join / 引擎内部 __openWebFile__ 绕开 openFile：inFlight 恒 0，
    // 只有 openFileComplete 回报。这是「图纸已加载但侧边栏干等兜底」的回归用例。
    setOpenState({ settled: 1 });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(true);
  });

  it('error set (open failed) -> ready, keep drawer usable', async () => {
    mockedManager.isReady.mockReturnValue(true);
    const { result } = renderReady({ error: 'open failed' });
    await settle();
    expect(result.current).toBe(true);
  });

  it('never had open -> 5s fallback ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    await tick(5_001);
    expect(result.current).toBe(true);
  });

  it('never had open but under 5s -> not ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    const { result } = renderReady();
    await settle();

    await tick(4_900);
    expect(result.current).toBe(false);
  });

  it('open stalled with no terminal state -> 10s fault fallback ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ inFlight: 1 });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    await tick(7_000);
    expect(result.current).toBe(false);

    await tick(3_001);
    expect(result.current).toBe(true);
  });

  it('open still in flight under 10s -> not preempted', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ inFlight: 1 });
    const { result } = renderReady();
    await settle();

    await tick(9_900);
    expect(result.current).toBe(false);
  });

  it('stops polling after ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ settled: 1 });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(true);

    const probesAfterReady = mockedManager.isReady.mock.calls.length;
    await tick(1000);
    expect(mockedManager.isReady.mock.calls.length).toBe(probesAfterReady);
  });

  it('leaving CAD route resets and immediately releases', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ inFlight: 1 });
    const { result, rerender } = renderHook(
      (props) => useSidebarContentReady({ ...baseOptions, ...props }),
      { initialProps: {} }
    );
    await settle();
    expect(result.current).toBe(false);

    rerender({ isActive: false });
    expect(result.current).toBe(true);
  });

  it('re-entering CAD route re-gates (everHadOpen resets)', async () => {
    mockedManager.isReady.mockReturnValue(true);
    setOpenState({ settled: 1 });
    const { result, rerender } = renderHook(
      (props) => useSidebarContentReady({ ...baseOptions, ...props }),
      { initialProps: {} }
    );
    await settle();
    expect(result.current).toBe(true);

    rerender({ isActive: false });
    setOpenState({ inFlight: 1 });
    await tick();
    rerender({ isActive: true });
    await settle();
    expect(result.current).toBe(false);
  });
});
