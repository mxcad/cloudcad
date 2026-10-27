import { MxFun, store } from 'mxdraw';
import { VIP_EXPORT_COMMANDS } from './applyVipExportIcons';
import { VIP_EXPORT_CHAINS, beginIntent } from './intentChain';
import { isExportDownloadAllowed } from './exportGate';

/**
 * VIP 命令前置门控（CAD 编辑器内命令触发前先校验会员，再放行执行）。
 *
 * 结构与参考核心源码保持一致（桌面端 `store.state.MxFun` 打补丁方案）：
 * - 打补丁目标：`store.state.MxFun`（mxdraw 导出的 Vue store 中保存的 MxFun 单例，
 *   与 import 的 MxFun 是同一对象，编辑器 UI 的命令分发走的就是它）
 * - 覆写入口：`sendStringToExecute` + `initQuickCommand`（不可写/不可配置，
 *   最后整体 Object.freeze 防止后续任何修改）
 * - initQuickCommand 每次调用记录最新命令组，供 sendStringToExecute 判断
 *   组内子命令是否属于某个以 VIP 命令开头的命令组
 * - 非会员拦截时不把命令发往引擎：web 版以「挂起意图链（ADR-0081）」等价替换
 *   参考实现的 `originalSendStringToExecute("MxPayVIP")`（web 引擎无此命令）——
 *   未登录走登录闸门、已登录弹购买引导，登录/充值成功后由意图链自动续跑原命令
 *
 * web 版差异：
 * - 参照 `MxElectronAPI.applyQueryMemberPermission()`（异步服务端校验）的位置，
 *   改为 isExportDownloadAllowed()（exportGate 唯一出口）：会员状态读 localStorage
 *   user（AuthContext 在登录/刷新/购买成功后同步），并叠加运行时开关
 *   freeExportDownloadEnabled 放行（与 useDownloadFormatModal 的 canExportDownload
 *   判定一致，后端仍有门控兜底）
 * - 门控命令清单与 applyVipExportIcons 的 VIP 图标替换同源（VIP_EXPORT_COMMANDS），
 *   意图链定义（VIP_EXPORT_CHAINS）亦从该清单派生
 */
let installed = false;

export function installVipCommandGuard(): void {
  if (installed) return;

  // store.state.MxFun 由 mxcad UI 初始化时写入（store.state.MxFun ?? MxFun 兜底同一单例）
  const mxf = store?.state?.MxFun ?? MxFun;
  if (!mxf) return;
  if (
    typeof mxf.sendStringToExecute !== 'function' ||
    typeof mxf.initQuickCommand !== 'function'
  ) {
    return; // 环境不完整（如部分测试环境），跳过打补丁
  }

  const originalSendStringToExecute = mxf.sendStringToExecute;
  const originalInitQuickCommand = mxf.initQuickCommand;
  let initQuickCommand: string[][] = [];

  Object.defineProperty(mxf, 'initQuickCommand', {
    value: async function (cmds: string[][]) {
      initQuickCommand = cmds;
      return originalInitQuickCommand.call(mxf, cmds);
    },
    writable: false, // 防止该属性被重新赋值
    configurable: false, // 防止该属性被删除
  });

  Object.defineProperty(mxf, 'sendStringToExecute', {
    value: async function (cmd: string, ...args: any[]) {
      // 本次调用归属的 VIP 命令：命令本身，或其所属快捷命令组的组首
      // （引擎按组内子命令分发，组首为 VIP 命令时子命令随组首门控）
      const vipCommand = VIP_EXPORT_COMMANDS.includes(cmd)
        ? cmd
        : initQuickCommand.find((item) => {
            const first = item[0];
            return (
              first !== undefined &&
              VIP_EXPORT_COMMANDS.includes(first) &&
              item.includes(cmd)
            );
          })?.[0];

      if (vipCommand) {
        // 会员前置验证（web 版对应参考实现的 MxElectronAPI.applyQueryMemberPermission）
        if (isExportDownloadAllowed()) {
          return originalSendStringToExecute.call(mxf, cmd, ...args);
        }
        // 会员前置未过：挂起意图链（ADR-0081）——未登录走登录闸门、已登录弹购买
        // 引导，登录/充值成功后由 resumeIntent 自动续跑组首命令（重新触发整组）
        const chain = VIP_EXPORT_CHAINS[vipCommand];
        if (chain) void beginIntent(chain);
        return undefined;
      }
      return originalSendStringToExecute.call(mxf, cmd, ...args);
    },
    writable: false, // 防止该属性被重新赋值
    configurable: false, // 防止该属性被删除
  });

  // 冻结整个对象以防止后续任何修改
  Object.freeze(mxf);

  installed = true;
}
