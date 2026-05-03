import { getApiClient } from './apiClient';

const API = '/api/version-control';

export interface SvnLogResponseDto {
  entries: Array<{
    revision: number;
    author: string;
    date: string;
    message: string;
  }>;
}

export interface FileContentResponseDto {
  content: string;
  revision: number;
}

export const versionControlApi = {
  /** 获取文件的 SVN 提交历史 */
  getFileHistory: (projectId: string, filePath: string, limit?: number) =>
    getApiClient().get<SvnLogResponseDto>(`${API}/history`, {
      params: { projectId, filePath, ...(limit !== undefined && { limit }) },
    }),

  /** 获取指定版本的文件内容 */
  getFileContentAtRevision: (projectId: string, filePath: string, revision: number) =>
    getApiClient().get<FileContentResponseDto>(`${API}/content`, {
      params: { projectId, filePath, revision },
    }),
};
