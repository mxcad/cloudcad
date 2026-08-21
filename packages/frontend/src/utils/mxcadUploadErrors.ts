/**
 * MxCAD 上传错误定义与 SDK 错误断言。
 *
 * @hey-api 全局 throwOnError=false：非 2xx（如 403 QUOTA_EXCEEDED）不抛错，
 * 而是返回 { error, ... }。若吞掉错误，上传流程会误判成功并继续打开预设 mxweb URL。
 * 这里统一提取错误并抛出，让调用方 catch 到真实的业务错误。
 */

/** SDK 业务错误中的配额字段（与后端 QuotaExceededException 响应结构对齐） */
export interface SdkErrorDetails {
  code?: string;
  restrictionKey?: string;
  current?: number;
  limit?: number;
  need?: number;
}

/**
 * MxCAD 文件上传错误
 */
export class MxCadUploadError extends Error {
  readonly code?: string;
  readonly restrictionKey?: string;
  readonly current?: number;
  readonly limit?: number;
  readonly need?: number;

  constructor(
    message: string,
    public readonly fileName?: string,
    details?: SdkErrorDetails
  ) {
    super(message);
    this.name = 'MxCadUploadError';
    if (details?.code !== undefined) this.code = details.code;
    if (details?.restrictionKey !== undefined)
      this.restrictionKey = details.restrictionKey;
    if (details?.current !== undefined) this.current = details.current;
    if (details?.limit !== undefined) this.limit = details.limit;
    if (details?.need !== undefined) this.need = details.need;
  }
}

/**
 * SDK 调用结果错误断言：结果对象含 error 字段时抛出 MxCadUploadError。
 * @param result SDK 调用返回值（{ data } 或 { error }）
 * @param fallbackMessage 后端未返回 message 时的兜底文案
 * @param fileName 关联的上传文件名（可选）
 */
export function throwOnSdkError(
  result: unknown,
  fallbackMessage: string,
  fileName?: string
): void {
  if (
    result &&
    typeof result === 'object' &&
    'error' in result &&
    (result as { error?: unknown }).error
  ) {
    const err = (result as { error: unknown }).error as Record<string, unknown>;
    const message =
      typeof err?.message === 'string' && err.message
        ? err.message
        : fallbackMessage;
    const details: SdkErrorDetails = {
      code: typeof err?.code === 'string' ? err.code : undefined,
      restrictionKey:
        typeof err?.restrictionKey === 'string'
          ? err.restrictionKey
          : undefined,
      current: typeof err?.current === 'number' ? err.current : undefined,
      limit: typeof err?.limit === 'number' ? err.limit : undefined,
      need: typeof err?.need === 'number' ? err.need : undefined,
    };
    throw new MxCadUploadError(message, fileName, details);
  }
}
