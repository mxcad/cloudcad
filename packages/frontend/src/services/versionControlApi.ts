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
  versionControlControllerGetFileHistory,
  versionControlControllerGetFileContentAtRevision,
} from '@/api-sdk';
import type { SvnLogResponseDto, FileContentResponseDto } from '@/api-sdk/types.gen';

export type { SvnLogResponseDto, FileContentResponseDto };

export const versionControlApi = {
  getFileHistory: (projectId: string, filePath: string, limit?: number) =>
    versionControlControllerGetFileHistory({
      query: {
        projectId,
        filePath,
        ...(limit !== undefined && { limit }),
      },
    }),

  getFileContentAtRevision: (
    projectId: string,
    filePath: string,
    revision: number
  ) =>
    versionControlControllerGetFileContentAtRevision({
      path: { revision },
      query: { projectId, filePath },
    }),
};