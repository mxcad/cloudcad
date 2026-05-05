// @deprecated Use @/api-sdk instead.
// @ts-nocheck
import { getApiClient } from './apiClient';
import { mxcadApi } from './mxcadApi';
import type { SaveMxwebDto } from '../types/api-client';

/**
 * 将 FormData 转换为 API 客户端期望的请求体类型
 * OpenAPI 生成的 multipart/form-data 类型定义不精确，需要类型转换
 */
function asFormData<T>(formData: FormData): T {
  return formData as unknown as T;
}

/**
 * 公共资源库 API
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目
 * - 上传逻辑完全复用 MxCAD 的分片上传方案
 * - 读操作：公开访问（无需登录）
 * - 写操作：需要管理员权限
 */
export const libraryApi = {
  // ========== 图纸库接口 ==========

  /**
   * 获取图纸库详情
   */
  getDrawingLibrary: () => getApiClient().LibraryController_getDrawingLibrary(),

  /**
   * 获取图纸库子节点列表
   */
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
    getApiClient().LibraryController_getDrawingChildren({ nodeId, ...query }),

  /**
   * 递归获取图纸库节点下的所有文件（包括子目录）
   */
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
    getApiClient().LibraryController_getDrawingAllFiles({ nodeId, ...query }),

  /**
   * 获取图纸库节点详情
   */
  getDrawingNode: (nodeId: string) =>
    getApiClient().LibraryController_getDrawingNode({ nodeId }),

  /**
   * 下载图纸库文件
   */
  downloadDrawingNode: (nodeId: string) =>
    getApiClient().LibraryController_downloadDrawingNode(
      { nodeId },
      undefined,
      {
        responseType: 'blob',
      }
    ),

  /**
   * 获取图纸库文件缩略图 URL
   */
  getDrawingThumbnailUrl: (nodeId: string) =>
    `${window.location.origin}/api/v1/library/drawing/nodes/${nodeId}/thumbnail`,

  /**
   * 创建图纸库文件夹
   */
  createDrawingFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => getApiClient().LibraryController_createDrawingFolder(null, data),

  /**
   * 上传图纸库文件（分片上传，复用 MxCAD API）
   */
  uploadDrawingChunk: (formData: FormData) => mxcadApi.uploadChunk(formData),

  /**
   * 检查文件是否存在（秒传，复用 MxCAD API）
   */
  checkDrawingFileExist: (data: {
    fileSize: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxcadApi.checkFileExist(data),

  /**
   * 检查分片是否存在（复用 MxCAD API）
   */
  checkDrawingChunkExist: (data: {
    chunk: number;
    chunks: number;
    size: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxcadApi.checkChunkExist(data),

  /**
   * 删除图纸库节点（永久删除）
   */
  deleteDrawingNode: (nodeId: string, permanently: boolean = true) =>
    getApiClient().LibraryController_deleteDrawingNode({
      nodeId,
      permanently,
    }),

  /**
   * 重命名图纸库节点
   */
  renameDrawingNode: (nodeId: string, name: string) =>
    getApiClient().LibraryController_renameDrawingNode({ nodeId }, { name }),

  /**
   * 移动图纸库节点
   */
  moveDrawingNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_moveDrawingNode(
      { nodeId },
      { targetParentId }
    ),

  /**
   * 复制图纸库节点
   */
  copyDrawingNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_copyDrawingNode(
      { nodeId },
      { targetParentId }
    ),

  // ========== 图块库接口 ==========

  /**
   * 获取图块库详情
   */
  getBlockLibrary: () => getApiClient().LibraryController_getBlockLibrary(),

  /**
   * 获取图块库子节点列表
   */
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
  ) => getApiClient().LibraryController_getBlockChildren({ nodeId, ...query }),

  /**
   * 递归获取图块库节点下的所有文件（包括子目录）
   */
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
  ) => getApiClient().LibraryController_getBlockAllFiles({ nodeId, ...query }),

  /**
   * 获取图块库节点详情
   */
  getBlockNode: (nodeId: string) =>
    getApiClient().LibraryController_getBlockNode({ nodeId }),

  /**
   * 下载图块库文件
   */
  downloadBlockNode: (nodeId: string) =>
    getApiClient().LibraryController_downloadBlockNode({ nodeId }, undefined, {
      responseType: 'blob',
    }),

  /**
   * 获取图块库文件缩略图 URL
   */
  getBlockThumbnailUrl: (nodeId: string) =>
    `${window.location.origin}/api/v1/library/block/nodes/${nodeId}/thumbnail`,

  /**
   * 创建图块库文件夹
   */
  createBlockFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => getApiClient().LibraryController_createBlockFolder(null, data),

  /**
   * 上传图块库文件（分片上传，复用 MxCAD API）
   */
  uploadBlockChunk: (formData: FormData) => mxcadApi.uploadChunk(formData),

  /**
   * 检查文件是否存在（秒传，复用 MxCAD API）
   */
  checkBlockFileExist: (data: {
    fileSize: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxcadApi.checkFileExist(data),

  /**
   * 检查分片是否存在（复用 MxCAD API）
   */
  checkBlockChunkExist: (data: {
    chunk: number;
    chunks: number;
    size: number;
    fileHash: string;
    filename: string;
    nodeId: string;
  }) => mxcadApi.checkChunkExist(data),

  /**
   * 删除图块库节点（永久删除）
   */
  deleteBlockNode: (nodeId: string, permanently: boolean = true) =>
    getApiClient().LibraryController_deleteBlockNode({
      nodeId,
      permanently,
    }),

  /**
   * 重命名图块库节点
   */
  renameBlockNode: (nodeId: string, name: string) =>
    getApiClient().LibraryController_renameBlockNode({ nodeId }, { name }),

  /**
   * 移动图块库节点
   */
  moveBlockNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_moveBlockNode(
      { nodeId },
      { targetParentId }
    ),

  /**
   * 复制图块库节点
   */
  copyBlockNode: (nodeId: string, targetParentId: string) =>
    getApiClient().LibraryController_copyBlockNode(
      { nodeId },
      { targetParentId }
    ),

  // ========== 保存/另存为接口 ==========

  /**
   * 保存图纸到图纸库（覆盖现有文件）
   */
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
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentage =
              (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(percentage);
          }
        },
      }
    );
  },

  /**
   * 另存为图纸到图纸库
   */
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

  /**
   * 保存图块到图块库（覆盖现有文件）
   */
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
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentage =
              (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(percentage);
          }
        },
      }
    );
  },

  /**
   * 另存为图块到图块库
   */
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

  // ========== 统一接口 ==========

  /**
   * 创建文件夹（统一接口，支持 skipIfExists）
   */
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

  /**
   * 删除节点（统一接口）
   */
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

  /**
   * 获取子节点列表（统一接口）
   */
  getChildren: (
    libraryType: 'drawing' | 'block',
    nodeId: string,
    query?: Record<string, unknown>
  ) => {
    if (libraryType === 'drawing') {
      return getApiClient().LibraryController_getDrawingChildren({
        nodeId,
        ...query,
      });
    } else {
      return getApiClient().LibraryController_getBlockChildren({
        nodeId,
        ...query,
      });
    }
  },
};
