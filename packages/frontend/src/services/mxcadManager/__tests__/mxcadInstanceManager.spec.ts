import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mxcad-app/style', () => ({}));
vi.mock('mxcad-app', () => ({ MxCADView: vi.fn() }));
// vitest 配置将 mxcad/mxdraw 均别名到同一空模块（src/test/__mocks__/empty.ts），
// 两个 vi.mock 工厂会互相覆盖，故在同一个工厂里同时提供两侧导出
vi.mock('mxcad', () => ({
  MxCpp: { getCurrentMxCAD: vi.fn() },
  MxFun: { on: vi.fn(), removeCommand: vi.fn() },
}));
vi.mock('@/api-sdk', () => ({
  thumbnailControllerCheckThumbnail: vi.fn(),
}));
vi.mock('@/utils/authCheck', () => ({ isAuthenticated: vi.fn() }));
vi.mock('@/utils/errorHandler', () => ({ handleError: vi.fn() }));
vi.mock('@/languages', () => ({ t: (msg: string) => msg }));
vi.mock('@/services/drawingSession', () => ({
  openSession: vi.fn(),
  emitOpenComplete: vi.fn(),
  emit: vi.fn(),
  setModified: vi.fn(),
  getCurrentFileUrl: vi.fn(),
  getCacheTimestamp: vi.fn(),
  setCurrentFileUrl: vi.fn(),
  resetSessionRuntime: vi.fn(),
  subscribePermanent: vi.fn(),
}));
vi.mock('../mxcadHelpers', () => ({
  getFileInfo: vi.fn(),
  formatEditorFileName: vi.fn(),
  setEditorFileName: vi.fn(),
  refreshFileName: vi.fn(),
  restoreEditorTitle: vi.fn(),
}));
vi.mock('@/stores/useCADEditorStore', () => ({
  useCADEditorStore: { getState: vi.fn() },
}));
vi.mock('./mxcadContainerManager', () => ({
  MxCADContainerManager: { getInstance: vi.fn() },
}));
vi.mock('./mxcadCache', () => ({ clearOldMxwebCache: vi.fn() }));
vi.mock('./mxcadOpenFlow', () => ({
  MxCADOpenFlow: class MxCADOpenFlowStub {
    constructor() {
      /* stub：openFlow 行为由 mxcadOpenFlow.spec.ts 单独覆盖 */
    }
  },
}));

import { MxCADInstanceManager } from '../mxcadInstanceManager';
import {
  openSession,
  emitOpenComplete,
  setModified,
} from '@/services/drawingSession';
import {
  getFileInfo,
  setEditorFileName,
  refreshFileName,
} from '../mxcadHelpers';
import { useCADEditorStore } from '@/stores/useCADEditorStore';

/**
 * 回归（用户反馈）：CAD 编辑器侧边栏打开图纸失败时，当前文件状态（title/currentFileInfo）
 * 仍被写成失败图纸。根因：McObject 层 openFileComplete 事件丢失结果码，旧实现无条件消费
 * pendingOpenInfo（openSession）。修复后订阅 MxDrawObject 层事件，仅结果码 0（成功）才记录。
 */
