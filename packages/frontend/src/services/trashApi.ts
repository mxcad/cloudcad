import { getApiClient } from './apiClient';
export const trashApi = {
  getList: (config?: { signal?: AbortSignal }) =>
    getApiClient().FileSystemController_getTrash(null, null, config),

  restoreItems: (itemIds: string[]) =>
    getApiClient().FileSystemController_restoreTrashItems(null, { itemIds }),

  permanentlyDeleteItems: (itemIds: string[]) =>
    getApiClient().FileSystemController_permanentlyDeleteTrashItems(null, { itemIds }),

  clear: () =>
    getApiClient().FileSystemController_clearTrash(),
};
