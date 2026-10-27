/**
 * 导出下载闸门（非 React 环境的唯一判定出口）。
 *
 * 运行时开关 freeExportDownloadEnabled 开放、或当前用户为会员时放行
 * （读 localStorage 'user'——AuthContext 在登录/刷新/购买成功后同步写入；
 * 永久会员 expiresAt === null 视为长期有效）。
 *
 * 命令前置门控（vipCommandGuard）与意图链前置事实（intentChain）都从这里读，
 * 保证「拦截」与「续跑」同口径：闸门放行时命令直接执行、不会挂链。
 */
import { membershipState } from '@cloudcad/platform';
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';

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

/** 会员判定走 @cloudcad/platform 唯一出口（与 useMembership 同口径） */
function isVipUser(user: LocalUserLike | null): boolean {
  if (!user) return false;
  return membershipState({
    tierLevel: user.membershipTierLevel ?? 0,
    expiresAt: user.membershipExpiresAt ?? null,
  }).isVip;
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
export function isExportDownloadAllowed(): boolean {
  if (readFreeExportDownloadEnabled()) return true;
  return isVipUser(readLocalUser());
}
