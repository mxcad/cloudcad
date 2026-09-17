import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { OpenFileInfo } from '../services/drawingSession';

vi.mock('../services/mxcadManager', () => ({
  mxcadManager: {
    isReady: vi.fn(() => false),
    hasPendingOpen: vi.fn(() => false),
  },
}));

vi.mock('../services/drawingSession', () => ({
  useDrawingSession: vi.fn(),
}));

import { mxcadManager } from '../services/mxcadManager';
import { useDrawingSession } from '../services/drawingSession';
import { useSidebarContentReady } from './useSidebarContentReady';

const mockedManager = vi.mocked(mxcadManager);
const mockedSession = vi.mocked(useDrawingSession);

const EMPTY_SESSION = {
  fileId: null,
  fileName: null,
  isModified: false,
  fileInfo: null,
};

const OPENED_FILE_INFO: OpenFileInfo = {
  fileId: 'file-1',
  parentId: 'parent-1',
  projectId: 'proj-1',
  name: 'drawing.mxweb',
};

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
  mockedManager.isReady.mockReturnValue(false);
  mockedManager.hasPendingOpen.mockReturnValue(false);
  mockedSession.mockReturnValue(EMPTY_SESSION);
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

  it('engine ready but never had pending open -> not ready (two-phase first open)', async () => {
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(false);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);
  });

  it('engine ready + pending open -> not ready', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);
  });

  it('pending open started then finished -> ready', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    mockedManager.hasPendingOpen.mockReturnValue(false);
    await tick();
    expect(result.current).toBe(true);
  });

  it('fileInfo set (open success) -> ready', async () => {
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    mockedSession.mockReturnValue({
      ...EMPTY_SESSION,
      fileInfo: OPENED_FILE_INFO,
    });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(true);
  });

  it('error set (open failed) -> ready, keep drawer usable', async () => {
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result } = renderReady({ error: 'open failed' });
    await settle();
    expect(result.current).toBe(true);
  });

  it('never had pending open -> 15s fallback ready', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(false);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    await tick(15_001);
    expect(result.current).toBe(true);
  });

  it('never had pending open but under 15s -> not ready', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(false);
    const { result } = renderReady();
    await settle();

    await tick(14_900);
    expect(result.current).toBe(false);
  });

  it('open stalled with no terminal state -> 30s fault fallback ready', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(false);

    await tick(20_000);
    expect(result.current).toBe(false);

    await tick(10_000);
    expect(result.current).toBe(true);
  });

  it('open still pending under 30s -> not preempted', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result } = renderReady();
    await settle();

    await tick(29_900);
    expect(result.current).toBe(false);
  });

  it('stops polling after ready', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    mockedSession.mockReturnValue({
      ...EMPTY_SESSION,
      fileInfo: OPENED_FILE_INFO,
    });
    const { result } = renderReady();
    await settle();
    expect(result.current).toBe(true);

    const probesAfterReady = mockedManager.isReady.mock.calls.length;
    await tick(1000);
    expect(mockedManager.isReady.mock.calls.length).toBe(probesAfterReady);
  });

  it('leaving CAD route resets and immediately releases', async () => {
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result, rerender } = renderHook(
      (props) => useSidebarContentReady({ ...baseOptions, ...props }),
      { initialProps: {} }
    );
    await settle();
    expect(result.current).toBe(false);

    rerender({ isActive: false });
    expect(result.current).toBe(true);
  });

  it('re-entering CAD route re-gates (everHadPendingOpen resets)', async () => {
    vi.useFakeTimers();
    mockedManager.isReady.mockReturnValue(true);
    mockedManager.hasPendingOpen.mockReturnValue(true);
    const { result, rerender } = renderHook(
      (props) => useSidebarContentReady({ ...baseOptions, ...props }),
      { initialProps: {} }
    );
    await settle();
    expect(result.current).toBe(false);

    mockedManager.hasPendingOpen.mockReturnValue(false);
    await tick();
    expect(result.current).toBe(true);

    rerender({ isActive: false });
    mockedManager.hasPendingOpen.mockReturnValue(true);
    await tick();
    rerender({ isActive: true });
    await settle();
    expect(result.current).toBe(false);
  });
});
