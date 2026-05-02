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

import { projectApi } from './projectApi';
import { nodeApi } from './nodeApi';
import { projectMemberApi } from './projectMemberApi';
import { projectPermissionApi } from './projectPermissionApi';
import { projectTrashApi } from './projectTrashApi';
import { searchApi } from './searchApi';

// 类型导出
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

/**
 * @deprecated 已弃用，请使用新的模块化 API：
 * - 项目操作：使用 `projectApi`
 * - 节点操作：使用 `nodeApi`
 * - 成员管理：使用 `projectMemberApi`
 * - 权限检查：使用 `projectPermissionApi`
 * - 回收站：使用 `projectTrashApi`
 * - 搜索：使用 `searchApi`
 *
 * 保持向后兼容，但新代码应使用新的模块化 API。
 */
export const projectsApi = {
  // ========== 项目操作 ==========
  list: projectApi.list,
  getDeletedProjects: projectApi.getDeleted,
  getDeleted: projectApi.getDeleted,
  create: projectApi.create,
  get: projectApi.get,
  update: projectApi.update,
  delete: projectApi.delete,
  restoreProject: projectApi.restore,
  getStorageInfo: projectApi.getStorageInfo,
  getQuota: projectApi.getQuota,
  updateStorageQuota: projectApi.updateStorageQuota,
  getPersonalSpace: projectApi.getPersonalSpace,
  getUserPersonalSpace: projectApi.getUserPersonalSpace,

  // ========== 节点操作 ==========
  createNode: nodeApi.createNode,
  createFolder: nodeApi.createFolder,
  getNode: nodeApi.getNode,
  getChildren: nodeApi.getChildren,
  updateNode: nodeApi.updateNode,
  renameNode: nodeApi.renameNode,
  deleteNode: nodeApi.deleteNode,
  moveNode: nodeApi.moveNode,
  copyNode: nodeApi.copyNode,
  restoreNode: nodeApi.restoreNode,

  // ========== 成员管理 ==========
  getMembers: projectMemberApi.getMembers,
  addMember: projectMemberApi.addMember,
  removeMember: projectMemberApi.removeMember,
  updateMember: projectMemberApi.updateMember,
  transferOwnership: projectMemberApi.transferOwnership,

  // ========== 权限检查 ==========
  getPermissions: projectPermissionApi.getPermissions,
  checkPermission: projectPermissionApi.checkPermission,
  getRole: projectPermissionApi.getRole,

  // ========== 项目内回收站 ==========
  getProjectTrash: projectTrashApi.getProjectTrash,
  clearProjectTrash: projectTrashApi.clearProjectTrash,

  // ========== 搜索接口 ==========
  search: searchApi.search,
};