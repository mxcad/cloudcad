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
import { AUTO_JOIN_SAFETY_TIMEOUT } from '@/constants/timeouts';
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
  exitCollaboration: vi.fn(async () => ({
    exited: true,
    wasPending: false,
  })),
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
    collabPhase: 'idle',
    collabExitGuard: false,
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

