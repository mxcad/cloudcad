import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewFileCommand } from '../cmd/newFileCommand';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import type { CommandContext } from '../cmd/types';

/**
 * 新建图纸（Mx_NewFile）会话、标题、确认框与 URL 一致性回归测试
 *
 * 历史 bug：新建图纸只 patch 部分字段、URL 各自手拼，结果会话继承了上一张
 * 图纸的身份（currentFileInfo / projectId / fromShare），URL 也可能残留旧文件
 * 的 nodeId / hash；标题栏更是一直显示上一张图纸——引擎 openFileComplete 固定
 * 写 fileName.value = " - " + _name，而 _name 是引擎模块级变量、前端绕过引擎
 * openWebFile 包装从不更新它。
 *
 * 后续修复（FileContext 单一事实源）：会话切换走 newSession()（无参，kind 'new'）。
 *
 * 引擎版 Mx_NewFile = 弹确认框 → mxcad.newFile() + 重置图层/颜色/线型 store。
 * 修复：新建改走引擎原生 newFile()（不触发 readMxFile / openFileComplete），
 * 去掉 openFile(empty.mxweb)——那会走 openWebFile → readMxFile error:3292 →
 * waitForDocumentLoaded 超时；newFile() 不派发 openFileComplete，故不设
 * pendingOpenInfo（那靠 openFileComplete 消费，此处会泄漏）。
 */
const mocks = vi.hoisted(() => ({
  newSession: vi.fn(),
  resetSessionRuntime: vi.fn(),
  emit: vi.fn(),
  setEditorFileName: vi.fn(),
  confirmExitCollaborationIfNeeded: vi.fn().mockResolvedValue(true),
  checkAndConfirmUnsavedChanges: vi.fn().mockResolvedValue(true),
  globalShowConfirm: vi.fn().mockResolvedValue(true),
  getCurrentMxCAD: vi.fn(),
  newFile: vi.fn(),
  initLayerList: vi.fn(),
  initColorIndexList: vi.fn(),
  initLineTypeList: vi.fn(),
}));

// vitest.config.ts 把 mxcad 与 mxdraw 两个别名指向同一个 stub 文件，
// vi.mock 按解析后路径去重、两个名字共享同一个 factory：两侧需要的导出
// 必须放进同一个 factory，否则后注册的那个会把前一个吃掉
vi.mock('mxcad', () => ({
  MxCpp: { getCurrentMxCAD: mocks.getCurrentMxCAD },
}));
vi.mock('mxdraw', () => ({
  MxCpp: { getCurrentMxCAD: mocks.getCurrentMxCAD },
}));
vi.mock('mxcad-app', () => ({
  store: {
    useLayer: () => ({ initLayerList: mocks.initLayerList }),
    useColor: () => ({ initColorIndexList: mocks.initColorIndexList }),
    useLineType: () => ({ initLineTypeList: mocks.initLineTypeList }),
  },
}));
vi.mock('../mxcadCollaboration', () => ({
  confirmExitCollaborationIfNeeded: mocks.confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges: mocks.checkAndConfirmUnsavedChanges,
}));
vi.mock('../../drawingSession', () => ({
  newSession: mocks.newSession,
  resetSessionRuntime: mocks.resetSessionRuntime,
  emit: mocks.emit,
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowConfirm: mocks.globalShowConfirm,
}));
vi.mock('../mxcadHelpers', () => ({
  setEditorFileName: mocks.setEditorFileName,
}));

