///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectPermission } from './useProjectPermission';
import { ProjectPermission } from '../constants/permissions';

/**
 * 项目文件相关权限列表
 * 所有使用 FileItem 组件的地方都应该加载这些权限，确保按钮显示一致性
 */
export const PROJECT_FILE_PERMISSIONS = [
  ProjectPermission.FILE_CREATE,
  ProjectPermission.FILE_UPLOAD,
  ProjectPermission.FILE_OPEN,
  ProjectPermission.FILE_EDIT,
  ProjectPermission.FILE_DELETE,
  ProjectPermission.FILE_TRASH_MANAGE,
  ProjectPermission.FILE_DOWNLOAD,
  ProjectPermission.FILE_MOVE,
  ProjectPermission.FILE_COPY,
  ProjectPermission.CAD_SAVE,
  ProjectPermission.CAD_EXTERNAL_REFERENCE,
  ProjectPermission.VERSION_READ,
  ProjectPermission.PROJECT_UPDATE,
  ProjectPermission.PROJECT_DELETE,
] as const;

/** @deprecated 使用 PROJECT_FILE_PERMISSIONS */
export const FILE_SYSTEM_PERMISSIONS = PROJECT_FILE_PERMISSIONS;

/**
 * 权限状态类型
 */
export type PermissionState = Record<string, boolean | undefined>;

/**
 * useProjectPermissions Hook 配置选项
 */
interface UseProjectPermissionsOptions {
  /** 要检查的权限列表，默认使用 PROJECT_FILE_PERMISSIONS */
  permissions?: readonly string[];
  /** 是否启用自动加载，默认 true */
  autoLoad?: boolean;
}

/**
 * 项目权限批量加载 Hook
 *
 * 统一管理项目权限的批量加载和状态管理，避免各组件重复实现权限加载逻辑。
 *
 * @param projectId 项目 ID，为 null 时不加载权限
 * @param options 配置选项
 * @returns 权限状态和操作方法
 *
 * @example
 * // 使用默认权限列表
 * const { permissions } = useProjectPermissions(projectId);
 *
 * @example
 * // 手动刷新权限
 * const { refresh } = useProjectPermissions(projectId);
 * await refresh();
 */
export const useProjectPermissions = (
  projectId: string | null | undefined,
  options: UseProjectPermissionsOptions = {}
): {
  /** 权限状态对象 */
  permissions: PermissionState;
  /** 是否正在加载 */
  loading: boolean;
  /** 刷新权限 */
  refresh: () => Promise<void>;
  /** 检查单个权限 */
  check: (permission: string) => boolean | undefined;
  /** 检查是否有任一权限 */
  hasAny: (permissions: string[]) => boolean;
  /** 检查是否有所有权限 */
  hasAll: (permissions: string[]) => boolean;
} => {
  const {
    permissions: permissionList = PROJECT_FILE_PERMISSIONS,
    autoLoad = true,
  } = options;

  const { checkPermission } = useProjectPermission();
  const [permissions, setPermissions] = useState<PermissionState>({});
  const [loading, setLoading] = useState(false);

  // 使用 ref 存储 permissionList 避免依赖变化
  const permissionListRef = useRef(permissionList);
  permissionListRef.current = permissionList;

  // 加载权限
  const loadPermissions = useCallback(async () => {
    if (!projectId) {
      setPermissions({});
      return;
    }

    setLoading(true);
    try {
      const currentPermissions = permissionListRef.current;
      const results = await Promise.all(
        currentPermissions.map((perm) => checkPermission(projectId, perm))
      );

      const newPermissions: PermissionState = {};
      currentPermissions.forEach((perm, index) => {
        newPermissions[perm] = results[index];
      });
      setPermissions(newPermissions);
    } catch (error) {
      console.error('加载项目权限失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, checkPermission]);

  // 自动加载
  useEffect(() => {
    if (autoLoad && projectId) {
      loadPermissions();
    } else if (!projectId) {
      setPermissions({});
    }
  }, [projectId, autoLoad, loadPermissions]);

  // 检查单个权限
  const check = useCallback(
    (permission: string): boolean | undefined => {
      return permissions[permission];
    },
    [permissions]
  );

  // 检查是否有任一权限
  const hasAny = useCallback(
    (perms: string[]): boolean => {
      return perms.some((perm) => permissions[perm] === true);
    },
    [permissions]
  );

  // 检查是否有所有权限
  const hasAll = useCallback(
    (perms: string[]): boolean => {
      return perms.every((perm) => permissions[perm] === true);
    },
    [permissions]
  );

  return {
    permissions,
    loading,
    refresh: loadPermissions,
    check,
    hasAny,
    hasAll,
  };
};

export default useProjectPermissions;
