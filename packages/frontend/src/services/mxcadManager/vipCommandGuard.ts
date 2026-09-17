import { MxFun, store } from 'mxdraw';
import { t } from '@/languages';
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { handleVipFeatureRequiredError } from '@/utils/vipFeatureGuide';
import { VIP_EXPORT_COMMANDS } from './applyVipExportIcons';

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
 * - 非会员拦截时不把命令发往引擎：web 版以「复用 API 403 兜底时的购买弹窗
 *   （handleVipFeatureRequiredError）」等价替换参考实现的
 *   `originalSendStringToExecute("MxPayVIP")`（web 引擎无此命令），并同样给出错误提示
 *
 * web 版差异：
 * - 参照 `MxElectronAPI.applyQueryMemberPermission()`（异步服务端校验）的位置，
 *   改为 isExportDownloadAllowed()：会员状态读 localStorage user（AuthContext 在
 *   登录/刷新/购买成功后同步），并叠加运行时开关 freeExportDownloadEnabled 放行
 *   （与 useDownloadFormatModal 的 canExportDownload 判定一致，后端仍有门控兜底）
 * - 门控命令清单与 applyVipExportIcons 的 VIP 图标替换同源（VIP_EXPORT_COMMANDS）
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
      if (
        VIP_EXPORT_COMMANDS.includes(cmd) ||
        initQuickCommand.some((item) => {
          const first = item[0];
          return (
            first !== undefined &&
            VIP_EXPORT_COMMANDS.includes(first) &&
            item.includes(cmd)
          );
        })
      ) {
        // 会员前置验证（web 版对应参考实现的 MxElectronAPI.applyQueryMemberPermission）
        if (await isExportDownloadAllowed()) {
          return originalSendStringToExecute.call(mxf, cmd, ...args);
        }
        void handleVipFeatureRequiredError(
          undefined,
          t('导出下载为会员专属功能，开通 VIP 后即可使用')
        );
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

/** 测试用：重置安装标记，便于单测重复安装/卸载 */
export function resetVipCommandGuardForTest(): void {
  installed = false;
}

/** 本地缓存用户（AuthContext 登录/刷新时同步写入 localStorage 'user'） */
interface LocalUserLike {
  membershipTierLevel?: number;
  membershipExpiresAt?: string | null;
}

function readLocalUser(): LocalUserLike | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as LocalUserLike;
  } catch {
    return null;
  }
}

/** 与 useMembership 同构的会员判定（永久会员 expiresAt === null 视为长期有效） */
function isVipUser(user: LocalUserLike | null): boolean {
  if (!user) return false;
  const tierLevel = user.membershipTierLevel ?? 0;
  if (tierLevel <= 0) return false;
  const expiresAt = user.membershipExpiresAt ?? null;
  if (expiresAt === null) return true;
  return new Date(expiresAt).getTime() - Date.now() > 0;
}

/**
 * 非 React 环境读取运行时开关（freeExportDownloadEnabled）：
 * 复用 React 查询缓存（RuntimeConfigProvider 已按 ADR-0030 预取缓存），
 * 未就绪时按未开放处理（保守默认，避免误放行）。
 */
function readFreeExportDownloadEnabled(): boolean {
  try {
    const config = queryClient.getQueryData<{
      freeExportDownloadEnabled?: boolean;
    }>(queryKeys.runtimeConfig.public);
    return config?.freeExportDownloadEnabled ?? false;
  } catch {
    return false;
  }
}

/** 导出下载门控放行判定：运行时开关开放 或 当前用户为会员（游客/非会员均拦截） */
async function isExportDownloadAllowed(): Promise<boolean> {
  if (readFreeExportDownloadEnabled()) return true;
  return isVipUser(readLocalUser());
}
