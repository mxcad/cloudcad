import { getApiClient } from './apiClient';
import type {
  OperationMethods,
  SvnLogResponseDto,
  FileContentResponseDto,
} from '../types/api-client';

export type { SvnLogResponseDto, FileContentResponseDto };

export const versionControlApi = {
  /**
   * 获取文件的 SVN 提交历史
   * @param projectId 项目ID
   * @param filePath 文件路径
   * @param limit 限制返回的记录数量
   */
  getFileHistory: (projectId: string, filePath: string, limit?: number) => {
    type HistoryParams = Parameters<OperationMethods['VersionControlController_getFileHistory']>[0];
    const params: HistoryParams = {
      projectId,
      filePath,
      ...(limit !== undefined && { limit }),
    };
    return getApiClient().VersionControlController_getFileHistory(params);
  },

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
  ) => {
    type ContentParams = Parameters<OperationMethods['VersionControlController_getFileContentAtRevision']>[0];
    const params: ContentParams = {
      revision,
      projectId,
      filePath,
    };
    return getApiClient().VersionControlController_getFileContentAtRevision(params);
  },
};
