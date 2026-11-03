import {
  batchDownloadControllerDownloadZip,
  batchDownloadControllerDownloadItem,
  batchDownloadControllerMergeZip,
  batchDownloadControllerGetProgress,
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

/**
 * 触发浏览器直链下载（无 Blob，服务端流式响应）。
 *
 * 「URL 锚点下载」唯一出口（与移动端 triggerUrlDownload 同形）：反馈附件
 * 签名 token 直链等「无鉴权头、URL 自带凭证」的下载统一走这里。
 * 文件名默认由服务端 Content-Disposition 决定；仅当传入非空 filename 才设置
 * download 属性（该属性存在时优先于响应头）。
 */
export function triggerUrlDownload(url: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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

/** 下载外部参照文件（download-external-ref）。失败抛错，由调用方决定提示。 */
export async function downloadExternalRefFile(
  nodeId: string,
  fileName: string,
  query: DownloadNodeQuery,
  fallbackName: string
): Promise<void> {
  const result = await mxcadFileAccessControllerGetFileDownloadExternalRef({
    throwOnError: true,
    path: { nodeId, fileName },
    query,
  });
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
 * 下载 individual 任务的单个产物（index 对应提交时的 file×format 顺序）。
 * 404 = 该项转换失败或产物已清理，调用方跳过并提示，不影响其余项。
 */
export async function downloadBatchItem(
  taskId: string,
  itemIndex: number,
  fallbackName: string
): Promise<DownloadBatchZipResult> {
  try {
    const result = await batchDownloadControllerDownloadItem({
      path: { taskId, itemIndex: String(itemIndex) },
    });
    if (result.error || !result.response?.ok) {
      return { ok: false, status: result.response?.status };
    }
    const filename =
      parseContentDispositionFilename(
        result.response.headers.get('Content-Disposition')
      ) ?? fallbackName;
    triggerBlobDownload(result.data as Blob, filename);
    return { ok: true };
  } catch {
    return { ok: false, status: undefined };
  }
}

/** 合并多个 COMPLETED 任务为单个 ZIP 并触发浏览器下载（单次下载）。非 2xx 返回状态码，不抛错。 */
export async function downloadMergedBatchZip(
  taskIds: string[]
): Promise<DownloadBatchZipResult> {
  try {
    const result = await batchDownloadControllerMergeZip({
      body: { taskIds },
    });
    if (result.error || !result.response?.ok) {
      return { ok: false, status: result.response?.status };
    }
    const filename =
      parseContentDispositionFilename(
        result.response.headers.get('Content-Disposition')
      ) ?? `merged-download-${new Date().toISOString().slice(0, 10)}.zip`;
    triggerBlobDownload(result.data as Blob, filename);
    return { ok: true };
  } catch {
    return { ok: false, status: undefined };
  }
}

export interface BatchTaskProgress {
  ok: boolean;
  status?: string;
  completedCount?: number;
  totalCount?: number;
  errorCount?: number;
}

/** 查询批量任务进度（JSON 轮询用；individual 模式 dialog 内等待转换完成） */
export async function getBatchTaskProgress(
  taskId: string
): Promise<BatchTaskProgress> {
  try {
    const result = await batchDownloadControllerGetProgress({
      path: { taskId },
    });
    if (result.error || !result.response?.ok) {
      return { ok: false };
    }
    const data = result.data as {
      status?: string;
      completedCount?: number;
      totalCount?: number;
      errorCount?: number;
    };
    return {
      ok: true,
      status: data.status,
      completedCount: data.completedCount,
      totalCount: data.totalCount,
      errorCount: data.errorCount,
    };
  } catch {
    return { ok: false };
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
