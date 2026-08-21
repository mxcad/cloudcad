/**
 * useCollabActions — handleJoinWork OPEN_COMPLETE 订阅生命周期
 *
 * 回归目标（code-review 发现）：handleJoinWork 在错误分支 / catch 分支 /
 * safetyTimer 超时分支均未取消 OPEN_COMPLETE 订阅，导致订阅泄漏累积。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollabActions } from './useCollabActions';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { CAD_EVENTS } from '@/constants/events';
import { AUTO_JOIN_SAFETY_TIMEOUT, AUTO_JOIN_MAX_RETRIES } from '@/constants/timeouts';
import {
  emitOpenComplete,
  clearDrawingSessionListeners,
} from '../services/drawingSession';
import { getCooperate } from '../services/mxcadManager';

const { unsubscribeMock, cooperateMock } = vi.hoisted(() => ({
  unsubscribeMock: vi.fn(),
  cooperateMock: {
    joinWork: vi.fn(),
    createWork: vi.fn(),
    exitWork: vi.fn(),
  },
}));

vi.mock('../services/drawingSession', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/drawingSession')>();
  return {
    ...actual,
    // 注册真实 handler（成功分支仍走真实 bus 事件），但返回可控的 unsubscribe
    subscribe: vi.fn((event: unknown, handler: unknown) => {
      actual.subscribe(event as never, handler as never);
      return unsubscribeMock;
    }),
  };
});

vi.mock('../services/mxcadManager', () => ({
  mxcadManager: { isReady: vi.fn(() => true) },
  checkAndConfirmUnsavedChanges: vi.fn(async () => true),
  refreshFileName: vi.fn(),
  getCooperate: vi.fn(() => cooperateMock),
  exitCurrentCollaboration: vi.fn(),
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

const user = { id: 'u1', username: 'user1' };

function renderActions() {
  return renderHook(() =>
    useCollabActions(false, [], vi.fn(), null, vi.fn(), vi.fn(), user)
  );
}

beforeEach(() => {
  clearDrawingSessionListeners();
  unsubscribeMock.mockClear();
  cooperateMock.joinWork.mockReset();
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
});

describe('handleJoinWork — OPEN_COMPLETE 订阅清理', () => {
  it('joinWork 回调报错分支（iRet !== 0/17）取消订阅', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(18)
    );
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('joinWork 抛异常（catch 分支）取消订阅', async () => {
    cooperateMock.joinWork.mockImplementation(() => {
      throw new Error('joinWork boom');
    });
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('safetyTimer 超时（joinWork 永不回调）取消订阅', async () => {
    vi.useFakeTimers();
    try {
      cooperateMock.joinWork.mockImplementation(() => {
        /* joinWork 不回调 */
      });
      const { result } = renderActions();
      await act(async () => {
        await result.current.handleJoinWork(1);
      });
      expect(unsubscribeMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTO_JOIN_SAFETY_TIMEOUT + 1);
      });
      expect(unsubscribeMock).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('成功分支（iRet === 0）保留订阅，OPEN_COMPLETE 到达后取消', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(0)
    );
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(unsubscribeMock).not.toHaveBeenCalled();

    act(() => {
      emitOpenComplete({ fileId: 'file-1', fileName: 'drawing.dwg' });
    });
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});

describe('auto-join 协同链接加入 — 回归：fetchWorks 被 fromShare 阻断致 currentFileId 永不补齐', () => {
  it('joinWork 成功后以 force 强制拉取 works 并解除分享模式', async () => {
    const fetchWorksMock = vi.fn(async () => {});
    const setWorksMock = vi.fn();
    const setCurrentWorkIdMock = vi.fn();

    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(0)
    );

    useCADEditorStore.setState({
      fromShare: true,
      fromCollabShare: true,
      targetCollabWorkId: 1,
      collabShareLibraryKey: null,
    });

    vi.useFakeTimers();
    try {
      renderHook(() =>
        useCollabActions(
          true,
          [],
          setWorksMock,
          null,
          setCurrentWorkIdMock,
          fetchWorksMock,
          user
        )
      );
      // auto-join 的 tryJoin 有 500ms 延时
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      // 核心回归点：fromShare=true 时普通 fetchWorks 直接 return，
      // 必须强制拉取服务端 works，让 pendingJoinWorkIdRef effect 从
      // work_data.drawingId 补齐 currentFileId / currentFileName
      expect(fetchWorksMock).toHaveBeenCalledWith(false, true);
      // 加入成功后解除分享模式，恢复协同面板轮询/刷新/名称解析
      expect(useCADEditorStore.getState().fromShare).toBe(false);
      expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
      expect(useCADEditorStore.getState().collaborationWorkId).toBe(1);
      // 链接参数已消费，避免 effect 重复加入
      expect(useCADEditorStore.getState().fromCollabShare).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('iRet===17（已在协同中）同样解除分享模式并强制拉取', async () => {
    const fetchWorksMock = vi.fn(async () => {});
    const setWorksMock = vi.fn();

    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(17)
    );

    useCADEditorStore.setState({
      fromShare: true,
      fromCollabShare: true,
      targetCollabWorkId: 2,
      collabShareLibraryKey: null,
    });

    vi.useFakeTimers();
    try {
      renderHook(() =>
        useCollabActions(
          true,
          [],
          setWorksMock,
          null,
          vi.fn(),
          fetchWorksMock,
          user
        )
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(fetchWorksMock).toHaveBeenCalledWith(false, true);
      expect(useCADEditorStore.getState().fromShare).toBe(false);
      expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
      expect(useCADEditorStore.getState().collaborationWorkId).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('joinWork 返回其他错误（协同已关闭）：onFileLoaded 触发关闭骨架屏', async () => {
    const fetchWorksMock = vi.fn(async () => {});
    const setWorksMock = vi.fn();
    const onFileLoadedMock = vi.fn();

    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(9)
    );

    useCADEditorStore.setState({
      fromShare: true,
      fromCollabShare: true,
      targetCollabWorkId: 3,
      collabShareLibraryKey: null,
    });

    vi.useFakeTimers();
    try {
      renderHook(() =>
        useCollabActions(
          true,
          [],
          setWorksMock,
          null,
          vi.fn(),
          fetchWorksMock,
          user,
          onFileLoadedMock
        )
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      // 失败也须关闭骨架屏，否则页面停留在加载态
      expect(onFileLoadedMock).toHaveBeenCalled();
      // 失败后 fromCollabShare 被消费，链接触发态结束
      expect(useCADEditorStore.getState().fromCollabShare).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('joinWork 负值重试耗尽（超时）：onFileLoaded 触发关闭骨架屏', async () => {
    const fetchWorksMock = vi.fn(async () => {});
    const setWorksMock = vi.fn();
    const onFileLoadedMock = vi.fn();

    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(-1)
    );

    useCADEditorStore.setState({
      fromShare: true,
      fromCollabShare: true,
      targetCollabWorkId: 4,
      collabShareLibraryKey: null,
    });

    vi.useFakeTimers();
    try {
      renderHook(() =>
        useCollabActions(
          true,
          [],
          setWorksMock,
          null,
          vi.fn(),
          fetchWorksMock,
          user,
          onFileLoadedMock
        )
      );
      // 500ms 首试 + 30 次重试每次 1s + 余量
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTO_JOIN_MAX_RETRIES * 1000 + 2000);
      });

      expect(onFileLoadedMock).toHaveBeenCalled();
      expect(useCADEditorStore.getState().fromCollabShare).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
