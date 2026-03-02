import { apiClient } from './apiClient';

export interface Tag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  isSystem: boolean;
}

export interface CreateTagParams {
  name: string;
  color?: string;
  description?: string;
}

export interface UpdateTagParams {
  name?: string;
  color?: string;
  description?: string;
}

export const tagsApi = {
  list: () => apiClient.get<Tag[]>('/tags'),

  create: (params: CreateTagParams) =>
    apiClient.post<Tag>('/tags', params),

  update: (id: string, params: UpdateTagParams) =>
    apiClient.patch<Tag>(`/tags/${id}`, params),

  delete: (id: string) => apiClient.delete<void>(`/tags/${id}`),
};
