import {
  batchDownloadControllerDownloadZip,
  downloadControllerDownloadNodeWithFormat,
  mxcadFileAccessControllerGetFileDownloadExternalRef,
  mxcadFileAccessControllerViewExternalRef,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from './errorHandler';

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseContentDispositionFilename(
  contentDisposition: string | null
): string | null {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export interface DownloadNodeQuery {
  format?: string;
  width?: string;
  height?: string;
  colorPolicy?: string;
  dwgVersion?: string;
}

/** 下载节点文件（download-with-format，支持多格式转换）。失败抛错，由调用方提示具体原因。 */
export async function downloadNodeFile(
  nodeId: string,
  fallbackName: string,
  query?: DownloadNodeQuery
): Promise<boolean> {
  const result = await downloadControllerDownloadNodeWithFormat({
    path: { nodeId },
    query,
  });
  // SDK 默认不抛错：失败时错误在 result.error。抛出让调用方显示后端真实原因
  // （此前返回 false 只显示固定"下载失败"，格式不支持/无权限等原因丢失）
  if (result.error) throw result.error;
  triggerBlobDownload(result.data as Blob, fallbackName);
  return true;
}

/** 下载外部参照文件（download-external-ref）。失败抛错，由调用方决定提示。 */
export async function downloadExternalRefFile(
  nodeId: string,
  fileName: string,
  query: DownloadNodeQuery,
  fallbackName: string
): Promise<void> {
  const result = await mxcadFileAccessControllerGetFileDownloadExternalRef({
    path: { nodeId, fileName },
    query,
  });
  if (result.error) throw result.error;
  triggerBlobDownload(result.data as Blob, fallbackName);
}

export type DownloadBatchZipResult =
  { ok: true } | { ok: false; status: number | undefined };

/** 下载批量任务 zip。非 2xx 返回状态码（调用方保留 404/409 分支语义），不抛错。 */
export async function downloadBatchZip(
  taskId: string
): Promise<DownloadBatchZipResult> {
  try {
    const result = await batchDownloadControllerDownloadZip({
      path: { taskId },
    });
    if (result.error || !result.response?.ok) {
      return { ok: false, status: result.response?.status };
    }
    const filename =
      parseContentDispositionFilename(
        result.response.headers.get('Content-Disposition')
      ) ?? `batch-download-${new Date().toISOString().slice(0, 10)}.zip`;
    triggerBlobDownload(result.data as Blob, filename);
    return { ok: true };
  } catch {
    return { ok: false, status: undefined };
  }
}

/**
 * 带鉴权获取外部参照文件的 blob URL。
 * external-ref-view 端点受 RequireProjectPermissionGuard 保护，
 * <img>/<a> 直接加载无法携带 Bearer token 会 401，必须走 SDK（自动附加 token）。
 * 调用方负责在不再使用时调用 revokeXrefViewBlobUrl 释放。
 */
export async function fetchXrefViewBlobUrl(
  nodeId: string,
  fileName: string
): Promise<string> {
  const result = await mxcadFileAccessControllerViewExternalRef({
    path: { nodeId, fileName },
    // 外部参照可被替换且 URL 不变，禁用 HTTP 缓存，确保替换后查看返回最新文件
    cache: 'no-store',
  });
  // SDK 默认不抛错：失败时错误在 result.error。包装为 Error 并透传后端消息，
  // 调用方现有 err.message 逻辑可直接展示（此前固定"打开外部参照失败"掩盖 403/404 原因）
  if (result.error) {
    throw new Error(getErrorMessage(result.error) || t('打开外部参照失败'));
  }
  return URL.createObjectURL(result.data as Blob);
}

/** 释放 fetchXrefViewBlobUrl 创建的 blob URL（仅 blob: 前缀，普通 URL 直接忽略） */
export function revokeXrefViewBlobUrl(url: string): void {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}
