///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useMemo } from 'react';
import { FileSystemNode } from '../types/filesystem';
import { ProjectPermission } from '../constants/permissions';
import type { PermissionState } from './useProjectPermissions';

/**
 * 节点权限（用于根节点/项目级别的权限覆盖）
 */
export interface NodePermission {
  canEdit?: boolean;
  canDelete?: boolean;
  canManageMembers?: boolean;
  canManageRoles?: boolean;
}

/**
 * useFileItemProps 配置选项
 */
export interface UseFileItemPropsOptions {
  /** 项目权限状态 */
  projectPermissions: PermissionState;
  /** 节点权限（用于根节点覆盖） */
  nodePermissions?: NodePermission;
  /** 是否禁用拖拽 */
  disableDrag?: boolean;
  /** 是否禁用上传 */
  disableUpload?: boolean;
}

/**
 * 计算 FileItem 组件所需的权限属性
 *
 * @param node 文件节点
 * @param options 配置选项
 * @returns FileItem 权限属性对象
 */
export const getFileItemPermissionProps = (
  node: FileSystemNode,
  options: UseFileItemPropsOptions
): {
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDownload: boolean;
  canViewVersionHistory: boolean;
  canManageExternalReference: boolean;
  canManageMembers?: boolean;
  canManageRoles?: boolean;
} => {
  const { projectPermissions, nodePermissions, disableUpload } = options;

  // 根节点使用 nodePermissions 覆盖
  const isRoot = node.isRoot;
  const rootPerms = nodePermissions || {};

  return {
    canUpload: disableUpload
      ? false
      : (projectPermissions[ProjectPermission.FILE_UPLOAD] ?? false),
    canEdit: isRoot
      ? (rootPerms.canEdit ?? false)
      : (projectPermissions[ProjectPermission.FILE_EDIT] ?? false),
    canDelete: isRoot
      ? (rootPerms.canDelete ?? false)
      : (projectPermissions[ProjectPermission.FILE_DELETE] ?? false),
    canDownload: projectPermissions[ProjectPermission.FILE_DOWNLOAD] ?? false,
    canViewVersionHistory:
      projectPermissions[ProjectPermission.VERSION_READ] ?? false,
    canManageExternalReference:
      projectPermissions[ProjectPermission.CAD_EXTERNAL_REFERENCE] ?? false,
    canManageMembers: isRoot ? rootPerms.canManageMembers : undefined,
    canManageRoles: isRoot ? rootPerms.canManageRoles : undefined,
  };
};

/**
 * Hook: 批量计算多个节点的 FileItem 权限属性
 *
 * @param nodes 文件节点列表
 * @param options 配置选项
 * @returns Map<nodeId, permissionProps>
 */
export const useFileItemPermissionProps = (
  nodes: FileSystemNode[],
  options: UseFileItemPropsOptions
): Map<string, ReturnType<typeof getFileItemPermissionProps>> => {
  return useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof getFileItemPermissionProps>
    >();
    for (const node of nodes) {
      map.set(node.id, getFileItemPermissionProps(node, options));
    }
    return map;
  }, [nodes, options]);
};

export default useFileItemPermissionProps;
