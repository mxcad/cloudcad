///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
    type HistoryParams = Parameters<
      OperationMethods['VersionControlController_getFileHistory']
    >[0];
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
    type ContentParams = Parameters<
      OperationMethods['VersionControlController_getFileContentAtRevision']
    >[0];
    const params: ContentParams = {
      revision,
      projectId,
      filePath,
    };
    return getApiClient().VersionControlController_getFileContentAtRevision(
      params
    );
  },
};
