import {
  nodeControllerGetNode,
} from '../api-sdk';
import type { FileSystemNodeDto } from '../api-sdk';
import { getApiBaseUrl } from '../utils/apiConfig';

/**
 * Build mxweb file access URL from file path.
 * Regular files: /api/v1/mxcad/filesData/{path}?t={timestamp}
 * Library files use different base paths (handled outside this function).
 */
export function buildMxwebUrl(filePath: string, revision?: number): string {
  const apiBaseUrl = getApiBaseUrl();
  const baseUrl = (() => {
    try {
      return new URL(apiBaseUrl).origin;
    } catch {
      return '';
    }
  })();
  const timestamp = Date.now();
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const vParam = revision !== undefined ? `&v=${revision}` : '';
  return `${baseUrl}/api/v1/mxcad/filesData/${cleanPath}?t=${timestamp}${vParam}`;
}

/**
 * Get file node info by node ID.
 */
export async function getNodeInfo(nodeId: string): Promise<FileSystemNodeDto> {
  const result = await nodeControllerGetNode({ path: { nodeId } });
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}
