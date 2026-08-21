import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { shareControllerListShares } from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { useFileBrowserSelection } from '@/hooks/file-browser/useFileBrowserSelection';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { getErrorMessage } from '@/utils/errorHandler';
import { PAGE_SIZE } from '../constants';
import type { SortConfig, SortField } from '../types';

interface ShareQueryData {
  items: ShareListItemDto[];
  total: number;
}

/**
 * 分享列表数据源（react-query + 滚动分页合并，ADR-0052 统一机制）
 *
 * - 翻页查询 useQuery + keepPreviousData（翻页期间保留旧数据占位）；
 * - useAccumulatedPagination 滚动合并：next 追加 / prev 前插 / 查询身份变化整体替换；
 * - 搜索为提交式（输入框值 search 与已提交词 searchQuery 分离，回车/按钮提交才查询）；
 * - 选择模型基于滚动合并列表 viewItems（跨页多选连续），查询身份变化清空选择。
 */
export function useShareData() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortConfig>({
    field: 'createdAt',
    order: 'desc',
  });

  // useMemo 稳定 queryKey 引用：setItems/setTotal 依赖它，避免每次渲染重建
  // 导致 useShareActions 回调抖动
  const queryKey = useMemo(
    () => ['shares', page, searchQuery, sort.field, sort.order] as const,
    [page, searchQuery, sort.field, sort.order]
  );

  const { data, isFetching, isLoading, error, refetch } = useQuery<ShareQueryData>({
    queryKey,
    queryFn: async () => {
      const result = await shareControllerListShares({
        query: {
          page,
          pageSize: PAGE_SIZE,
          search: searchQuery || undefined,
          sortBy: sort.field,
          sortOrder: sort.order,
        },
      });
      // SDK 默认不抛错：显式抛出让 react-query 进入 error 态展示真实原因
      if (result.error) throw result.error;
      const d = result.data as
        | { items: ShareListItemDto[]; total: number }
        | undefined;
      return { items: d?.items ?? [], total: d?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const loading = isFetching || isLoading;
  const errorMessage = error ? getErrorMessage(error) : null;

  // 滚动分页数据合并（搜索提交/排序变化时整体替换；滚动翻页不清空选择）
  const {
    viewNodes: viewItems,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes: items,
    currentPage: page,
    handlePageChange: setPage,
    resetKey: `${searchQuery}|${sort.field}|${sort.order}`,
  });

  // 选择模型：以滚动合并列表为渲染依据（跨页多选连续），以分享 token 作为列表项 id
  const selectableItems = useMemo(
    () => viewItems.map((i) => ({ id: i.token })),
    [viewItems]
  );
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useFileBrowserSelection({ nodes: selectableItems, multiple: 'always' });

  // 查询身份（提交词/排序）变化时清空选择（历史选择不再指向当前列表）
  useEffect(() => {
    clearSelection();
  }, [searchQuery, sort.field, sort.order, clearSelection]);

  // 兼容 useShareActions 的本地补丁接口（撤销/修改后的乐观更新）：写入 query 缓存
  const setItems: Dispatch<SetStateAction<ShareListItemDto[]>> = useCallback(
    (updater) => {
      queryClient.setQueryData<ShareQueryData>(queryKey, (prev) => {
        const cur = prev ?? { items: [], total: 0 };
        const nextItems =
          typeof updater === 'function' ? updater(cur.items) : updater;
        return { ...cur, items: nextItems };
      });
    },
    [queryClient, queryKey]
  );

  const setTotal: Dispatch<SetStateAction<number>> = useCallback(
    (updater) => {
      queryClient.setQueryData<ShareQueryData>(queryKey, (prev) => {
        const cur = prev ?? { items: [], total: 0 };
        const nextTotal =
          typeof updater === 'function' ? updater(cur.total) : updater;
        return { ...cur, total: nextTotal };
      });
    },
    [queryClient, queryKey]
  );

  // 刷新当前查询（批量撤销/编辑/关闭弹窗/失败重试后调用；参数已由状态驱动，忽略入参）。
  // 与滚动翻页（handleScrollPageChange）不同，刷新代表数据变更后重查，清空选择保持原语义
  const fetchShares = useCallback(async () => {
    clearSelection();
    await refetch();
  }, [clearSelection, refetch]);

  const handleSearch = useCallback(() => {
    setSearchQuery(search);
    setPage(1);
  }, [search]);

  const handleClearSearch = useCallback(() => {
    setSearch('');
    setSearchQuery('');
    setPage(1);
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  }, []);

  const allSelected =
    viewItems.length > 0 && selectedNodes.size === viewItems.length;

  const paginationMeta = useMemo(
    () => ({
      total,
      page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
    }),
    [total, page]
  );

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  return {
    // 渲染列表为滚动合并后的累计列表（跨页连续）
    items: viewItems,
    total,
    page,
    pageSize: PAGE_SIZE,
    loading,
    error: errorMessage,
    search,
    sort,
    selectedTokens: selectedNodes,
    allSelected,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    setItems,
    setTotal,
    setSearch,
    fetchShares,
    handleSearch,
    handleClearSearch,
    handleSort,
    paginationMeta,
    handlePageChange,
    handleScrollPageChange,
    minLoadedPage,
  };
}
