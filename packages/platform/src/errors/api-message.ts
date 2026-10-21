/**
 * 从 SDK 抛出的 API 错误里提取可读文案与字段级明细——跨端共享的纯提取。
 *
 * 后端统一返回 `{ code, message, errors, timestamp, path, method }`（GlobalExceptionFilter），
 * openapi-ts 在 `!response.ok` 时直接 `throw jsonError`——抛的是**普通对象，不是 Error**。
 * 两端旧的取法都漏信息：
 * - PC `errorHandler.ts` 读 `message` 拿到的是后端已翻译的文案，但丢掉 `errors[]`
 *   （字段级原因）→ 用户只看到「请求参数验证失败」，不知道改哪个字段；
 * - 移动端 `error instanceof Error` 恒为 false → 一律退回「未知错误」。
 *
 * 纯提取、无文案：兜底文案与分隔符留在端包（`getErrorMessage` / `classifyApiError`），
 * 那是有语言倾向的展示细节。
 */

export interface ApiErrorDetail {
  /** 顶层文案（后端已按 Accept-Language 翻译） */
  message: string;
  /** 字段级明细：`字段名: 约束原因`（无则为空数组） */
  fields: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function extractApiError(error: unknown): ApiErrorDetail {
  const record = asRecord(error);
  const message = record ? record.message : undefined;
  const fields = fieldDetails(record ? record.errors : undefined);

  if (Array.isArray(message)) {
    return {
      message: message.filter((item) => typeof item === 'string').join(' '),
      fields,
    };
  }
  if (typeof message === 'string' && message.trim()) {
    return { message: message.trim(), fields };
  }
  if (typeof error === 'string' && error.trim()) {
    return { message: error.trim(), fields };
  }
  return { message: '', fields: [] };
}

function fieldDetails(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  const fields: string[] = [];
  for (const entry of errors) {
    const item = asRecord(entry);
    if (!item) continue;
    const name = typeof item.field === 'string' ? item.field.trim() : '';
    const reason = typeof item.message === 'string' ? item.message.trim() : '';
    if (!reason) continue;
    fields.push(name ? `${name}: ${reason}` : reason);
  }
  return fields;
}
