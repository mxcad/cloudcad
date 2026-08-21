import { isAuthenticated } from '@/utils/authCheck';
import { globalShowToast, globalShowConfirm } from '@/utils/notificationEvents';
import { t } from '@/languages';

/** 配额升级引导触发事件（由 planSelectStore 监听并打开选型弹窗） */
export const QUOTA_GUIDE_EVENT = 'cloudcad:quota-guide';

/** 后端配额超限业务错误码（QuotaExceededException 响应 code） */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/**
 * 判断错误是否为 QUOTA_EXCEEDED（配额超限 / 转换频率限制）。
 *
 * 单一事实源：全局 error interceptor（clientSetup.ts）与上传 catch（mxcadOpenFile.ts）
 * 均通过此函数判断，避免 'QUOTA_EXCEEDED' 字面量散落多处、口径漂移。
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as Record<string, unknown>).code === QUOTA_EXCEEDED_CODE;
}

export interface QuotaGuideReason {
  restrictionKey: string;
  current?: number;
  limit?: number;
  need?: number;
}

// 防抖窗口：几秒内同一配额类型重复触发只弹一次升级提醒，避免瞬时连续操作刷屏；
// 窗口过后再次触发仍会弹提醒（如每次创建项目都会提醒）
const DEBOUNCE_MS = 5_000;
/** 登录用户防抖窗口内重复触发时的轻提示间隔（避免批量操作刷屏 toast） */
const TOAST_DEBOUNCE_MS = 30_000;

const lastTriggeredAt = new Map<string, number>();
const lastToastAt = new Map<string, number>();

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export async function handleQuotaExceededError(error: unknown): Promise<void> {
  if (!isQuotaExceededError(error)) return;
  const err = error as Record<string, unknown>;

  const restrictionKey =
    typeof err.restrictionKey === 'string' ? err.restrictionKey : '';
  if (!restrictionKey) return;

  const message =
    typeof err.message === 'string'
      ? err.message
      : t('图纸转换过于频繁，请稍后再试');

  // 游客（未登录）：confirm 弹窗引导登录，确认后存储购买意图并跳转登录页，登录成功后自动弹出 VIP 购买弹窗
  if (!isAuthenticated()) {
    const confirmed = await globalShowConfirm({
      title: t('需要登录'),
      message: t('此功能需要VIP会员，是否前往登录并购买？'),
      confirmText: t('前往登录'),
      cancelText: t('取消'),
    });
    if (!confirmed) return;
    sessionStorage.setItem(
      'pendingVipPurchase',
      JSON.stringify({
        restrictionKey,
        current: toNumber(err.current),
        limit: toNumber(err.limit),
        need: toNumber(err.need),
      })
    );
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  // 登录用户：防抖避免批量操作（如多文件上传）重复弹确认框；
  // 防抖窗口（几秒）内重复触发降级为轻提示，避免完全静默（30s 内只提示一次）。
  const now = Date.now();
  const last = lastTriggeredAt.get(restrictionKey) ?? 0;
  if (now - last < DEBOUNCE_MS) {
    const lastToast = lastToastAt.get(restrictionKey) ?? 0;
    if (now - lastToast >= TOAST_DEBOUNCE_MS) {
      lastToastAt.set(restrictionKey, now);
      globalShowToast(message, 'warning');
    }
    return;
  }
  lastTriggeredAt.set(restrictionKey, now);

  const reason: QuotaGuideReason = {
    restrictionKey,
    current: toNumber(err.current),
    limit: toNumber(err.limit),
    need: toNumber(err.need),
  };

  // 登录用户：先弹确认框，用户确认后才打开 VIP 购买界面
  const confirmed = await globalShowConfirm({
    title: t('需要购买VIP'),
    message,
    confirmText: t('去购买'),
    cancelText: t('取消'),
  });
  if (!confirmed) return;

  window.dispatchEvent(
    new CustomEvent<QuotaGuideReason>(QUOTA_GUIDE_EVENT, { detail: reason })
  );
}
