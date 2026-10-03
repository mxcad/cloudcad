import {
  downloadControllerDownloadNode,
  nodeControllerGetNode,
} from '../api-sdk';
import type { FileSystemNodeDto } from '../api-sdk';
import { cachedApiUrl } from '../utils/apiConfig';
import { mxwebFilesDataPath } from '../utils/mxwebUrl';
import { triggerBlobDownload } from '../utils/download';
import { sanitizeFileName } from '../utils/sanitizeFileName';

/**
 * Build mxweb file access URL from file path.
 * Regular files: /api/v1/mxcad/filesData/{path}?t={timestamp}
 * Library files use different base paths (handled outside this function).
 * path 段走 utils/mxwebUrl 唯一出口；cachedApiUrl 自带 ?t= 缓存打散。
 */
export function buildMxwebUrl(filePath: string, revision?: number): string {
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const url = cachedApiUrl(mxwebFilesDataPath(cleanPath));
  return revision !== undefined ? `${url}&v=${revision}` : url;
}

/**
 * Get file node info by node ID.
 */
export async function getNodeInfo(nodeId: string): Promise<FileSystemNodeDto> {
  const result = await nodeControllerGetNode({ path: { nodeId } });
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}

/**
 * 原格式直接下载单个文件（非 CAD 文件的打开/下载出口，对齐 PC handleDownload 直下分支）。
 *
 * 对照 PC useFileSystemNavigation.handleDownload：downloadNode → blob → 落盘。
 * SDK 默认不抛错：失败时错误在 result.error，不检查会生成损坏文件（PC 同坑注释）。
 */
export async function downloadNodeOriginal(
  nodeId: string,
  fileName: string
): Promise<void> {
  const result = await downloadControllerDownloadNode({
    path: { nodeId },
    parseAs: 'blob',
  });
  if (result.error) throw result.error;
  const blobData = result.data;
  const blob =
    blobData instanceof Blob ? blobData : new Blob([blobData as BlobPart]);
  triggerBlobDownload(blob, sanitizeFileName(fileName));
}
