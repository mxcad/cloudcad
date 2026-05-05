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

// 本地定义缺失的 DTO 类型
interface UpdateNodeDto {
  name?: string;
  description?: string;
  tags?: string[];
}

interface CreateNodeDto {
  name: string;
  nodeType: 'folder' | 'file';
  parentId?: string;
  projectId?: string;
}

interface CreateFolderDto {
  name: string;
}

interface MoveNodeDto {
  targetParentId: string;
}

interface CopyNodeDto {
  targetParentId: string;
}

export const nodeApi = {
  // ========== 节点操作 ==========

  /**
   * 创建节点（项目或文件夹）
   */
  createNode: (data: CreateNodeDto) =>
    getApiClient().FileSystemController_createNode(null, data as any),

  /**
   * 创建文件夹
   */
  createFolder: (parentId: string, data: CreateFolderDto) =>
    getApiClient().FileSystemController_createFolder({ parentId }, data),

  /**
   * 恢复已删除的节点
   */
  restoreNode: (nodeId: string) =>
    getApiClient().FileSystemController_restoreNode({ nodeId }),

  /**
   * 获取节点详情
   */
  getNode: (nodeId: string, config?: { signal?: AbortSignal }) =>
    getApiClient().FileSystemController_getNode({ nodeId }, null, config),

  /**
   * 获取子节点列表
   */
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

  /**
   * 更新节点
   */
  updateNode: (nodeId: string, data: UpdateNodeDto) =>
    getApiClient().FileSystemController_updateNode({ nodeId }, data),

  /**
   * 重命名节点
   */
  renameNode: (nodeId: string, data: { name: string }) =>
    getApiClient().FileSystemController_updateNode({ nodeId }, data),

  /**
   * 删除节点
   */
  deleteNode: (nodeId: string, permanently: boolean = false) =>
    getApiClient().FileSystemController_deleteNode({ nodeId, permanently }),

  /**
   * 移动节点
   */
  moveNode: (nodeId: string, targetParentId: string) => {
    const data: MoveNodeDto = { targetParentId };
    return getApiClient().FileSystemController_moveNode({ nodeId }, data);
  },

  /**
   * 复制节点
   */
  copyNode: (nodeId: string, targetParentId: string) => {
    const data: CopyNodeDto = { targetParentId };
    return getApiClient().FileSystemController_copyNode({ nodeId }, data);
  },
};