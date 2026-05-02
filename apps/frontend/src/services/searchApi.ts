///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';
import type {
  SearchScope,
  SearchType,
  FileStatus,
} from '../types/api-client';

export const searchApi = {
  // ========== 搜索接口 ==========

  /**
   * 统一搜索接口
   *
   * @param keyword 搜索关键词（必填）
   * @param params 搜索参数
   * @param config 请求配置
   */
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
  ) => {
    // 创建基础参数，符合 API 类型定义
    const baseParams: any = {
      keyword,
      scope: params?.scope,
      type: params?.type,
      filter: params?.filter,
      projectId: params?.projectId,
      extension: params?.extension,
      fileStatus: params?.fileStatus,
      page: params?.page,
      limit: params?.limit,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    };
    
    // 添加额外的参数（如 libraryKey）
    if (params?.libraryKey) {
      baseParams.libraryKey = params.libraryKey;
    }
    
    return getApiClient().FileSystemController_search(
      baseParams,
      null,
      config
    );
  },
};