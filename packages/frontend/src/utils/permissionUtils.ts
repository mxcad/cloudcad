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

/**
 * 权限检查工具（纯函数版）
 *
 * 供非 hook 上下文（动态 import、循环遍历）使用。
 * 数据经 globalPermissionCache 共享缓存（与 useProjectPermissions /
 * useProjectPermission 同一份），避免重复请求。
 */

import { t } from '@/languages';
import { handleError } from '@/utils/errorHandler';
import { memberControllerGetUserProjectPermissions } from '@/api-sdk';
import { ProjectPermission } from '@/constants/permissions';
import {
  globalPermissionCache,
  type ProjectPermissionData,
} from './projectPermissionCache';

export type Role = string | undefined | null;

export interface User {
  id: string;
  email?: string | null | { [key: string]: unknown };
  role?: {
    name?: Role;
  };
}

/**
 * 加载并缓存项目权限数据（一次请求，本地判断，全仓唯一 loader）
 *
 * 语义：
 * - 缓存命中（TTL 内）直接返回，不发请求
 * - 同项目并发调用共享同一 in-flight Promise（缓存 miss 时只发一个请求，
 *   其余调用 await 同一结果）——避免「我的项目」列表对每个项目做 4 个
 *   并发权限检查（canEdit/canDelete/canManageMembers/canManageRoles）时
 *   同一项目重复发请求
 * - 请求失败返回空权限 + null 角色（悲观拒绝，不写缓存）
 * - 挂起请求超过 INFLIGHT_TTL 释放 in-flight（允许重新发起），防止首个
 *   请求异常挂起时后续请求被永久阻塞
 *
 * @param projectId 项目 ID
 */
interface InflightEntry {
  /** identity token：区分「本请求」与「超时释放后重新发起的请求」 */
  token: object;
  promise: Promise<ProjectPermissionData>;
  timer: ReturnType<typeof setTimeout>;
}

/** 挂起请求释放时限（毫秒）：超时后允许重新发起请求 */
const INFLIGHT_TTL = 30_000;

const inflightPermissions = new Map<string, InflightEntry>();

export const loadProjectPermissionData = async (
  projectId: string
): Promise<ProjectPermissionData> => {
  const cached = globalPermissionCache.getProjectPermissions(projectId);
  if (cached) return cached;

  const inflight = inflightPermissions.get(projectId);
  if (inflight) return inflight.promise;

  const token = {};
  const promise = (async () => {
    try {
      const response = await memberControllerGetUserProjectPermissions({
        path: { projectId },
      });
      const permissions = response.data?.permissions || [];
      const result: ProjectPermissionData = {
        permissions,
        role: response.data?.role ?? null,
      };
      globalPermissionCache.setProjectPermissions(projectId, result);
      return result;
    } catch {
      // 悲观拒绝且不写缓存；失败释放 in-flight，下次调用可重新请求
      return { permissions: [], role: null };
    } finally {
      // identity 检查：超时释放后新请求已入 Map 时，旧请求 settle 不得误删新条目
      const entry = inflightPermissions.get(projectId);
      if (entry?.token === token) {
        clearTimeout(entry.timer);
        inflightPermissions.delete(projectId);
      }
    }
  })();

  const timer = setTimeout(() => {
    const entry = inflightPermissions.get(projectId);
    if (entry?.token === token) {
      inflightPermissions.delete(projectId);
    }
  }, INFLIGHT_TTL);

  inflightPermissions.set(projectId, { token, promise, timer });
  return promise;
};

/**
 * 加载并缓存项目权限列表（一次请求，本地判断）
 */
const loadProjectPermissions = async (projectId: string): Promise<string[]> => {
  const data = await loadProjectPermissionData(projectId);
  return data.permissions;
};

/**
 * 清除项目权限缓存
 */
export const clearProjectPermissionsCache = (projectId?: string) => {
  if (projectId) {
    globalPermissionCache.clearProject(projectId);
  } else {
    globalPermissionCache.clearAll();
  }
};

/**
 * 检查用户是否可以编辑节点
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以编辑
 */
export const canEditNode = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  if (!user) {
    return false;
  }

  try {
    const permissions = await loadProjectPermissions(nodeId);
    return permissions.includes(ProjectPermission.PROJECT_UPDATE);
  } catch (error: unknown) {
    handleError(error, t('检查编辑权限失败'));
    return false;
  }
};

/**
 * 检查用户是否可以删除节点
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以删除
 */
export const canDeleteNode = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  if (!user) {
    return false;
  }

  try {
    const permissions = await loadProjectPermissions(nodeId);
    return permissions.includes(ProjectPermission.PROJECT_DELETE);
  } catch (error: unknown) {
    handleError(error, t('检查删除权限失败'));
    return false;
  }
};

/**
 * 检查用户是否可以管理节点成员
 * @param user - 用户对象
 * @param nodeId - 节点 ID
 * @returns boolean - 是否可以管理成员
 */
export const canManageNodeMembers = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  if (!user) {
    return false;
  }

  try {
    const permissions = await loadProjectPermissions(nodeId);
    return permissions.includes(ProjectPermission.PROJECT_MEMBER_MANAGE);
  } catch (error: unknown) {
    handleError(error, t('检查成员管理权限失败'));
    return false;
  }
};

/**
 * 检查用户是否可以管理节点角色
 * @param user - 用户对象
 * @param nodeId - 节点 ID（项目 ID）
 * @returns boolean - 是否可以管理角色
 */
export const canManageNodeRoles = async (
  user: User | null,
  nodeId: string
): Promise<boolean> => {
  if (!user) {
    return false;
  }

  try {
    const permissions = await loadProjectPermissions(nodeId);
    return permissions.includes(ProjectPermission.PROJECT_ROLE_MANAGE);
  } catch (error: unknown) {
    handleError(error, t('检查角色管理权限失败'));
    return false;
  }
};
