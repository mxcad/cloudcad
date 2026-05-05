// @deprecated Use @/api-sdk directly instead.
import type { SaveMxwebDto } from '../types/api-client';
import { client } from '@/api-sdk/client.gen';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingChildren,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetDrawingNode,
  libraryControllerDownloadDrawingNode,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockChildren,
  libraryControllerGetBlockAllFiles,
  libraryControllerGetBlockNode,
  libraryControllerDownloadBlockNode,
  mxCadControllerCheckFileExist,
  mxCadControllerCheckChunkExist,
  mxCadControllerUploadFile,
} from '@/api-sdk';

type Client = typeof client;

// Helper: raw client proxy typed via SDK Client for endpoint calls not covered by generated functions
interface RawClient extends Client {
  post: <T>(url: string, options?: Record<string, unknown>) => Promise<T>;
  delete: <T>(url: string, options?: Record<string, unknown>) => Promise<T>;
  patch: <T>(url: string, options?: Record<string, unknown>) => Promise<T>;
  put: <T>(url: string, options?: Record<string, unknown>) => Promise<T>;
}
const rawClient = client as unknown as RawClient;

const LIBRARY_API = '/api/v1/library';

export const libraryApi = {
  // ── Drawing (read) ──────────────────────────────────────────────
  getDrawingLibrary: () => libraryControllerGetDrawingLibrary(),

  getDrawingChildren: (
    nodeId: string,
    query?: {
      search?: string;
      nodeType?: 'folder' | 'file';
      extension?: string;
      fileStatus?:
        | 'UPLOADING'
        | 'PROCESSING'
        | 'COMPLETED'
        | 'FAILED'
        | 'DELETED';
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includeDeleted?: boolean;
    }
  ) =>
    libraryControllerGetDrawingChildren({ path: { nodeId }, query }),

  getDrawingAllFiles: (
    nodeId: string,
    query?: {
      search?: string;
      extension?: string;
      fileStatus?:
        | 'UPLOADING'
        | 'PROCESSING'
        | 'COMPLETED'
        | 'FAILED'
        | 'DELETED';
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includeDeleted?: boolean;
    }
  ) =>
    libraryControllerGetDrawingAllFiles({ path: { nodeId }, query }),

  getDrawingNode: (nodeId: string) =>
    libraryControllerGetDrawingNode({ path: { nodeId } }),

  downloadDrawingNode: (nodeId: string) =>
    libraryControllerDownloadDrawingNode(
      { path: { nodeId } },
      undefined,
      {
        responseType: 'blob',
      }
    ),

  getDrawingThumbnailUrl: (nodeId: string) =>
    `${window.location.origin}${LIBRARY_API}/drawing/nodes/${nodeId}/thumbnail`,

  // ── Drawing (write) ─────────────────────────────────────────────
  createDrawingFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => rawClient.post(`${LIBRARY_API}/drawing/folders`, { body: data }),

  uploadDrawingChunk: (formData: FormData) =>
    mxCadControllerUploadFile({ body: formData as never }),

  checkDrawingFileExist: (data: {
    fileSize: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxCadControllerCheckFileExist({ body: data }),

  checkDrawingChunkExist: (data: {
    chunk: number;
    chunks: number;
    size: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxCadControllerCheckChunkExist({ body: data }),

  deleteDrawingNode: (nodeId: string, permanently: boolean = true) =>
    rawClient.delete(`${LIBRARY_API}/drawing/nodes/${nodeId}`, {
      body: { permanently },
    }),

  renameDrawingNode: (nodeId: string, name: string) =>
    rawClient.patch(`${LIBRARY_API}/drawing/nodes/${nodeId}`, {
      body: { name },
    }),

  moveDrawingNode: (nodeId: string, targetParentId: string) =>
    rawClient.post(`${LIBRARY_API}/drawing/nodes/${nodeId}/move`, {
      body: { targetParentId },
    }),

  copyDrawingNode: (nodeId: string, targetParentId: string) =>
    rawClient.post(`${LIBRARY_API}/drawing/nodes/${nodeId}/copy`, {
      body: { targetParentId },
    }),

  // ── Block (read) ────────────────────────────────────────────────
  getBlockLibrary: () => libraryControllerGetBlockLibrary(),

  getBlockChildren: (
    nodeId: string,
    query?: {
      search?: string;
      nodeType?: 'folder' | 'file';
      extension?: string;
      fileStatus?:
        | 'UPLOADING'
        | 'PROCESSING'
        | 'COMPLETED'
        | 'FAILED'
        | 'DELETED';
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includeDeleted?: boolean;
    }
  ) => libraryControllerGetBlockChildren({ path: { nodeId }, query }),

  getBlockAllFiles: (
    nodeId: string,
    query?: {
      search?: string;
      extension?: string;
      fileStatus?:
        | 'UPLOADING'
        | 'PROCESSING'
        | 'COMPLETED'
        | 'FAILED'
        | 'DELETED';
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      includeDeleted?: boolean;
    }
  ) => libraryControllerGetBlockAllFiles({ path: { nodeId }, query }),

  getBlockNode: (nodeId: string) =>
    libraryControllerGetBlockNode({ path: { nodeId } }),

  downloadBlockNode: (nodeId: string) =>
    libraryControllerDownloadBlockNode({ path: { nodeId } }, undefined, {
      responseType: 'blob',
    }),

  getBlockThumbnailUrl: (nodeId: string) =>
    `${window.location.origin}${LIBRARY_API}/block/nodes/${nodeId}/thumbnail`,

  // ── Block (write) ───────────────────────────────────────────────
  createBlockFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => rawClient.post(`${LIBRARY_API}/block/folders`, { body: data }),

  uploadBlockChunk: (formData: FormData) =>
    mxCadControllerUploadFile({ body: formData as never }),

  checkBlockFileExist: (data: {
    fileSize: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxCadControllerCheckFileExist({ body: data }),

  checkBlockChunkExist: (data: {
    chunk: number;
    chunks: number;
    size: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxCadControllerCheckChunkExist({ body: data }),

  deleteBlockNode: (nodeId: string, permanently: boolean = true) =>
    rawClient.delete(`${LIBRARY_API}/block/nodes/${nodeId}`, {
      body: { permanently },
    }),

  renameBlockNode: (nodeId: string, name: string) =>
    rawClient.patch(`${LIBRARY_API}/block/nodes/${nodeId}`, {
      body: { name },
    }),

  moveBlockNode: (nodeId: string, targetParentId: string) =>
    rawClient.post(`${LIBRARY_API}/block/nodes/${nodeId}/move`, {
      body: { targetParentId },
    }),

  copyBlockNode: (nodeId: string, targetParentId: string) =>
    rawClient.post(`${LIBRARY_API}/block/nodes/${nodeId}/copy`, {
      body: { targetParentId },
    }),

  // ── Save ────────────────────────────────────────────────────────
  saveDrawing: (
    nodeId: string,
    file: Blob,
    onProgress?: (percentage: number) => void
  ) => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], 'drawing.mxweb', {
        type: 'application/octet-stream',
      })
    );
    return rawClient.post(`${LIBRARY_API}/drawing/savemxweb/${nodeId}`, {
      body: formData as unknown as SaveMxwebDto,
      onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
        if (onProgress && progressEvent.total) {
          onProgress((progressEvent.loaded / progressEvent.total) * 100);
        }
      },
    });
  },

  saveDrawingAs: (
    file: Blob,
    targetParentId: string,
    fileName: string,
    onProgress?: (percentage: number) => void
  ) => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], fileName + '.mxweb', {
        type: 'application/octet-stream',
      })
    );
    formData.append('targetParentId', targetParentId);
    formData.append('fileName', fileName);
    return rawClient.post(`${LIBRARY_API}/drawing/save-as`, {
      body: formData,
      onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
        if (onProgress && progressEvent.total) {
          onProgress((progressEvent.loaded / progressEvent.total) * 100);
        }
      },
    });
  },

  saveBlock: (
    nodeId: string,
    file: Blob,
    onProgress?: (percentage: number) => void
  ) => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], 'block.mxweb', {
        type: 'application/octet-stream',
      })
    );
    return rawClient.post(`${LIBRARY_API}/block/savemxweb/${nodeId}`, {
      body: formData as unknown as SaveMxwebDto,
      onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
        if (onProgress && progressEvent.total) {
          onProgress((progressEvent.loaded / progressEvent.total) * 100);
        }
      },
    });
  },

  saveBlockAs: (
    file: Blob,
    targetParentId: string,
    fileName: string,
    onProgress?: (percentage: number) => void
  ) => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], fileName + '.mxweb', {
        type: 'application/octet-stream',
      })
    );
    formData.append('targetParentId', targetParentId);
    formData.append('fileName', fileName);
    return rawClient.post(`${LIBRARY_API}/block/save-as`, {
      body: formData,
      onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
        if (onProgress && progressEvent.total) {
          onProgress((progressEvent.loaded / progressEvent.total) * 100);
        }
      },
    });
  },

  // ── Generic helpers (type-dispatched) ───────────────────────────
  createFolder: (
    libraryType: 'drawing' | 'block',
    data: { name: string; parentId?: string; skipIfExists?: boolean }
  ) => {
    if (libraryType === 'drawing') {
      return rawClient.post(`${LIBRARY_API}/drawing/folders`, { body: data });
    } else {
      return rawClient.post(`${LIBRARY_API}/block/folders`, { body: data });
    }
  },

  deleteNode: (
    libraryType: 'drawing' | 'block',
    nodeId: string,
    permanently: boolean = true
  ) => {
    if (libraryType === 'drawing') {
      return rawClient.delete(`${LIBRARY_API}/drawing/nodes/${nodeId}`, {
        body: { permanently },
      });
    } else {
      return rawClient.delete(`${LIBRARY_API}/block/nodes/${nodeId}`, {
        body: { permanently },
      });
    }
  },

  getChildren: (
    libraryType: 'drawing' | 'block',
    nodeId: string,
    query?: Record<string, unknown>
  ) => {
    if (libraryType === 'drawing') {
      return libraryControllerGetDrawingChildren({
        path: { nodeId },
        query,
      });
    } else {
      return libraryControllerGetBlockChildren({
        path: { nodeId },
        query,
      });
    }
  },
};