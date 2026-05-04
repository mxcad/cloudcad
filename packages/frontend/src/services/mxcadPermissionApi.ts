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

import { projectPermissionApi } from '@/services/projectPermissionApi';

export const mxcadPermissionApi = {
  checkCadSave: (projectId: string) =>
    projectPermissionApi.checkPermission(projectId, 'CAD_SAVE'),
  checkCadRead: (projectId: string) =>
    projectPermissionApi.checkPermission(projectId, 'FILE_READ'),
};
