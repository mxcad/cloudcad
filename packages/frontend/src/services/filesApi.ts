///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';
import { API_BASE_URL } from '../config/apiConfig';
import type { OperationMethods } from '../types/api-client';
import type { PdfOptions } from '../components/modals/DownloadFormatModal';

// 本地定义缺失的 DTO 类型
interface UpdateNodeDto {
  name?: string;
  description?: string;
  tags?: string[];
}

interface MoveNodeDto {
  targetParentId: string;
}

interface CopyNodeDto {
  targetParentId: string;
}

interface CreateFolderDto {
  name: string;
}

export const filesApi = {
  list: () => getApiClient().FileSystemController_getProjects(),

  get: (id: string) =>
    getApiClient().FileSystemController_getNode({ nodeId: id }),

  download: (id: string) =>
    getApiClient().FileSystemController_downloadNode({ nodeId: id }, null, {
      responseType: 'blob',
    }),

  downloadWithFormat: (
    id: string,
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: PdfOptions
  ) => {
    type DownloadParams = Parameters<
      OperationMethods['FileSystemController_downloadNodeWithFormat']
    >[0];
    const params: DownloadParams = {
      nodeId: id,
      format,
      ...(pdfOptions?.width && { width: pdfOptions.width }),
      ...(pdfOptions?.height && { height: pdfOptions.height }),
      ...(pdfOptions?.colorPolicy && { colorPolicy: pdfOptions.colorPolicy }),
    };
    return getApiClient().FileSystemController_downloadNodeWithFormat(
      params,
      null,
      { responseType: 'blob' }
    );
  },

  update: (id: string, data: UpdateNodeDto) =>
    getApiClient().FileSystemController_updateNode({ nodeId: id }, data),

  delete: (id: string, permanent?: boolean) =>
    getApiClient().FileSystemController_deleteNode(
      permanent !== undefined
        ? { nodeId: id, permanently: permanent }
        : { nodeId: id, permanently: false }
    ),

  createFolder: (parentId: string, data: CreateFolderDto) =>
    getApiClient().FileSystemController_createFolder({ parentId }, data),

  moveNode: (id: string, data: MoveNodeDto) =>
    getApiClient().FileSystemController_moveNode({ nodeId: id }, data),

  copyNode: (id: string, data: CopyNodeDto) =>
    getApiClient().FileSystemController_copyNode({ nodeId: id }, data),

  /** 获取根节点 */
  getRoot: (nodeId: string) =>
    getApiClient().FileSystemController_getRootNode({ nodeId }),

  /** 获取文件缩略图 URL */
  getThumbnailUrl: (nodeId: string): string => {
    return `${API_BASE_URL}/v1/file-system/nodes/${nodeId}/thumbnail`;
  },
};