describe('MxCADInstanceManager.setupFileOpenListener — 结果码门控', () => {
  let openCompleteHandlers: Array<(iResult: number) => void>;
  let mxdraw: {
    addEvent: ReturnType<typeof vi.fn>;
    removeEventFuction: ReturnType<typeof vi.fn>;
  };
  let manager: MxCADInstanceManager;

  const fileInfo = {
    fileId: 'drawing-a',
    parentId: null,
    projectId: 'project-a',
    name: '图纸A.dwg',
    personalSpaceId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCADEditorStore.getState).mockReturnValue({
      isInCollaboration: false,
    });
    vi.mocked(getFileInfo).mockReturnValue(null);
    openCompleteHandlers = [];
    mxdraw = {
      addEvent: vi.fn(
        (_name: string, handler: (iResult: number) => void) => {
          openCompleteHandlers.push(handler);
        }
      ),
      removeEventFuction: vi.fn(),
    };
    manager = new MxCADInstanceManager();
    (manager as unknown as { mxcadView: unknown }).mxcadView = {
      mxcad: { getMxDrawObject: () => mxdraw },
    };
    (manager as unknown as {
      setupFileOpenListener: () => void;
    }).setupFileOpenListener();
  });

  it('订阅 MxDrawObject 层事件（携带结果码）而非 McObject 层', () => {
    expect(mxdraw.addEvent).toHaveBeenCalledWith(
      'openFileComplete',
      expect.any(Function)
    );
  });

  it('成功（结果码 0）：消费 pendingOpenInfo → openSession 记录当前文件状态', async () => {
    const onSuccess = vi.fn();
    manager.setPendingOpenInfo({ fileInfo, onSuccess });

    openCompleteHandlers.forEach((h) => h(0));

    // 等待异步 onOpen 完成（openSession + onSuccess + 副作用）
    await Promise.resolve();
    await Promise.resolve();

    expect(openSession).toHaveBeenCalledWith(fileInfo);
    expect(onSuccess).toHaveBeenCalled();
    expect(manager.getPendingOpenInfo()).toBeNull();
    expect(emitOpenComplete).toHaveBeenCalled();
    expect(setModified).toHaveBeenCalledWith(false);
  });

  it('失败（结果码非 0）：不消费 pendingOpenInfo，不记录当前文件状态，不触发副作用', async () => {
    manager.setPendingOpenInfo({ fileInfo, onSuccess: vi.fn() });

    // 打开失败时引擎仍会派发 openFileComplete（携带非 0 结果码）：
    // 修复前在此无条件 openSession → title/currentFileInfo 写成失败图纸（回归场景）
    openCompleteHandlers.forEach((h) => h(1));

    await Promise.resolve();
    await Promise.resolve();

    expect(openSession).not.toHaveBeenCalled();
    // pending 保留：由 MxCADOpenFlow 失败路径（retCall）统一清理回滚
    expect(manager.getPendingOpenInfo()).toEqual({
      fileInfo,
      onSuccess: expect.any(Function),
    });
    expect(emitOpenComplete).not.toHaveBeenCalled();
    expect(setModified).not.toHaveBeenCalled();
  });

  it('协同状态 + currentFileInfo 为空：openFileComplete 用 refreshFileName 修正标题（防 empty_template.mxweb 覆盖）', async () => {
    // 协同链接 auto-join 不经过 openSession，currentFileInfo 为 null，
    // 但 isInCollaboration=true；引擎在协同文件加载完成触发 openFileComplete 时
    // 会把标题重置为引擎当前文件名（如 empty_template.mxweb），
    // 需用 refreshFileName（currentFileName 兜底）修正保持 [协同中]-xxx。
    vi.mocked(useCADEditorStore.getState).mockReturnValue({
      isInCollaboration: true,
    });
    vi.mocked(getFileInfo).mockReturnValue(null);

    openCompleteHandlers.forEach((h) => h(0));
    await Promise.resolve();
    await Promise.resolve();

    expect(openSession).not.toHaveBeenCalled();
    expect(setEditorFileName).not.toHaveBeenCalled();
    // 协同场景走 refreshFileName（currentFileName 兜底）修正标题
    expect(refreshFileName).toHaveBeenCalled();
  });

  it('协同状态 + currentFileInfo 为空：500ms 后再次 refreshFileName 兜底，防引擎异步重置标题', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(useCADEditorStore.getState).mockReturnValue({
        isInCollaboration: true,
      });
      vi.mocked(getFileInfo).mockReturnValue(null);

      openCompleteHandlers.forEach((h) => h(0));
      await Promise.resolve();
      await Promise.resolve();

      const initialCalls = (refreshFileName as ReturnType<typeof vi.fn>)
        .mock.calls.length;
      vi.advanceTimersByTime(500);
      expect(refreshFileName).toHaveBeenCalledTimes(initialCalls + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
