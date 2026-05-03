import { getApiClient } from './apiClient';

const API = '/api/file-system';

export type SearchScope = 'project' | 'project_files' | 'personal' | 'library';
export type SearchType = 'dwg' | 'dxf' | 'mxweb' | 'all';
export type FileStatus = 'active' | 'deleted' | 'all';

export const searchApi = {
  search: (
    keyword: string,
    params?: {
      scope?: SearchScope;
      type?: SearchType;
      filter?: 'all' | 'owned' | 'joined';
      projectId?: string;
      libraryKey?: string;
      extension?: string;
      fileStatus?: FileStatus;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().get(`${API}/search`, {
      params: { keyword, ...params },
      ...(config?.signal ? { signal: config.signal } : {}),
    }),
};
