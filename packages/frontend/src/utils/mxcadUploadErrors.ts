/**
 * MxCAD 上传错误定义与 SDK 错误断言。
 *
 * @hey-api 全局 throwOnError=false：非 2xx（如 403 QUOTA_EXCEEDED）不抛错，
 * 而是返回 { error, ... }。若吞掉错误，上传流程会误判成功并继续打开预设 mxweb URL。
 * 这里统一提取错误并抛出，让调用方 catch 到真实的业务错误。
 */

import { t } from '@/languages';

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
 * fetch 层网络失败的特征文案。浏览器实现不同，只能靠 message 匹配：
 * - Chromium（undici 系）：'Failed to fetch'
 * - WebKit / 旧 Safari：'Load failed'
 * - 部分环境：'NetworkError when attempting to fetch resource.'
 */
const NETWORK_ERROR_HINTS = [
  'failed to fetch',
  'load failed',
  'networkerror when attempting',
  'network request failed',
];

/**
 * SDK 调用结果错误断言：结果对象含 error 字段时抛出 MxCadUploadError。
 * @param result SDK 调用返回值（{ data } 或 { error, response }）
 * @param fallbackMessage 后端未返回 message 时的兜底文案（业务校验类）
 * @param fileName 关联的上传文件名（可选）
 */
export function throwOnSdkError(
  result: unknown,
  fallbackMessage: string,
  fileName?: string
): void {
  if (
    !result ||
    typeof result !== 'object' ||
    !('error' in result) ||
    !(result as { error?: unknown }).error
  ) {
    return;
  }

  const { error, response } = result as {
    error: unknown;
    response?: unknown;
  };

  const statusCode =
    response && typeof response === 'object' && 'status' in response
      ? typeof (response as { status?: unknown }).status === 'number'
        ? (response as { status: number }).status
        : undefined
      : undefined;

  const obj =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : undefined;
  const details: SdkErrorDetails = {
    code: typeof obj?.code === 'string' ? obj.code : undefined,
    restrictionKey:
      typeof obj?.restrictionKey === 'string' ? obj.restrictionKey : undefined,
    current: typeof obj?.current === 'number' ? obj.current : undefined,
    limit: typeof obj?.limit === 'number' ? obj.limit : undefined,
    need: typeof obj?.need === 'number' ? obj.need : undefined,
  };

  // SDK error 字段有三种形态（见 client.gen.ts 的非 2xx 分支
  // `throw jsonError ?? textError`）：Error（fetch 自身失败）、字符串
  // （非 JSON 响应体）、对象（后端 JSON 错误体）
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof obj?.message === 'string'
          ? obj.message
          : undefined;

  const isServerError = statusCode !== undefined && statusCode >= 500;
  const isNetworkError =
    error instanceof Error &&
    NETWORK_ERROR_HINTS.some((hint) =>
      error.message.toLowerCase().includes(hint)
    );

  let message: string;
  if (isNetworkError) {
    message = t('网络连接异常，请检查网络或稍后重试');
  } else if (isServerError) {
    // 5xx 是服务端/代理层故障：后端异常文案不一定是面向用户的本地化文案，
    // 统一给可读兜底，原始信息留在下面的控制台日志里
    message = t('服务器繁忙，请稍后重试');
  } else if (typeof error === 'string') {
    // 非 JSON 响应体（网关/反向代理的纯文本，如 nginx 错误页）不是面向用户的文案
    message = fallbackMessage;
  } else {
    message = detail || fallbackMessage;
  }

  if (detail && message !== detail) {
    // 原始文案被兜底文案替换：细节只进控制台，避免用户看到
    // 「Proxy Error: connect ECONNREFUSED 127.0.0.1:3001」这类中间层信息
    console.error('[MxCAD 上传] 接口异常', {
      statusCode,
      code: details.code,
      detail,
    });
  }

  throw new MxCadUploadError(message, fileName, details);
}
