import {
  fileSystemControllerGetNode,
  fileSystemControllerGetRootNode,
  fileSystemControllerGetPersonalSpace,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
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
  const result = await fileSystemControllerGetNode({ path: { nodeId } });
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}

/**
 * Get root node for a given node.
 */
export async function getRootNode(nodeId: string): Promise<FileSystemNodeDto> {
  const result = await fileSystemControllerGetRootNode({ path: { nodeId } });
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}

/**
 * Get personal space node.
 */
export async function getPersonalSpace(): Promise<FileSystemNodeDto> {
  const result = await fileSystemControllerGetPersonalSpace();
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}

/**
 * Get library drawing node info.
 */
export async function getLibraryDrawingNode(nodeId: string): Promise<FileSystemNodeDto> {
  const result = await libraryControllerGetDrawingNode({ path: { nodeId } });
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}

/**
 * Get library block node info.
 */
export async function getLibraryBlockNode(nodeId: string): Promise<FileSystemNodeDto> {
  const result = await libraryControllerGetBlockNode({ path: { nodeId } });
  if (result.error) throw result.error;
  return result.data as unknown as FileSystemNodeDto;
}
