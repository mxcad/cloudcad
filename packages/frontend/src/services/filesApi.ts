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
import type { CadDownloadFormat } from '@/api-sdk';
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
    format: CadDownloadFormat,
    pdfOptions?: PdfOptions
  ) => {
    const query: { format?: CadDownloadFormat; width?: unknown; height?: unknown; colorPolicy?: unknown } = { format };
    if (pdfOptions?.width) {
      query.width = Number(pdfOptions.width);
    }
    if (pdfOptions?.height) {
      query.height = Number(pdfOptions.height);
    }
    if (pdfOptions?.colorPolicy) {
      query.colorPolicy = pdfOptions.colorPolicy;
    }
    return fileSystemControllerDownloadNodeWithFormat({
      path: { nodeId: id },
      query,
    });
  },

  update: (id: string, data: UpdateNodeDto) =>
    fileSystemControllerUpdateNode({ path: { nodeId: id }, body: data as any }),

  delete: (id: string, permanent?: boolean) =>
    fileSystemControllerDeleteNode({
      path: { nodeId: id },
      query: { permanently: permanent ?? false },
    }),

  createFolder: (parentId: string, data: CreateFolderDto) =>
    fileSystemControllerCreateFolder({
      path: { parentId },
      body: data as any,
    }),

  moveNode: (id: string, data: MoveNodeDto) =>
    fileSystemControllerMoveNode({ path: { nodeId: id }, body: data, query: undefined } as any),

  copyNode: (id: string, data: CopyNodeDto) =>
    fileSystemControllerCopyNode({ path: { nodeId: id }, body: data, query: undefined } as any),

  getRoot: (nodeId: string) =>
    fileSystemControllerGetRootNode({ path: { nodeId } }),
};