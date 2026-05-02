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
  CreateNodeDto,
  UpdateNodeDto,
  CreateProjectDto,
  MoveNodeDto,
  CopyNodeDto,
  CreateFolderDto,
  SearchScope,
  SearchType,
  FileStatus,
} from '../types/api-client';

/**
 * 项目过滤类型
 * - all: 全部项目（我创建的 + 我加入的）
 * - owned: 我创建的项目
 * - joined: 我加入的项目（非创建者）
 */
export type ProjectFilterType = 'all' | 'owned' | 'joined';

export const projectsApi = {
  // ========== 统一节点操作 ==========

  /**
   * 统一创建节点接口
   *
   * 规则：
   * - parentId 为空 → 创建项目
   * - parentId 有值 → 创建文件夹
   */
  createNode: (data: CreateNodeDto) =>
    getApiClient().FileSystemController_createNode(null, data),

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
  ) =>
    getApiClient().FileSystemController_search(
      {
        keyword,
        scope: params?.scope,
        type: params?.type,
        filter: params?.filter,
        projectId: params?.projectId,
        libraryKey: params?.libraryKey,
        extension: params?.extension,
        fileStatus: params?.fileStatus,
        page: params?.page,
        limit: params?.limit,
        sortBy: params?.sortBy,
        sortOrder: params?.sortOrder,
      },
      null,
      config
    ),

  // ========== 项目操作（兼容旧 API） ==========

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

  getDeletedProjects: (
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
   * 创建项目（兼容旧 API，内部调用 createNode）
   */
  create: (data: CreateProjectDto) =>
    getApiClient().FileSystemController_createProject(null, data),

  get: (projectId: string) =>
    getApiClient().FileSystemController_getProject({ projectId }),

  update: (projectId: string, data: CreateProjectDto) =>
    getApiClient().FileSystemController_updateProject({ projectId }, data),

  delete: (projectId: string, permanently: boolean = false) =>
    getApiClient().FileSystemController_deleteProject({
      projectId,
      permanently,
    }),

  // ========== 节点操作（兼容旧 API） ==========

  /**
   * 创建文件夹（兼容旧 API，内部调用 createNode）
   */
  createFolder: (parentId: string, data: CreateFolderDto) =>
    getApiClient().FileSystemController_createFolder({ parentId }, data),

  getNode: (nodeId: string, config?: { signal?: AbortSignal }) =>
    getApiClient().FileSystemController_getNode({ nodeId }, null, config),

  getChildren: (
    nodeId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      nodeType?: 'folder' | 'file';
    },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().FileSystemController_getChildren(
      {
        nodeId,
        page: params?.page,
        limit: params?.limit,
        search: params?.search,
        nodeType: params?.nodeType,
      },
      null,
      config
    ),

  updateNode: (nodeId: string, data: UpdateNodeDto) =>
    getApiClient().FileSystemController_updateNode({ nodeId }, data),

  renameNode: (nodeId: string, data: { name: string }) =>
    getApiClient().FileSystemController_updateNode({ nodeId }, data),

  deleteNode: (nodeId: string, permanently: boolean = false) =>
    getApiClient().FileSystemController_deleteNode({ nodeId, permanently }),

  moveNode: (nodeId: string, targetParentId: string) => {
    const data: MoveNodeDto = { targetParentId };
    return getApiClient().FileSystemController_moveNode({ nodeId }, data);
  },

  copyNode: (nodeId: string, targetParentId: string) => {
    const data: CopyNodeDto = { targetParentId };
    return getApiClient().FileSystemController_copyNode({ nodeId }, data);
  },

  getStorageInfo: () =>
    getApiClient().FileSystemController_getStorageQuota(null),

  getQuota: (nodeId?: string) =>
    getApiClient().FileSystemController_getStorageQuota(
      nodeId ? { nodeId } : null
    ),

  updateStorageQuota: (nodeId: string, quota: number) =>
    getApiClient().FileSystemController_updateStorageQuota(null, {
      nodeId,
      quota,
    }),

  getMembers: (projectId: string) =>
    getApiClient().FileSystemController_getProjectMembers({ projectId }),

  addMember: (
    projectId: string,
    data: { userId: string; projectRoleId: string }
  ) =>
    getApiClient().FileSystemController_addProjectMember({ projectId }, data),

  removeMember: (projectId: string, userId: string) =>
    getApiClient().FileSystemController_removeProjectMember({
      projectId,
      userId,
    }),

  updateMember: (
    projectId: string,
    userId: string,
    data: { projectRoleId: string }
  ) =>
    getApiClient().FileSystemController_updateProjectMember(
      { projectId, userId },
      data
    ),

  transferOwnership: (projectId: string, newOwnerId: string) =>
    getApiClient().FileSystemController_transferProjectOwnership(
      { projectId },
      { newOwnerId }
    ),

  // ========== 项目权限检查 ==========

  /**
   * 获取用户在项目中的所有权限
   */
  getPermissions: (projectId: string) =>
    getApiClient().FileSystemController_getUserProjectPermissions({
      projectId,
    }),

  /**
   * 检查用户是否具有特定权限
   */
  checkPermission: (projectId: string, permission: string) =>
    getApiClient().FileSystemController_checkProjectPermission({
      projectId,
      permission,
    }),

  /**
   * 获取用户在项目中的角色
   */
  getRole: (projectId: string) =>
    getApiClient().FileSystemController_getUserProjectRole({ projectId }),

  // ========== 项目内回收站 ==========

  /**
   * 获取项目内回收站内容
   */
  getProjectTrash: (projectId: string, params?: { page?: number; limit?: number }) =>
    getApiClient().FileSystemController_getProjectTrash({
      projectId,
      page: params?.page,
      limit: params?.limit,
    }),

  /**
   * 恢复已删除的节点
   */
  restoreNode: (nodeId: string) =>
    getApiClient().FileSystemController_restoreNode({ nodeId }),

  /**
   * 清空项目回收站
   */
  clearProjectTrash: (projectId: string) =>
    getApiClient().FileSystemController_clearProjectTrash({ projectId }),

  /**
   * 恢复项目
   */
  restoreProject: (projectId: string) =>
    getApiClient().FileSystemController_restoreTrashItems(null, {
      itemIds: [projectId],
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
