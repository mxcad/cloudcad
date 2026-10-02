import { describe, it, expect, vi, beforeEach } from 'vitest';

// vitest 配置把 mxcad / mxdraw 别名到同一个空模块，多个 vi.mock 工厂会互相
// 覆盖，故在同一个工厂里同时提供两侧导出
vi.mock('mxcad', () => ({
  MxCpp: { getCurrentMxCAD: vi.fn() },
  MxFun: { addCommand: vi.fn(), on: vi.fn() },
}));
vi.mock('mxcad-app/style', () => ({}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));
vi.mock('@/utils/errorHandler', () => ({ handleError: vi.fn() }));
vi.mock('@/utils/authCheck', () => ({ isAuthenticated: vi.fn(() => true) }));
// 11 个命令模块会拉起引擎类（MxDbAlignedDimension / THREE …），全部 mock 掉：
// 本测试只关心桥接逻辑，命令内容由 CommandRegistry 里的假命令替代
vi.mock('../cmd/index', () => ({}));
vi.mock('../mxcadHelpers', () => ({
  getFileInfo: vi.fn(() => null),
  saveCurrentDrawingToBlob: vi.fn(),
}));
vi.mock('../mxcadCollaboration', () => ({
  exitCollaborationIfNeeded: vi.fn(async () => {}),
}));
vi.mock('../saveFile', () => ({
  saveCurrentFile: vi.fn(async () => ({})),
  createDefaultSaveDeps: vi.fn(() => ({ sdk: {}, permissions: {} })),
}));
vi.mock('../engineEventBridge', () => ({
  bridgeEngineExportFileEvent: vi.fn(() => () => {}),
}));
vi.mock('../drawingSession', () => ({
  emit: vi.fn(),
  getModified: vi.fn(() => false),
}));
vi.mock('@/stores/useCADEitorStore', () => ({
  useCADEitorStore: {
    getState: vi.fn(() => ({ isModified: false, isLeavingPage: false })),
  },
}));

const { MxFun } = vi.mocked(await import('mxdraw'));

import { CommandRegistry } from '../cmd/types';
import type { Command } from '../cmd/types';
import { rebindMxCommands } from '../cmd/rebindMxCommands';

/**
 * 回归（用户三次反馈「新建文件后标题 / URL 不变」）：引擎初始化时 `registerCommand()`
 * 把它自己的内置命令灌进 `MxFun`，同名命令按注册名**覆盖**先前注册者——
 * `Mx_NewFile` 就是撞名的一个（引擎版 = 弹确认框 → `mxcad.newFile()`）。被覆盖后
 * 点「新建图纸」走的是引擎那条，前端的会话清理 / 标题 / URL 全都不生效。
 *
 * 故引擎 init 之后必须夺回前端入口，两处都在：
 * - `mxcadBootstrap`：订阅 `mxcadApplicationCreatedMxCADObject`
 *   （该事件在引擎 registerCommand() 之后派发）；
 * - `MxCADInstanceManager.runInitializationSideEffects`：直接再绑一次
 *   （覆盖 HMR 后 `window.__MxCADView__` 恢复路径，那条路径不再派发上述事件）。
 */
describe('mxcadBootstrap 命令桥接 — 引擎覆盖同名命令后夺回前端入口', () => {
  const fakeNewFileCommand: Command = {
    name: 'Mx_NewFile',
    execute: async () => ({ success: true }),
  };

  beforeEach(() => {
    vi.spyOn(CommandRegistry, 'execute').mockResolvedValue({ success: true });
    vi.mocked(MxFun.addCommand).mockClear();
  });

  function boundNewFileHandler(): (() => Promise<unknown>) | undefined {
    return vi
      .mocked(MxFun.addCommand)
      .mock.calls.find(([name]) => name === 'Mx_NewFile')?.[1] as
      | (() => Promise<unknown>)
      | undefined;
  }

  it('模块加载期已把注册表里的命令挂到引擎命令表', async () => {
    CommandRegistry.register(fakeNewFileCommand);
    await import('../mxcadBootstrap');

    expect(vi.mocked(MxFun.addCommand)).toHaveBeenCalledWith(
      'Mx_NewFile',
      expect.any(Function)
    );
  });

  it('订阅 mxcadApplicationCreatedMxCADObject，回调体重新绑定全部命令', async () => {
    CommandRegistry.register(fakeNewFileCommand);
    await import('../mxcadBootstrap');

    const callback = vi
      .mocked(MxFun.on)
      .mock.calls.find(
        ([event]) => event === 'mxcadApplicationCreatedMxCADObject'
      )?.[1] as (() => void) | undefined;
    expect(typeof callback).toBe('function');

    vi.mocked(MxFun.addCommand).mockClear();
    callback!();
    expect(vi.mocked(MxFun.addCommand)).toHaveBeenCalledWith(
      'Mx_NewFile',
      expect.any(Function)
    );
  });

  it('rebindMxCommands 可重复调用，每次绑定注册表里的每个命令', async () => {
    CommandRegistry.register(fakeNewFileCommand);

    vi.mocked(MxFun.addCommand).mockClear();
    rebindMxCommands();
    rebindMxCommands();

    expect(vi.mocked(MxFun.addCommand)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(MxFun.addCommand)).toHaveBeenCalledWith(
      'Mx_NewFile',
      expect.any(Function)
    );
  });

  it('重新绑定后触发 Mx_NewFile 走前端 CommandRegistry，而非引擎内置的 mxcad.newFile()', async () => {
    CommandRegistry.register(fakeNewFileCommand);
    rebindMxCommands();

    const handler = boundNewFileHandler();
    expect(typeof handler).toBe('function');
    await handler!();

    expect(CommandRegistry.execute).toHaveBeenCalledWith(
      'Mx_NewFile',
      expect.objectContaining({ fileName: 'untitled' })
    );
  });
});