describe('NewFileCommand — 新建图纸同步清空会话与 URL', () => {
  const ctx = {} as CommandContext;
  const ORIGINAL = window.location.href;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmExitCollaborationIfNeeded.mockResolvedValue(true);
    mocks.checkAndConfirmUnsavedChanges.mockResolvedValue(true);
    mocks.globalShowConfirm.mockResolvedValue(true);
    mocks.getCurrentMxCAD.mockReturnValue(null);
  });

  afterEach(() => {
    window.history.replaceState(null, '', ORIGINAL);
    useCADEditorStore.setState({ navigateFunction: null });
  });

  it('清干净上一张图纸的身份后进入 kind "new" 会话', async () => {
    useCADEditorStore.setState({ navigateFunction: vi.fn() });

    const result = await new NewFileCommand().execute(ctx);

    expect(result).toEqual({ success: true });
    expect(mocks.newSession).toHaveBeenCalledTimes(1);
    expect(mocks.newSession).toHaveBeenCalledWith();
    expect(mocks.resetSessionRuntime).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith(
      'mxcad-new-file',
      expect.objectContaining({ fileId: null })
    );
  });

  it('引擎已就绪时调用引擎原生 newFile()（回归：openFile(empty.mxweb) 走 openWebFile → readMxFile error:3292）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue({ newFile: mocks.newFile });
    useCADEditorStore.setState({ navigateFunction: vi.fn() });

    await new NewFileCommand().execute(ctx);

    expect(mocks.newFile).toHaveBeenCalledTimes(1);
    expect(mocks.initLayerList).toHaveBeenCalledTimes(1);
    expect(mocks.initColorIndexList).toHaveBeenCalledTimes(1);
    expect(mocks.initLineTypeList).toHaveBeenCalledTimes(1);
  });

  it('引擎未就绪时不调用 newFile（由打开流程统一等待初始化）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue(null);
    useCADEditorStore.setState({ navigateFunction: vi.fn() });

    await new NewFileCommand().execute(ctx);

    expect(mocks.newFile).not.toHaveBeenCalled();
  });

  it('标题在调用 newFile 之前设为 new.dwg（回归：等 openFileComplete 会被引擎回写覆盖回旧名）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue({ newFile: mocks.newFile });
    useCADEditorStore.setState({ navigateFunction: vi.fn() });
    const order: string[] = [];
    mocks.setEditorFileName.mockImplementation(() => {
      order.push('title-set');
    });
    mocks.newFile.mockImplementation(() => {
      order.push('newFile-called');
    });

    await new NewFileCommand().execute(ctx);

    expect(mocks.setEditorFileName).toHaveBeenCalledWith('new.dwg');
    expect(order).toEqual(['title-set', 'newFile-called']);
  });

  it('确认框先于会话切换与 newFile 弹出（引擎版 Mx_NewFile = 弹确认 → newFile）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue({ newFile: mocks.newFile });
    useCADEditorStore.setState({ navigateFunction: vi.fn() });
    const order: string[] = [];
    mocks.globalShowConfirm.mockImplementation(async () => {
      order.push('confirm-shown');
      return true;
    });
    mocks.newSession.mockImplementation(() => {
      order.push('new-session');
    });
    mocks.newFile.mockImplementation(() => {
      order.push('newFile-called');
    });

    await new NewFileCommand().execute(ctx);

    expect(order).toEqual(['confirm-shown', 'new-session', 'newFile-called']);
  });

  it('URL 清空文件身份参数（回归：新建后残留旧文件的 nodeId / hash）', async () => {
    const navigateFunction = vi.fn();
    useCADEditorStore.setState({ navigateFunction });
    window.history.replaceState(
      null,
      '',
      '/cad-editor/old-node?nodeId=old-project&hash=old-hash'
    );

    await new NewFileCommand().execute(ctx);

    expect(navigateFunction).toHaveBeenCalledWith('/cad-editor');
  });

  it('保留跨文件不失效的 back 返回地址', async () => {
    const navigateFunction = vi.fn();
    useCADEditorStore.setState({ navigateFunction });
    window.history.replaceState(
      null,
      '',
      '/cad-editor/old-node?back=%2Fprojects%2Fproject-1'
    );

    await new NewFileCommand().execute(ctx);

    expect(navigateFunction).toHaveBeenCalledWith(
      '/cad-editor?back=%2Fprojects%2Fproject-1'
    );
  });

  it('无路由跳转函数时退回 history.replaceState 同样清空身份参数', async () => {
    useCADEditorStore.setState({ navigateFunction: null });
    window.history.replaceState(null, '', '/cad-editor/old-node?nodeId=p1');

    await new NewFileCommand().execute(ctx);

    expect(window.location.pathname).toBe('/cad-editor');
    expect(window.location.search).toBe('');
  });

  it('用户取消未保存确认 → 不改会话、不改 URL', async () => {
    mocks.checkAndConfirmUnsavedChanges.mockResolvedValue(false);
    const navigateFunction = vi.fn();
    useCADEditorStore.setState({ navigateFunction });
    window.history.replaceState(null, '', '/cad-editor/old-node');

    const result = await new NewFileCommand().execute(ctx);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'unsaved changes cancelled',
      })
    );
    expect(mocks.newSession).not.toHaveBeenCalled();
    expect(navigateFunction).not.toHaveBeenCalled();
    expect(mocks.setEditorFileName).not.toHaveBeenCalled();
    expect(mocks.newFile).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cad-editor/old-node');
  });

  it('用户取消新建确认框 → 不改会话、不改 URL、不 newFile', async () => {
    mocks.globalShowConfirm.mockResolvedValue(false);
    const navigateFunction = vi.fn();
    useCADEditorStore.setState({ navigateFunction });
    window.history.replaceState(null, '', '/cad-editor/old-node');

    const result = await new NewFileCommand().execute(ctx);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'new file cancelled',
      })
    );
    expect(mocks.newSession).not.toHaveBeenCalled();
    expect(navigateFunction).not.toHaveBeenCalled();
    expect(mocks.setEditorFileName).not.toHaveBeenCalled();
    expect(mocks.newFile).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cad-editor/old-node');
  });
});
