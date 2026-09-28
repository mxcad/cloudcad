import {
  nodeControllerGetNode,
} from '../api-sdk';
import type { FileSystemNodeDto } from '../api-sdk';
import { cachedApiUrl } from '../utils/apiConfig';

/**
 * Build mxweb file access URL from file path.
 * Regular files: /api/v1/mxcad/filesData/{path}?t={timestamp}
 * Library files use different base paths (handled outside this function).
 */
export function buildMxwebUrl(filePath: string, revision?: number): string {
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const url = cachedApiUrl(`/mxcad/filesData/${cleanPath}`);
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
