import { getApiClient } from './apiClient';
import type { SaveMxwebDto } from '../types/api-client';
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

function asFormData<T>(formData: FormData): T {
  return formData as unknown as T;
}

export const libraryApi = {
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
    `${window.location.origin}/api/v1/library/drawing/nodes/${nodeId}/thumbnail`,

  createDrawingFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => getApiClient().LibraryController_createDrawingFolder(null, data),

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
    getApiClient().LibraryController_deleteDrawingNode({
      nodeId,
      permanently,
    }),

  renameDrawingNode: (nodeId: string, name: string) =>
    getApiClient().LibraryController_renameDrawingNode({ nodeId }, { name }),

  moveDrawingNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_moveDrawingNode(
      { nodeId },
      { targetParentId }
    ),

  copyDrawingNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_copyDrawingNode(
      { nodeId },
      { targetParentId }
    ),

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
    `${window.location.origin}/api/v1/library/block/nodes/${nodeId}/thumbnail`,

  createBlockFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => getApiClient().LibraryController_createBlockFolder(null, data),

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
    getApiClient().LibraryController_deleteBlockNode({
      nodeId,
      permanently,
    }),

  renameBlockNode: (nodeId: string, name: string) =>
    getApiClient().LibraryController_renameBlockNode({ nodeId }, { name }),

  moveBlockNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_moveBlockNode(
      { nodeId },
      { targetParentId }
    ),

  copyBlockNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_copyBlockNode(
      { nodeId },
      { targetParentId }
    ),

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
    return getApiClient().LibraryController_saveDrawing(
      { nodeId },
      asFormData<SaveMxwebDto>(formData),
      {
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (onProgress && progressEvent.total) {
            const percentage =
              (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(percentage);
          }
        },
      }
    );
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
    // @ts-expect-error FormData type compatibility issue with generated API client
    return getApiClient().LibraryController_saveDrawingAs(null, formData, {
      onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
        if (onProgress && progressEvent.total) {
          const percentage = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(percentage);
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
    return getApiClient().LibraryController_saveBlock(
      { nodeId },
      asFormData<SaveMxwebDto>(formData),
      {
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (onProgress && progressEvent.total) {
            const percentage =
              (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(percentage);
          }
        },
      }
    );
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
    // @ts-expect-error FormData type compatibility issue with generated API client
    return getApiClient().LibraryController_saveBlockAs(formData, {
      onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
        if (onProgress && progressEvent.total) {
          const percentage = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(percentage);
        }
      },
    });
  },

  createFolder: (
    libraryType: 'drawing' | 'block',
    data: { name: string; parentId?: string; skipIfExists?: boolean }
  ) => {
    if (libraryType === 'drawing') {
      return getApiClient().LibraryController_createDrawingFolder(null, data);
    } else {
      return getApiClient().LibraryController_createBlockFolder(null, data);
    }
  },

  deleteNode: (
    libraryType: 'drawing' | 'block',
    nodeId: string,
    permanently: boolean = true
  ) => {
    if (libraryType === 'drawing') {
      return getApiClient().LibraryController_deleteDrawingNode({
        nodeId,
        permanently,
      });
    } else {
      return getApiClient().LibraryController_deleteBlockNode({
        nodeId,
        permanently,
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
