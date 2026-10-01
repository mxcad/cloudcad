/**
 * API 错误分类谓词——跨端共享的纯判定。
 *
 * 过去 PC `utils/errorHandler.ts` 与移动端 `utils/errorHandler.ts` 各有一套，判定口径不一：
 * - `isAbortError`：PC 认 `isAborted` 标志 + axios `code` + name/message 精确匹配；
 *   移动端认 name + message 子串（更宽）。
 * - `isPermissionError`：移动端认 403（status/statusCode/response.status + `isPermissionError` 标志）；
 *   PC 无同名谓词（`isAuthError` 是 401+403，语义不同，未收，见端包台账）。
 * - `isServerError`：PC 只认 `response.status`；移动端认 status/statusCode/response.status（更宽）。
 *
 * 这里取**并集（更宽判定）**：任一端的命中特征都算命中，避免跨端边界不一致。
 * 纯判定、无文案（文案留端包 `classifyApiError` 等映射）。
 */

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  const s =
    e.status ??
    e.statusCode ??
    (e.response as Record<string, unknown> | undefined)?.status;
  return typeof s === 'number' ? s : undefined;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  if (e.isAborted === true) return true;
  const code = typeof e.code === 'string' ? e.code : '';
  if (code === 'ERR_CANCELED' || code === 'ERR_FR_TXN_CANCELLED') return true;
  const name = String(e.name ?? '');
  const msg = String(e.message ?? '');
  return (
    name === 'AbortError' ||
    name === 'CanceledError' ||
    msg.includes('aborted') ||
    msg.includes('canceled') ||
    msg.includes('ERR_CANCELED')
  );
}

export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  if (e.isPermissionError === true) return true;
  return statusOf(error) === 403;
}

export function isServerError(error: unknown): boolean {
  const status = statusOf(error);
  return typeof status === 'number' && status >= 500 && status < 600;
}
