///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { projectControllerGetProjects } from '@/api-sdk';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorHandler';
import { ProjectPermission } from '@/constants/permissions';
import { FileSystemNode } from '@/types/filesystem';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { PAGE_SIZE } from '@/constants/pagination';
import type { ProjectFilterType, FileSystemNodeDto } from '@/api-sdk';

export interface NodePermissions {
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
}

interface UseProjectProjectsOptions {
  visible: boolean;
  isPersonalSpace: boolean;
  isLibraryMode: boolean;
  projectFilter: ProjectFilterType;
  projectRefreshKey: number;
}

function toFileSystemNode(p: FileSystemNodeDto): FileSystemNode {
  return {
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    nodeType: 'PROJECT',
    isFolder: true,
    isRoot: true,
    updatedAt: String(p.updatedAt || ''),
    parentId: undefined,
    createdAt: String(p.createdAt || ''),
    path: String(p.path || ''),
    ownerId: String(p.ownerId || ''),
  };
}

// 项目空间数据：分页加载项目列表（滚动合并）与各项目权限（按 nodeId 缓存到 Map，
// 只对新增项目请求权限，merge 进 Map）
export function useProjectProjects({
  visible,
  isPersonalSpace,
  isLibraryMode,
  projectFilter,
  projectRefreshKey,
}: UseProjectProjectsOptions) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [nodePermissions, setNodePermissions] = useState<
    Map<string, NodePermissions>
  >(new Map());
  // 已加载过权限的项目 id（避免滚动追加后对旧项目重复请求）
  const loadedPermissionIdsRef = useRef<Set<string>>(new Set());

  // 查询身份（filter）变化重置页码：新 filter 从第 1 页开始，
  // 否则停留在深层页码会请求新 filter 的第 N 页（页数不足 → 误报「暂无项目」）
  const prevFilterRef = useRef(projectFilter);
  useEffect(() => {
    if (prevFilterRef.current !== projectFilter) {
      prevFilterRef.current = projectFilter;
      setPage(1);
    }
  }, [projectFilter]);

  // visible 门控：4 个面板始终挂载（display:none），隐藏面板不请求
  const queryEnabled = visible && !isPersonalSpace && !isLibraryMode;

  const { data, isFetching, isLoading, error, refetch } = useQuery({
    queryKey: ['sidebar-projects', projectFilter, projectRefreshKey, page],
    queryFn: async () => {
      const result = await projectControllerGetProjects({
        query: { filter: projectFilter, page, limit: PAGE_SIZE },
      });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 react-query 进入 error 态，
      // 否则失败被当作"无项目"空态
      if (result.error) throw result.error;
      const projectList = result.data?.nodes || [];
      return {
        nodes: projectList.map(toFileSystemNode),
        total: result.data?.total ?? 0,
        totalPages: result.data?.totalPages ?? 0,
      };
    },
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
  });

  const projects = data?.nodes ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  // 滚动分页数据合并（filter/刷新变化时整体替换；滚动翻页追加/前插）
  const {
    viewNodes: viewProjects,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes: projects,
    currentPage: page,
    handlePageChange: setPage,
    resetKey: `${projectFilter}|${projectRefreshKey}`,
  });

  // Load project permissions：只对新增项目加载（Map 已有 key 跳过）——
  // 替代原全量 Promise.all（分页后每页到达只需为该页项目请求权限）。
  // loadProjectPermissionData 内部有 TTL 缓存 + in-flight 合并，同项目重复调用不贵
  useEffect(() => {
    if (!queryEnabled || viewProjects.length === 0) return;
    const loadProjectPermissions = async () => {
      const newProjects = viewProjects.filter(
        (project) => !loadedPermissionIdsRef.current.has(project.id)
      );
      if (newProjects.length === 0) return;
      const { loadProjectPermissionData } =
        await import('@/utils/permissionUtils');
      const permissionsResults = await Promise.all(
        newProjects.map(async (project) => {
          const data = await loadProjectPermissionData(project.id);
          const perms = data.permissions;
          return {
            projectId: project.id,
            canEdit: perms.includes(ProjectPermission.PROJECT_UPDATE),
            canDelete: perms.includes(ProjectPermission.PROJECT_DELETE),
            canManageMembers: perms.includes(
              ProjectPermission.PROJECT_MEMBER_MANAGE
            ),
            canManageRoles: perms.includes(
              ProjectPermission.PROJECT_ROLE_MANAGE
            ),
          };
        })
      );
      permissionsResults.forEach((r) =>
        loadedPermissionIdsRef.current.add(r.projectId)
      );
      setNodePermissions((prev) => {
        const newMap = new Map(prev);
        permissionsResults.forEach((r) =>
          newMap.set(r.projectId, {
            canEdit: r.canEdit,
            canDelete: r.canDelete,
            canManageMembers: r.canManageMembers,
            canManageRoles: r.canManageRoles,
          })
        );
        return newMap;
      });
    };
    loadProjectPermissions();
  }, [queryEnabled, viewProjects, user]);

  const loading = isFetching || isLoading;
  const errorMessage = error ? getErrorMessage(error) : null;

  // 刷新当前页（失败条重试）
  const retryLoadMore = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    projects: viewProjects,
    nodePermissions,
    page,
    total,
    totalPages,
    loading,
    error: errorMessage,
    handleScrollPageChange,
    retryLoadMore,
    minLoadedPage,
  };
}
