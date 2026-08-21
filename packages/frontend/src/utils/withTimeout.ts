///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 给 Promise 加超时兜底：超时后 reject，避免请求挂起导致 UI 永久 loading。
 *
 * 背景：@hey-api client 直接使用 fetch，无 AbortController/timeout；
 * react-query 的 retry 只对 reject 生效，挂起的 fetch 永不结束。
 * 列表查询（图纸库/图块库）挂起时 isFetching 永远 true → 分页交互被永久锁死。
 * 这里用 Promise.race 保证在 REQUEST_TIMEOUT_MS 内必然 reject → 交给 react-query 重试/报错。
 */
import { t } from '@/languages';

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(t('请求超时（{ms}ms）', { ms: String(ms) })));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
