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
import { ProjectPermission } from '../constants/permissions';
import { loadProjectPermissionData } from '../utils/permissionUtils';
import { globalPermissionCache } from '../utils/projectPermissionCache';

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
  ProjectPermission.FILE_SHARE,
  ProjectPermission.VERSION_READ,
  ProjectPermission.PROJECT_UPDATE,
  ProjectPermission.PROJECT_DELETE,
] as const;

/**
 * 权限状态类型
 *
 * 语义（统一悲观）：未加载/未包含的权限位为 undefined，消费时必须按 false 处理；
 * hook 的 `check` 已把 undefined 归一为 false。
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
 * 项目权限批量加载 Hook —— 前端项目权限判定的唯一 hook 入口
 *
 * 统一管理项目权限的批量加载和状态管理（数据经 globalPermissionCache 共享缓存，
 * 与 permissionUtils 纯函数版复用同一份数据，避免重复请求）。
 *
 * 权限语义：**悲观** —— undefined（未加载/不在列表中）一律视为 false，
 * 权限加载完成前操作按钮不显示；消费点应配合 `loading` 做骨架/门控。
 *
 * @param projectId 项目 ID，为 null/undefined 时不加载权限（返回空状态）
 * @param options 配置选项
 * @returns 权限状态和操作方法
 *
 * @example
 * // 使用默认权限列表
 * const { permissions } = useProjectPermissions(projectId);
 *
 * @example
 * // 手动刷新权限（清除缓存后重新加载）
 * const { refresh } = useProjectPermissions(projectId);
 * await refresh();
 */
export const useProjectPermissions = (
  projectId: string | null | undefined,
  options: UseProjectPermissionsOptions = {}
): {
  /** 权限状态对象（值可能为 undefined，表示未加载/未包含） */
  permissions: PermissionState;
  /** 是否正在加载（首次自动加载前即 true，供消费点门控/骨架） */
  loading: boolean;
  /** 刷新权限（清除缓存后重新加载） */
  refresh: () => Promise<void>;
  /** 检查单个权限（悲观语义：undefined 视为 false，恒返回 boolean） */
  check: (permission: string) => boolean;
  /** 检查是否有任一权限 */
  hasAny: (permissions: string[]) => boolean;
  /** 检查是否有所有权限 */
  hasAll: (permissions: string[]) => boolean;
} => {
  const {
    permissions: permissionList = PROJECT_FILE_PERMISSIONS,
    autoLoad = true,
  } = options;

  const [permissions, setPermissions] = useState<PermissionState>({});
  const [loading, setLoading] = useState(() => autoLoad && !!projectId);

  // 使用 ref 存储 permissionList 避免依赖变化
  const permissionListRef = useRef(permissionList);
  permissionListRef.current = permissionList;

  // 竞态防护：每次加载意图（含缓存命中）递增序号，在途响应序号不匹配即丢弃，
  // 快速切项目时旧项目的在途响应不得覆盖新项目状态
  const requestSeqRef = useRef(0);

  // 加载权限（读共享缓存，缓存未命中才发请求）
  const loadPermissions = useCallback(async () => {
    if (!projectId) {
      setPermissions({});
      setLoading(false);
      return;
    }

    const seq = ++requestSeqRef.current;

    // 缓存命中预检：直接用缓存值渲染，跳过 loading 置 true / 权限清空，
    // 切回已缓存项目时按钮不闪隐一帧（loading 恒 false）
    const cached = globalPermissionCache.getProjectPermissions(projectId);
    if (cached) {
      const currentPermissions = permissionListRef.current;
      const newPermissions: PermissionState = {};
      currentPermissions.forEach((perm) => {
        newPermissions[perm] = cached.permissions.includes(perm);
      });
      setPermissions(newPermissions);
      setLoading(false);
      return;
    }

    setLoading(true);
    // 悲观清空：加载期间不泄漏旧项目/旧数据集的权限位
    setPermissions({});
    try {
      const currentPermissions = permissionListRef.current;
      const result = await loadProjectPermissionData(projectId);
      // 在途响应过期（期间已切项目/触发新加载）：丢弃，不得覆盖新状态
      if (seq !== requestSeqRef.current) return;

      const newPermissions: PermissionState = {};
      currentPermissions.forEach((perm) => {
        newPermissions[perm] = result.permissions.includes(perm);
      });
      setPermissions(newPermissions);
    } catch (error) {
      console.error('加载项目权限失败:', error);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [projectId]);

  // 自动加载
  useEffect(() => {
    if (autoLoad && projectId) {
      loadPermissions();
    } else if (!projectId) {
      setPermissions({});
      setLoading(false);
    }
  }, [projectId, autoLoad, loadPermissions]);

  // 强制刷新：清除缓存后重新加载（clearProject 语义与 useProjectPermission 一致）
  const refresh = useCallback(async () => {
    if (!projectId) return;
    globalPermissionCache.clearProject(projectId);
    await loadPermissions();
  }, [projectId, loadPermissions]);

  // 检查单个权限（悲观语义：undefined 一律视为 false）
  const check = useCallback(
    (permission: string): boolean => {
      return permissions[permission] === true;
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
    refresh,
    check,
    hasAny,
    hasAll,
  };
};

export default useProjectPermissions;
