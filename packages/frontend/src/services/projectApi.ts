// @ts-nocheck  
// @deprecated Use @/api-sdk instead.
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
  CreateProjectDto,
} from '../types/api-client';

/**
 * 项目过滤类型
 * - all: 全部项目（我创建的 + 我加入的）
 * - owned: 我创建的项目
 * - joined: 我加入的项目（非创建者）
 */
export type ProjectFilterType = 'all' | 'owned' | 'joined';

export const projectApi = {
  // ========== 项目操作 ==========

  /**
   * 获取项目列表
   * @param filter 项目过滤类型：all-全部，owned-我创建的，joined-我加入的
   * @param params 分页参数
   * @param config 请求配置
   */
  list: (
    filter?: ProjectFilterType,
    params?: { page?: number; limit?: number },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().FileSystemController_getProjects(
      {
        filter: filter || undefined,
        page: params?.page,
        limit: params?.limit,
      },
      null,
      config
    ),

  /**
   * 获取已删除项目
   */
  getDeleted: (
    params?: { page?: number; limit?: number },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().FileSystemController_getDeletedProjects(
      {
        page: params?.page,
        limit: params?.limit,
      },
      null,
      config
    ),

  /**
   * 创建项目
   */
  create: (data: CreateProjectDto) =>
    getApiClient().FileSystemController_createProject(null, data),

  /**
   * 获取项目详情
   */
  get: (projectId: string) =>
    getApiClient().FileSystemController_getProject({ projectId }),

  /**
   * 更新项目
   */
  update: (projectId: string, data: CreateProjectDto) =>
    getApiClient().FileSystemController_updateProject({ projectId }, data),

  /**
   * 删除项目
   */
  delete: (projectId: string, permanently: boolean = false) =>
    getApiClient().FileSystemController_deleteProject({
      projectId,
      permanently,
    }),

  /**
   * 恢复项目
   */
  restore: (projectId: string) =>
    getApiClient().FileSystemController_restoreTrashItems(null, {
      itemIds: [projectId],
    }),

  // ========== 存储配额管理 ==========

  /**
   * 获取存储信息
   */
  getStorageInfo: () =>
    getApiClient().FileSystemController_getStorageQuota(null),

  /**
   * 获取配额
   */
  getQuota: (nodeId?: string) =>
    getApiClient().FileSystemController_getStorageQuota(
      nodeId ? { nodeId } : null
    ),

  /**
   * 更新存储配额
   */
  updateStorageQuota: (nodeId: string, quota: number) =>
    getApiClient().FileSystemController_updateStorageQuota(null, {
      nodeId,
      quota,
    }),

  // ========== 私人空间 ==========

  /**
   * 获取当前用户的私人空间
   */
  getPersonalSpace: () =>
    getApiClient().FileSystemController_getPersonalSpace(),

  /**
   * 获取指定用户的私人空间（管理员）
   */
  getUserPersonalSpace: (userId: string) =>
    getApiClient().FileSystemController_getUserPersonalSpace({ userId }),
};