import { apiClient } from './apiClient';

/**
 * SVN 提交记录中的变更路径
 */
export interface SvnLogPath {
  action: 'A' | 'M' | 'D' | 'R';
  kind: 'file' | 'dir';
  path: string;
}

/**
 * SVN 提交记录条目
 */
export interface SvnLogEntry {
  revision: number;
  author: string;
  date: Date;
  message: string;
  userName?: string; // 提交用户名称（从提交信息中解析）
  paths?: SvnLogPath[];
}

/**
 * 获取 SVN 提交历史的响应
 */
export interface SvnLogResponse {
  success: boolean;
  message: string;
  entries: SvnLogEntry[];
}

export const versionControlApi = {
  /**
   * 获取文件的 SVN 提交历史
   * @param projectId 项目ID
   * @param filePath 文件路径
   * @param limit 限制返回的记录数量
   */
  getFileHistory: (projectId: string, filePath: string, limit?: number) =>
    apiClient.get<SvnLogResponse>('/version-control/history', {
      params: { projectId, filePath, limit },
    }),

  /**
   * 获取指定版本的文件内容
   * @param projectId 项目ID
   * @param filePath 文件路径
   * @param revision 修订版本号
   */
  getFileContentAtRevision: (
    projectId: string,
    filePath: string,
    revision: number
  ) =>
    apiClient.get<{ success: boolean; message: string; content?: string }>(
      `/version-control/file/${revision}`,
      { params: { projectId, filePath } }
    ),
};
