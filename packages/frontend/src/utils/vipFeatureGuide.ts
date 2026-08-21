import { isAuthenticated } from '@/utils/authCheck';
import { globalShowConfirm } from '@/utils/notificationEvents';
import { t } from '@/languages';
import { QUOTA_GUIDE_EVENT } from './quotaUpgradeGuide';

/** 后端 VIP 专属功能门控业务错误码（VipFeatureRequiredException 响应 code） */
export const VIP_FEATURE_REQUIRED_CODE = 'VIP_FEATURE_REQUIRED';

/** 导出下载方向（mxweb → 其他格式）的会员门控特性标识（后端 VipFeatureRequiredException.feature） */
export const EXPORT_DOWNLOAD_FEATURE = 'export_download';

/**
 * 判断错误是否为 VIP_FEATURE_REQUIRED（导出下载为会员专属功能）。
 * 与 isQuotaExceededError 同构，供全局 error interceptor 与各调用方 catch 共用。
 */
export function isVipFeatureRequiredError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as Record<string, unknown>).code === VIP_FEATURE_REQUIRED_CODE;
}

/**
 * 导出下载方向（mxweb → 其他格式）预检：VIP 或运行时开关 freeExportDownloadEnabled 已开放时可用。
 * 供各导出入口在发起请求前判断（不发无效请求），后端仍有门控兜底。
 */
export function canExportDownload(
  isVip: boolean,
  freeExportDownloadEnabled: boolean
): boolean {
  return isVip || freeExportDownloadEnabled;
}

/**
 * 导出下载门控提示（预检失败或后端 403 兜底时统一调用）：
 * - 游客：confirm 弹窗引导登录，确认后存储购买意图并跳转登录页，登录成功后自动弹出 VIP 购买弹窗
 * - 登录用户：confirm 后打开 VIP 购买弹窗（PlanSelectOverlay）
 */
export async function handleVipFeatureRequiredError(
  error?: unknown,
  message?: string
): Promise<void> {
  const fallback = t('导出下载为会员专属功能，开通 VIP 后即可使用');
  const msg =
    message ||
    (error && typeof error === 'object'
      ? String((error as Record<string, unknown>).message || fallback)
      : fallback);

  if (!isAuthenticated()) {
    const confirmed = await globalShowConfirm({
      title: t('需要登录'),
      message: t('此功能需要VIP会员，是否前往登录并购买？'),
      confirmText: t('前往登录'),
      cancelText: t('取消'),
    });
    if (!confirmed) return;
    // 存储待办购买意图，登录后自动弹出 VIP 购买弹窗
    sessionStorage.setItem(
      'pendingVipPurchase',
      JSON.stringify({ restrictionKey: EXPORT_DOWNLOAD_FEATURE })
    );
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const confirmed = await globalShowConfirm({
    title: t('需要购买VIP'),
    message: msg,
    confirmText: t('去购买'),
    cancelText: t('取消'),
  });
  if (!confirmed) return;

  // 打开购买弹窗（planSelectStore 监听 QUOTA_GUIDE_EVENT）；reason 用于弹窗内展示引导文案
  window.dispatchEvent(
    new CustomEvent(QUOTA_GUIDE_EVENT, {
      detail: { restrictionKey: EXPORT_DOWNLOAD_FEATURE },
    })
  );
}
