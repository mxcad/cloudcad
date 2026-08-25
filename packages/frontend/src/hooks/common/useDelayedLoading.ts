import { useEffect, useState } from 'react';

/** 骨架/spinner 防闪烁默认阈值：加载在该时间内完成则完全不显示占位 UI */
export const DEFAULT_LOADING_DELAY_MS = 250;

/**
 * 延迟显示 loading：`loading` 持续 true 超过 `delayMs` 后才返回 true，
 * 提前结束（缓存命中/快速返回）则始终返回 false。
 *
 * 用于骨架屏/spinner 防闪烁——消费方在「delayed 为 false 且 loading 为 true」
 * 的窗口期应渲染空白（而不是提前渲染空态），避免占位 UI 闪现。
 */
export function useDelayedLoading(
  loading: boolean,
  delayMs: number = DEFAULT_LOADING_DELAY_MS
): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [loading, delayMs]);

  return show && loading;
}
