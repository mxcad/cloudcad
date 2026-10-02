import { MxFun } from 'mxdraw';
import { getFileInfo, saveCurrentDrawingToBlob } from '../mxcadHelpers';
import { CommandRegistry } from './types';
import type { CommandContext } from './types';
import type { CurrentFileInfo } from '../mxcadTypes';

/**
 * 组装命令执行上下文（默认保存深服务与 SDK/权限句柄）。
 *
 * `saveFile` 用动态 import 引入：`saveFile → saveSequences → ./cmd/insertImageCommand
 * → mxcadManager → mxcadInstanceManager`，静态引入会让 `mxcadInstanceManager → 本文件`
 * 闭合成环、在模块求值期抛错。命令执行时模块图早已就绪，动态 import 立即返回。
 */
export async function buildCommandContext(): Promise<CommandContext> {
  const fileInfo = getFileInfo();
  const { saveCurrentFile, createDefaultSaveDeps } =
    await import('../saveFile');
  const deps = createDefaultSaveDeps();
  return {
    fileName: fileInfo?.name || 'untitled',
    fileInfo,
    saveDrawingToBlob: saveCurrentDrawingToBlob,
    saveFile: (fi: CurrentFileInfo) => saveCurrentFile(fi, deps),
    sdk: deps.sdk,
    permissions: deps.permissions,
  };
}

/**
 * 把前端 CommandRegistry 的命令重新挂到引擎命令表上（幂等，可重复调用）。
 *
 * 引擎初始化时会把它自己的内置命令灌进 `MxFun`，同名命令按注册名**覆盖**先前注册者
 * （`MxCmdRunManager.addCommand` 默认 flag = MCRX_CMD_MODAL，不校验重名）——
 * `Mx_NewFile` 就是撞名的一个（引擎版 = 弹确认框 → `mxcad.newFile()`）。被覆盖后
 * 点「新建图纸」走的是引擎那条，前端的会话清理 / 标题 / URL 全都不生效。
 *
 * 因此只在命令注册模块加载期绑一次不够：引擎 init 之后必须再绑一次。调用方：
 * - `mxcadBootstrap`：模块加载期绑一次 + 订阅 `mxcadApplicationCreatedMxCADObject`
 *   （该事件在引擎 `registerCommand()` 之后派发）；
 * - `MxCADInstanceManager.runInitializationSideEffects()`：引擎就绪的权威回调，
 *   同时覆盖 HMR 后 `window.__MxCADView__` 恢复路径——那条路径不会再派发
 *   `mxcadApplicationCreatedMxCADObject`，光靠事件订阅会漏绑。
 */
export function rebindMxCommands(): void {
  for (const cmd of CommandRegistry.getAll()) {
    MxFun.addCommand(cmd.name, async () => {
      await CommandRegistry.execute(cmd.name, await buildCommandContext());
    });
  }
}
