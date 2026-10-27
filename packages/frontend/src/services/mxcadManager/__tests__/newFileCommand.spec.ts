import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewFileCommand } from '../cmd/newFileCommand';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import type { CommandContext } from '../cmd/types';

/**
 * 新建图纸（Mx_NewFile）会话、标题与 URL 一致性回归测试
 *
 * 历史 bug：新建图纸只 patch 部分字段、URL 各自手拼，
 * 结果会话继承了上一张图纸的身份（currentFileInfo / projectId / fromShare），
 * URL 也可能残留旧文件的 nodeId / hash；标题栏更是一直显示上一张图纸——
 * 引擎 openFileComplete 固定写 fileName.value = " - " + _name，而 _name 是引擎
 * 模块级变量、前端绕过引擎 openWebFile 包装从不更新它，空模板这次打开若被引擎
 * _isStopLoading 闩锁吞掉 openFileComplete，标题就永远停在旧名。
 * 回归要求：标题必须在发打开命令之前就清空（setEditorFileName 同时清 _name）。
 *
 * 后续修复（FileContext 单一事实源）：会话切换走 newSession()（无参，kind 'new'），
 * 待打开会话登记为 { context: kind 'new' }，打开走 mxcadManager.openFile 串行
 * 队列（不再裸发 __openWebFile__——重叠打开会锁死引擎闩锁、pending 泄漏导致
 * Mx_Save 被永久拦截）。
 */
const mocks = vi.hoisted(() => ({
  newSession: vi.fn(),
  resetSessionRuntime: vi.fn(),
  emit: vi.fn(),
  setPendingOpenInfo: vi.fn(),
  openFile: vi.fn().mockResolvedValue(undefined),
  setEditorFileName: vi.fn(),
  confirmExitCollaborationIfNeeded: vi.fn().mockResolvedValue(true),
  checkAndConfirmUnsavedChanges: vi.fn().mockResolvedValue(true),
  getCurrentMxCAD: vi.fn(),
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
    useLayer: () => ({ initLayerList: vi.fn() }),
    useColor: () => ({ initColorIndexList: vi.fn() }),
    useLineType: () => ({ initLineTypeList: vi.fn() }),
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
vi.mock('../mxcadManager', () => ({
  mxcadManager: {
    setPendingOpenInfo: mocks.setPendingOpenInfo,
    openFile: mocks.openFile,
  },
}));
vi.mock('../mxcadHelpers', () => ({
  setEditorFileName: mocks.setEditorFileName,
}));

/** 新建图纸的待打开会话上下文（kind 'new'，无云端身份） */
const NEW_CONTEXT = { kind: 'new', fileId: null, name: null };

describe('NewFileCommand — 新建图纸同步清空会话与 URL', () => {
  const ctx = {} as CommandContext;
  const ORIGINAL = window.location.href;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openFile.mockResolvedValue(undefined);
    mocks.confirmExitCollaborationIfNeeded.mockResolvedValue(true);
    mocks.checkAndConfirmUnsavedChanges.mockResolvedValue(true);
    mocks.getCurrentMxCAD.mockReturnValue(null);
  });

  afterEach(() => {
    window.history.replaceState(null, '', ORIGINAL);
    useCADEditorStore.setState({ navigateFunction: null });
  });

  it('清干净上一张图纸的身份后进入 kind "new" 会话，并登记到打开流程', async () => {
    useCADEditorStore.setState({ navigateFunction: vi.fn() });

    const result = await new NewFileCommand().execute(ctx);

    expect(result).toEqual({ success: true });
    expect(mocks.newSession).toHaveBeenCalledTimes(1);
    expect(mocks.newSession).toHaveBeenCalledWith();
    expect(mocks.setPendingOpenInfo).toHaveBeenCalledWith({
      context: NEW_CONTEXT,
    });
    expect(mocks.resetSessionRuntime).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith(
      'mxcad-new-file',
      expect.objectContaining({ fileId: null })
    );
  });

  it('引擎已就绪时经串行队列打开空模板（fetchAttributes=1 仅载入内存）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue({});
    useCADEditorStore.setState({ navigateFunction: vi.fn() });

    await new NewFileCommand().execute(ctx);

    expect(mocks.openFile).toHaveBeenCalledWith({
      url: expect.stringContaining('empty.mxweb'),
      fetchAttributes: 1,
    });
  });

  it('引擎未就绪时不发起打开（由打开流程统一等待初始化）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue(null);
    useCADEditorStore.setState({ navigateFunction: vi.fn() });

    await new NewFileCommand().execute(ctx);

    expect(mocks.openFile).not.toHaveBeenCalled();
  });

  it('标题在派发空模板打开命令之前清空（回归：等 openFileComplete 清空会被引擎回写覆盖回旧名）', async () => {
    mocks.getCurrentMxCAD.mockReturnValue({});
    useCADEditorStore.setState({ navigateFunction: vi.fn() });
    const order: string[] = [];
    mocks.setEditorFileName.mockImplementation(() => {
      order.push('title-cleared');
    });
    mocks.openFile.mockImplementation(() => {
      order.push('open-dispatched');
      return Promise.resolve();
    });

    await new NewFileCommand().execute(ctx);

    expect(mocks.setEditorFileName).toHaveBeenCalledWith('');
    expect(order).toEqual(['title-cleared', 'open-dispatched']);
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
    expect(window.location.pathname).toBe('/cad-editor/old-node');
  });
});
