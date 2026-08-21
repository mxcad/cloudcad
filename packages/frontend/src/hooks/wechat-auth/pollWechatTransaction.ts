import { authControllerPollWechatTransaction } from '@/api-sdk';

export const WECHAT_POLL_INTERVAL_MS = 2000;
export const WECHAT_POLL_MAX_ATTEMPTS = 60;

export interface WechatTxnPollResult {
  status: string;
  action?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
  tempToken?: string;
  error?: string;
  /** 注销冷静期内登录自动恢复成功标记（账户已自动取消注销） */
  restored?: boolean;
  /** 登录失败业务错误码（如 ACCOUNT_DEACTIVATED），据码分流弹客服框 */
  errorCode?: string;
  graceDays?: number;
  cleanupDays?: number;
}

export interface PollWechatTransactionOptions {
  txn: string;
  intervalMs?: number;
  maxAttempts?: number;
  /** 每次轮询开始与 API 返回后检查：true 时立即停止（组件卸载 / 已消费去重） */
  isCancelled: () => boolean;
  /** status === 'completed' 时回调；返回 'consumed' 停止轮询，'ignored' 继续 */
  onComplete: (result: WechatTxnPollResult) => 'consumed' | 'ignored';
  /** 超时（maxAttempts 用尽且未取消）回调 */
  onTimeout: () => void;
}

/**
 * 微信事务轮询（登录 / 绑定 / 解绑共用）。
 * 轮询间隔与超时次数（2s × 60）为行为对照清单固定项，不得修改。
 */
export function pollWechatTransaction(
  options: PollWechatTransactionOptions
): () => void {
  const {
    txn,
    intervalMs = WECHAT_POLL_INTERVAL_MS,
    maxAttempts = WECHAT_POLL_MAX_ATTEMPTS,
    isCancelled,
    onComplete,
    onTimeout,
  } = options;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };

  void (async () => {
    for (let i = 0; i < maxAttempts; i++) {
      if (cancelled || isCancelled()) return;
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const { data } = await authControllerPollWechatTransaction({
          query: { txn },
        });
        if (cancelled || isCancelled()) return;
        const result = data as unknown as WechatTxnPollResult;
        if (result?.status !== 'completed') continue;
        if (onComplete(result) === 'consumed') return;
      } catch {
        // 网络/服务异常：保持轮询（旧行为）
      }
    }
    if (!cancelled && !isCancelled()) onTimeout();
  })();

  return cancel;
}
