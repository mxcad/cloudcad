import { apiClient } from './apiClient';

export const trashApi = {
  getList: () => apiClient.get('/file-system/trash'),

  restoreItems: (itemIds: string[]) =>
    apiClient.post('/file-system/trash/restore', { itemIds }),

  permanentlyDeleteItems: (itemIds: string[]) =>
    apiClient.delete('/file-system/trash/items', { data: { itemIds } }),

  clear: () => apiClient.delete('/file-system/trash'),
};