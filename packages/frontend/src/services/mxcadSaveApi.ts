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

import { mxcadApi } from './mxcadApi';
import { filesApi } from './filesApi';

export const mxcadSaveApi = {
  saveMxwebFile: (
    blob: Blob,
    nodeId: string,
    onProgress?: (percentage: number) => void,
    commitMessage?: string,
    expectedTimestamp?: string
  ) => {
    return mxcadApi.saveMxwebFile(blob, nodeId, onProgress, commitMessage, expectedTimestamp);
  },

  saveMxwebAs: (
    blob: Blob,
    targetType: 'personal' | 'project',
    targetParentId: string,
    projectId: string | undefined,
    format: 'dwg' | 'dxf',
    onProgress?: (percentage: number) => void,
    commitMessage?: string,
    fileName?: string
  ) => {
    return mxcadApi.saveMxwebAs(blob, targetType, targetParentId, projectId, format, onProgress, commitMessage, fileName);
  },

  getFileInfo: (fileId: string) => {
    return filesApi.get(fileId);
  },
};
