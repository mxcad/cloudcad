///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * useTrashView - 回收站子域 Hook：视图状态/toggle 副作用（清搜索→重置分页→刷新）/
 * trash query（配置由 trashQuery.ts 构建）/restore/batchRestore/clearTrash
 * （trashActions.ts，undo 联动）/面包屑/门控派生。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { t } from '@/languages';
import type { BreadcrumbItem, FileSystemNode } from '@/types/filesystem';
import type { PaginationMeta } from '@/components/ui/Pagination';
import type { SearchFilterValues } from '@/components/search/SearchFilters';

import { useTrashActions } from './trashActions';
import { buildTrashBreadcrumbs, buildTrashQueryOptions } from './trashQuery';
import type { TrashListData } from './trashQuery';

export type { TrashListData } from './trashQuery';

type ShowToastFn = (
  message: string,
  type: 'success' | 'error' | 'info' | 'warning'
) => void;

type ShowConfirmFn = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  type?: 'danger' | 'warning' | 'info',
  confirmText?: string
) => void;

interface UseTrashViewOptions {
  isProjectRootMode: boolean;
  isPersonalSpaceMode?: boolean;
  urlProjectId?: string;
  urlNodeId?: string;
  searchQuery: string;
  searchFilters?: SearchFilterValues;
  pagination: { page: number; limit: number };
  setPagination: React.Dispatch<
    React.SetStateAction<{ page: number; limit: number }>
  >;
  showToast: ShowToastFn;
  showConfirm: ShowConfirmFn;
  /** 当前选中节点集合（组合层经 ref 注入） */
  selectedNodesRef: React.MutableRefObject<Set<string>>;
  /** 清除选择回调（组合层经 ref 注入） */
  clearSelectionRef: React.MutableRefObject<() => void>;
  /** 清空全局搜索框（toggle 副作用第一步） */
  setStoreSearchTerm: (term: string) => void;
  /** 触发列表刷新（toggle 副作用第三步） */
  refresh: () => void;
  /** 动作完成后刷新数据 */
  loadData: () => void;
  /** 当前项目节点（trash 面包屑根节点名称来源） */
  currentNode: FileSystemNode | null;
}

export const useTrashView = ({
  isProjectRootMode,
  isPersonalSpaceMode = false,
  urlProjectId,
  urlNodeId,
  searchQuery,
  searchFilters = {},
  pagination,
  setPagination,
  showToast,
  showConfirm,
  selectedNodesRef,
  clearSelectionRef,
  setStoreSearchTerm,
  refresh,
  loadData,
  currentNode,
}: UseTrashViewOptions) => {
  // ── 视图状态 ────────────────────────────────────────────────────────
  const [isTrashView, setIsTrashView] = useState(false);

  // 模式切换时重置回收站视图
  useEffect(() => {
    setIsTrashView(false);
  }, [isProjectRootMode]);

  const toggle = useCallback(() => {
    setIsTrashView((prev) => !prev);
  }, []);

  // toggle 副作用（顺序保持：清空搜索 → 重置分页 → 刷新）
  const prevIsTrashViewRef = useRef(isTrashView);
  useEffect(() => {
    if (prevIsTrashViewRef.current !== isTrashView) {
      setStoreSearchTerm('');
      setPagination((prev) => ({ ...prev, page: 1 }));
      refresh();
      prevIsTrashViewRef.current = isTrashView;
    }
  }, [isTrashView, setStoreSearchTerm, setPagination, refresh]);

  // ── trash 查询（配置由 trashQuery.ts 构建） ────────────────────────
  const projectIdForTrash =
    isTrashView && !isProjectRootMode ? urlProjectId || '' : undefined;

  const trashQuery = useQuery(
    buildTrashQueryOptions({
      projectIdForTrash,
      page: pagination.page,
      limit: pagination.limit,
      searchQuery,
      searchFilters,
      isTrashView,
    })
  );

  const trashData: TrashListData | null = trashQuery.data ?? null;
  const trashNodes: FileSystemNode[] = trashData?.nodes || [];

  // ── trash 面包屑（trashQuery.ts 派生） ─────────────────────────────
  const trashBreadcrumbs: BreadcrumbItem[] = buildTrashBreadcrumbs({
    isTrashView,
    isPersonalSpaceMode,
    isProjectRootMode,
    urlProjectId,
    urlNodeId,
    currentNode,
  });

  // ── 动作（trashActions.ts：restore/batchRestore/clearTrash） ───────
  const { restore, batchRestore, clearTrash } = useTrashActions({
    urlProjectId,
    showToast,
    showConfirm,
    selectedNodesRef,
    clearSelectionRef,
    loadData,
  });

  // ── 门控派生（回收站视图门控，props 层与权限派生双条件消费） ──────
  const canRestore = isTrashView;
  const canDelete = isTrashView;
  const trashPaginationMeta: PaginationMeta | null = trashData
    ? {
        total: trashData.total,
        page: trashData.page,
        limit: trashData.limit,
        totalPages: trashData.totalPages,
      }
    : null;

  return {
    isTrashView,
    setIsTrashView,
    toggle,
    restore,
    batchRestore,
    clearTrash,
    trashBreadcrumbs,
    trashData,
    trashNodes,
    trashPaginationMeta,
    trashLoading: trashQuery.isLoading,
    trashIsFetching: trashQuery.isFetching,
    trashError: trashQuery.error
      ? trashQuery.error instanceof Error
        ? trashQuery.error.message
        : t('加载数据失败')
      : null,
    canRestore,
    canDelete,
  };
};
