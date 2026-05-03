import { getApiClient } from './apiClient';

const API = '/api/trash';

function post<T>(path: string, data?: unknown) {
  return getApiClient().post<T>(`${API}${path}`, data);
}

function del<T>(path: string) {
  return getApiClient().delete<T>(`${API}${path}`);
}

export const trashApi = {
  restoreItems: (nodeIds: string[]) =>
    post('/restore', { nodeIds }),

  clear: () =>
    del(''),
};
