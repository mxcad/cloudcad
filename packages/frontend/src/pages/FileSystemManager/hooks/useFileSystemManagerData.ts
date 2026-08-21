import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFileSystem } from '@/hooks/file-system';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import {
  useProjectPermissions,
  PROJECT_FILE_PERMISSIONS,
} from '@/hooks/useProjectPermissions';
import { ProjectPermission } from '@/constants/permissions';
import { useProjectQuota } from '@/hooks/useProjectQuota';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { useIsMobile } from '@/lib/useIsMobile';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import type { FileSystemNode } from '@/types/filesystem';
import type { ProjectFilterType } from '@/api-sdk';

interface UseFileSystemManagerDataOptions {
  mode: 'project' | 'personal-space';
}

/**
 * 文件系统管理器数据层：
 * - useFileSystem 全部输出
 * - personalSpaceId 同步
 * - 项目权限 / 派生权限位
 * - 派生视图数据（viewNodes / currentAncestorPath / handleFileOpen 等）
 */
export function useFileSystemManagerData({
  mode,
}: UseFileSystemManagerDataOptions) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');

  const { personalSpaceId, setPersonalSpaceId, setPersonalSpaceIdLoading } =
    useFileSystemStore();

  const fs = useFileSystem({ mode, personalSpaceId, projectFilter });

  const { clearSelection, handleFileOpen: handleFileOpenRaw } = fs;

  const clearUndoStack = useFileSystemUndoRedoStore((s) => s.clearStack);

  const projectId = fs.urlProjectId || '';

  const { data: projectQuota } = useProjectQuota(
    mode === 'project' && fs.urlProjectId ? fs.urlProjectId : undefined
  );

  useEffect(() => {
    clearUndoStack();
  }, [fs.urlProjectId, clearUndoStack]);

  const isAtRoot = mode === 'personal-space' ? false : !fs.urlProjectId;
  const displayNodes = Array.isArray(fs.nodes) ? fs.nodes : [];
  const {
    viewNodes,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes,
    currentPage: fs.paginationMeta?.page ?? 1,
    handlePageChange: fs.handlePageChange,
    // 查询身份变化（目录/搜索/每页数量/筛选）时强制整体替换，防滚动方向跨查询误合并
    resetKey: `${mode}|${fs.urlProjectId ?? ''}|${fs.urlNodeId ?? ''}|${fs.searchTerm}|${fs.pagination?.limit ?? 30}|${projectFilter}`,
  });

  const currentAncestorPath = useMemo(() => {
    if (isAtRoot || fs.isTrashView || fs.breadcrumbs.length <= 1) return '';
    return fs.breadcrumbs
      .slice(1)
      .map((c) => c.name)
      .join(' > ');
  }, [isAtRoot, fs.isTrashView, fs.breadcrumbs]);

  const handleFileOpen = useCallback(
    (node: FileSystemNode) => {
      clearSelection();
      handleFileOpenRaw(node);
    },
    [clearSelection, handleFileOpenRaw]
  );

  const { permissions: projectPermissions, loading: permissionsLoading } =
    useProjectPermissions(fs.urlProjectId);

  // 统一悲观语义：未加载/未包含的权限位归一为 false（undefined 不得泄漏到下游，
  // 否则下游 `!== false` / `?? true` 会退回乐观默认）。
  // 加载完成前的按钮可用性保持不变（全部隐藏），加载完成后按真实权限渲染。
  const projectPermissionsRecord = useMemo(() => {
    const record: Record<string, boolean> = {};
    for (const perm of PROJECT_FILE_PERMISSIONS) {
      record[perm] = projectPermissions[perm] === true;
    }
    return record;
  }, [projectPermissions]);

  const canCut = projectPermissionsRecord[ProjectPermission.FILE_MOVE] === true;
  const canCopy =
    projectPermissionsRecord[ProjectPermission.FILE_COPY] === true;
  const canDelete =
    projectPermissionsRecord[ProjectPermission.FILE_DELETE] === true;
  const canRestore =
    projectPermissionsRecord[ProjectPermission.FILE_TRASH_MANAGE] === true;
  const canUpload =
    projectPermissionsRecord[ProjectPermission.FILE_UPLOAD] === true;
  const canDownload =
    projectPermissionsRecord[ProjectPermission.FILE_DOWNLOAD] === true;

  const personalSpaceQuery = usePersonalSpaceQuery({
    enabled: mode === 'personal-space',
  });

  useEffect(() => {
    if (personalSpaceQuery.data?.id) {
      setPersonalSpaceId(personalSpaceQuery.data.id);
      setPersonalSpaceIdLoading(false);
    } else if (personalSpaceQuery.isError) {
      setPersonalSpaceIdLoading(false);
    }
  }, [
    personalSpaceQuery.data,
    personalSpaceQuery.isError,
    setPersonalSpaceId,
    setPersonalSpaceIdLoading,
  ]);

  return {
    mode,
    navigate,
    isMobile,
    projectFilter,
    setProjectFilter,
    projectId,
    projectQuota,
    fs,
    isAtRoot,
    displayNodes,
    viewNodes,
    minLoadedPage,
    currentAncestorPath,
    handleFileOpen,
    handleScrollPageChange,
    projectPermissionsRecord,
    permissionsLoading,
    canCut,
    canCopy,
    canDelete,
    canRestore,
    canUpload,
    canDownload,
  };
}
