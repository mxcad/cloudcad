import {
  nodeControllerGetNode,
} from '../api-sdk';
import type { FileSystemNodeDto } from '../api-sdk';
import { cachedApiUrl } from '../utils/apiConfig';
import { mxwebFilesDataPath } from '../utils/mxwebUrl';

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
