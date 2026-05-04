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
export const trashApi = {
  getList: (config?: { signal?: AbortSignal }) =>
    getApiClient().FileSystemController_getTrash(null, null, config),

  restoreItems: (itemIds: string[]) =>
    getApiClient().FileSystemController_restoreTrashItems(null, { itemIds }),

  permanentlyDeleteItems: (itemIds: string[]) =>
    getApiClient().FileSystemController_permanentlyDeleteTrashItems(null, {
      itemIds,
    }),

  clear: () => getApiClient().FileSystemController_clearTrash(),
};
