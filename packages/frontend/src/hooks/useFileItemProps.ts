///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { FileSystemNode } from '../types/filesystem';
import { ProjectPermission } from '../constants/permissions';
import type { PermissionState } from './useProjectPermissions';

/**
 * 节点权限（用于根节点/项目级别的权限覆盖）
 */
export interface NodePermission {
  canEdit?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  canCopy?: boolean;
  canMove?: boolean;
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
  /**
   * 权限加载中（悲观门控）：为 true 时非根节点 canEdit/canDelete 不进入
   * `undefined ?? rootPerms.canEdit` 回退链（加载期恒 false，防止按钮乐观显示）；
   * 加载完成后行为与未传该选项一致。
   */
  permissionsLoading?: boolean;
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
  canShare: boolean;
  canDownload: boolean;
  canViewVersionHistory: boolean;
  canManageExternalReference: boolean;
  canMove: boolean;
  canCopy: boolean;
  canManageMembers?: boolean;
  canManageRoles?: boolean;
} => {
  const {
    projectPermissions,
    nodePermissions,
    permissionsLoading,
    disableUpload,
  } = options;

  // 根节点使用 nodePermissions 覆盖
  const isRoot = node.isRoot;
  const rootPerms = nodePermissions || {};
  // 加载期悲观门控：非根节点 canEdit/canDelete 不得经 `?? rootPerms.canEdit`
  // 回退链产生乐观 true（加载完成后走原回退链，行为与现状一致）
  const permissionsPending = !isRoot && permissionsLoading === true;

  // 非根节点：加载期恒 false；就绪后按 projectPermissions 值，未就绪位（undefined）回退 rootPerms
  const canEdit = isRoot
    ? (rootPerms.canEdit ?? false)
    : permissionsPending
      ? false
      : (projectPermissions[ProjectPermission.FILE_EDIT] ??
        rootPerms.canEdit ??
        false);
  const canDelete = isRoot
    ? (rootPerms.canDelete ?? false)
    : permissionsPending
      ? false
      : (projectPermissions[ProjectPermission.FILE_DELETE] ??
        rootPerms.canDelete ??
        false);

  return {
    canUpload: disableUpload
      ? false
      : (projectPermissions[ProjectPermission.FILE_UPLOAD] ??
        rootPerms.canEdit ??
        false),
    canEdit,
    canDelete,
    canShare: projectPermissions[ProjectPermission.FILE_SHARE] ?? false,
    // 统一悲观语义：权限未加载（undefined）时按 false 处理，加载完成后按真实权限渲染
    canDownload: projectPermissions[ProjectPermission.FILE_DOWNLOAD] ?? false,
    canViewVersionHistory:
      projectPermissions[ProjectPermission.VERSION_READ] ?? false,
    canManageExternalReference:
      projectPermissions[ProjectPermission.CAD_EXTERNAL_REFERENCE] ?? false,
    canMove:
      projectPermissions[ProjectPermission.FILE_MOVE] ??
      rootPerms.canMove ??
      false,
    canCopy:
      projectPermissions[ProjectPermission.FILE_COPY] ??
      rootPerms.canCopy ??
      false,
    canManageMembers: isRoot ? rootPerms.canManageMembers : undefined,
    canManageRoles: isRoot ? rootPerms.canManageRoles : undefined,
  };
}
