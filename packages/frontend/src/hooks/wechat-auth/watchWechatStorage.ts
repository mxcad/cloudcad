export const WECHAT_STORAGE_POLL_INTERVAL_MS = 500;
export const WECHAT_STORAGE_POLL_MAX_ATTEMPTS = 60;

export interface WatchWechatStorageOptions {
  storageKey: string;
  intervalMs?: number;
  maxAttempts?: number;
  /** 定时轮询前检查：true 时停止（组件卸载） */
  isCancelled: () => boolean;
  /** 收到新结果（已从 localStorage 移除）时回调 */
  onResult: (raw: string) => void;
}

/**
 * 弹窗结果监听：storage 事件 + 兜底轮询双通道。
 * storage 事件可能因弹窗 close 时序/浏览器限制丢失，定时检查 localStorage 兜底。
 */
export function watchWechatStorage(
  options: WatchWechatStorageOptions
): () => void {
  const {
    storageKey,
    intervalMs = WECHAT_STORAGE_POLL_INTERVAL_MS,
    maxAttempts = WECHAT_STORAGE_POLL_MAX_ATTEMPTS,
    isCancelled,
    onResult,
  } = options;

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === storageKey && e.newValue) {
      // 清理 localStorage（removeItem 本身也会触发 storage 事件，但 newValue 为 null 会被过滤）
      localStorage.removeItem(storageKey);
      onResult(e.newValue);
    }
  };

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let attempts = 0;
  pollTimer = setInterval(() => {
    if (isCancelled()) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      return;
    }
    attempts += 1;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      localStorage.removeItem(storageKey);
      onResult(raw);
    }
    if (attempts >= maxAttempts) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }
  }, intervalMs);

  window.addEventListener('storage', handleStorageChange);
  return () => {
    window.removeEventListener('storage', handleStorageChange);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
}
