import { getApiClient } from './apiClient';
export const trashApi = {
  getList: () =>
    getApiClient().FileSystemController_getTrash(),

  restoreItems: (itemIds: string[]) =>
    getApiClient().FileSystemController_restoreTrashItems(null, { itemIds }),

  permanentlyDeleteItems: (itemIds: string[]) =>
    getApiClient().FileSystemController_permanentlyDeleteTrashItems(null, { itemIds }),

  clear: () =>
    getApiClient().FileSystemController_clearTrash(),
};
