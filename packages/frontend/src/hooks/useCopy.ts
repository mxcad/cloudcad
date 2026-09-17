/**
 * 复制交互的唯一封装。
 *
 * 统一三件事，调用侧不用再各自实现：
 * 1. 降级链调用（`lib/clipboard.ts`）
 * 2. 成功/失败 toast（失败不再静默，也不再谎报成功）
 * 3. 「已复制」按钮态的计时与复位
 *
 * `copiedMarker` 让一个页面里多个复制按钮互不串台：只让 marker 匹配的那个按钮
 * 显示「已复制」。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { globalShowToast } from '@/utils/notificationEvents';

export interface UseCopyOptions {
  successMessage?: string;
  failMessage?: string;
  /** 「已复制」态持续时长，默认 2000ms */
  duration?: number;
  /** 两级降级都失败时的兜底动作，例如聚焦 readonly 输入框让用户手动复制。 */
  onUnrecoverable?: (text: string) => void;
}

export interface UseCopyResult {
  copied: boolean;
  copiedMarker: string | null;
  copy: (text: string, marker?: string) => Promise<boolean>;
  reset: () => void;
}

const DEFAULT_DURATION_MS = 2000;

export function useCopy(options: UseCopyOptions = {}): UseCopyResult {
  const {
    successMessage,
    failMessage,
    duration = DEFAULT_DURATION_MS,
    onUnrecoverable,
  } = options;

  const [copied, setCopied] = useState(false);
  const [copiedMarker, setCopiedMarker] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCopied = useCallback(
    (marker?: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      setCopiedMarker(marker ?? null);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
        setCopiedMarker(null);
      }, duration);
    },
    [duration],
  );

  const copy = useCallback(
    async (text: string, marker?: string): Promise<boolean> => {
      const result = await copyText(text);

      if (result === 'failed') {
        if (failMessage) globalShowToast(failMessage, 'error');
        onUnrecoverable?.(text);
        return false;
      }

      if (successMessage) globalShowToast(successMessage, 'success');
      markCopied(marker);
      return true;
    },
    [successMessage, failMessage, onUnrecoverable, markCopied],
  );

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCopied(false);
    setCopiedMarker(null);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { copied, copiedMarker, copy, reset };
}
