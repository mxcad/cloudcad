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

// @deprecated Use @/api-sdk instead.
import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetNode,
  fileSystemControllerDownloadNode,
  fileSystemControllerDownloadNodeWithFormat,
  fileSystemControllerUpdateNode,
  fileSystemControllerDeleteNode,
  fileSystemControllerCreateFolder,
  fileSystemControllerMoveNode,
  fileSystemControllerCopyNode,
  fileSystemControllerGetRootNode,
} from '@/api-sdk';
import type { PdfOptions } from '../components/modals/DownloadFormatModal';

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
  list: () => fileSystemControllerGetProjects(),

  get: (id: string) =>
    fileSystemControllerGetNode({ path: { nodeId: id } }),

  download: (id: string) =>
    fileSystemControllerDownloadNode({ path: { nodeId: id } }),

  downloadWithFormat: (
    id: string,
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: PdfOptions
  ) => {
    const params: {
      path: { nodeId: string; format: string };
      query?: { width?: number; height?: number; colorPolicy?: string };
    } = {
      path: {
        nodeId: id,
        format,
      },
    };
    if (pdfOptions?.width) {
      params.query = { width: pdfOptions.width };
    }
    if (pdfOptions?.height) {
      params.query = { ...params.query, height: pdfOptions.height };
    }
    if (pdfOptions?.colorPolicy) {
      params.query = { ...params.query, colorPolicy: pdfOptions.colorPolicy };
    }
    return fileSystemControllerDownloadNodeWithFormat(params as any);
  },

  update: (id: string, data: UpdateNodeDto) =>
    fileSystemControllerUpdateNode({ path: { nodeId: id }, body: data }),

  delete: (id: string, permanent?: boolean) =>
    fileSystemControllerDeleteNode({
      path: { nodeId: id },
      query: { permanently: permanent ?? false },
    }),

  createFolder: (parentId: string, data: CreateFolderDto) =>
    fileSystemControllerCreateFolder({
      path: { parentId },
      body: data,
    }),

  moveNode: (id: string, data: MoveNodeDto) =>
    fileSystemControllerMoveNode({ path: { nodeId: id }, body: data }),

  copyNode: (id: string, data: CopyNodeDto) =>
    fileSystemControllerCopyNode({ path: { nodeId: id }, body: data }),

  getRoot: (nodeId: string) =>
    fileSystemControllerGetRootNode({ path: { nodeId } }),
};