/**
 * useCollabActions — handleJoinWork loading 生命周期
 *
 * 回归目标：handleJoinWork 的 loading 由 __joinCollabWork__ 的 join 回调
 * （iRet===0/17）关——回调才是「协同文件打开 + 加入成功」的真实信号。
 * 此前靠 OPEN_COMPLETE 事件或 15s 安全定时器兜底：手动加入时文件已加载、
 * OPEN_COMPLETE 不再派发，loading 只能干等满 15s 才关。
 * 所有分支（成功/错误/派发失败/catch）都必须关 loading，否则永久 loading。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollabActions } from './useCollabActions';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import {
  getLoadingState,
  resetLoading,
} from '../services/loadingService';
import { getCooperate } from '../services/mxcadManager';

const { cooperateMock, dispatchResultRef } = vi.hoisted(() => ({
  cooperateMock: {
    joinWork: vi.fn(),
    createWork: vi.fn(),
    exitWork: vi.fn(),
  },
  // 控制 dispatchJoinWork 的返回值（默认 true）；「派发失败」用例置 false
  dispatchResultRef: { current: true },
}));

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
  // 模拟引擎命令层：派发透传到 cooperate mock（回调驱动的用例保持原语义）；
  // 返回值由 dispatchResultRef 控制，「派发失败」用例置 false 且不触发回调
  dispatchJoinWork: vi.fn(
    (
      workId: number,
      cb: (ret: number) => void,
      userId: string,
      encodedUser: string
    ) => {
      if (!dispatchResultRef.current) return false;
      cooperateMock.joinWork(workId, cb, userId, encodedUser);
      return true;
    }
  ),
  dispatchCreateWork: vi.fn(
    (
      cb: (workid: number) => void,
      workData: string,
      userId: string,
      encodedUser: string
    ) => {
      cooperateMock.createWork(cb, workData, userId, encodedUser);
      return true;
    }
  ),
  dispatchExitWork: vi.fn(() => 0),
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
  resetLoading();
  dispatchResultRef.current = true;
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

describe('handleJoinWork — loading 由 join 回调关（事件驱动，不靠定时器/OPEN_COMPLETE）', () => {
  it('join 回调成功（iRet === 0）关 loading', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(0)
    );
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(getLoadingState().globalLoading).toBe(false);
  });

  it('join 回调成功（iRet === 17）关 loading', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(17)
    );
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(getLoadingState().globalLoading).toBe(false);
  });

  it('join 回调报错（iRet !== 0/17）关 loading', async () => {
    cooperateMock.joinWork.mockImplementation(
      (_workId: number, cb: (ret: number) => void) => cb(18)
    );
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(getLoadingState().globalLoading).toBe(false);
  });

  it('派发失败（dispatchJoinWork 返回 false、回调不来）关 loading', async () => {
    dispatchResultRef.current = false;
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(getLoadingState().globalLoading).toBe(false);
  });

  it('joinWork 抛异常（catch 分支）关 loading', async () => {
    cooperateMock.joinWork.mockImplementation(() => {
      throw new Error('joinWork boom');
    });
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleJoinWork(1);
    });
    expect(getLoadingState().globalLoading).toBe(false);
  });
});
