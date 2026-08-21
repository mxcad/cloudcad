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
 * useFileSystemEffects - 文件系统加载编排副作用
 *
 * 收拢组合层中跨 hook 的加载序列：
 * - projectFilter 变化监听（清搜索 → 重置分页 → 刷新）
 * - 初始加载与参数变化监听（refreshCount 驱动手动刷新）
 * - pagination 变化监听
 * - searchTerm 变化监听（含 200ms 延迟，避免 hasSearch 状态过渡竞态）
 * - 搜索提交 / 搜索词变化包装
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectFilterType } from '@/api-sdk';

interface UseFileSystemEffectsOptions {
  urlProjectId: string | undefined;
  urlNodeId: string | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setStoreSearchTerm: (term: string) => void;
  pagination: { page: number; limit: number };
  setPagination: React.Dispatch<
    React.SetStateAction<{ page: number; limit: number }>
  >;
  loadData: () => void;
  checkShouldLoadData: () => boolean;
  /** 项目过滤类型：all-全部，owned-我创建的，joined-我加入的 */
  externalProjectFilter?: ProjectFilterType;
}

export const useFileSystemEffects = ({
  urlProjectId,
  urlNodeId,
  searchQuery,
  setSearchQuery,
  setStoreSearchTerm,
  pagination,
  setPagination,
  loadData,
  checkShouldLoadData,
  externalProjectFilter,
}: UseFileSystemEffectsOptions) => {
  // 刷新操作
  const [refreshCount, setRefreshCount] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshCount((prev) => prev + 1);
  }, []);

  interface UseFileSystemProps {
    urlProjectId: string;
    urlNodeId: string | undefined;
    refreshCount: number;
  }

  // 参数变化跟踪
  const prevParamsRef = useRef<UseFileSystemProps | null>(null);

  // 监听 projectFilter 变化（项目过滤：全部/我创建的/我加入的）
  const prevProjectFilterRef = useRef(externalProjectFilter);
  useEffect(() => {
    if (prevProjectFilterRef.current !== externalProjectFilter) {
      setStoreSearchTerm('');
      setPagination((prev) => ({ ...prev, page: 1 }));
      setRefreshCount((prev) => prev + 1);
      prevProjectFilterRef.current = externalProjectFilter;
    }
  }, [externalProjectFilter, setStoreSearchTerm, setPagination]);

  // 初始加载和参数变化监听
  useEffect(() => {
    const currentParams = {
      urlProjectId,
      urlNodeId,
      refreshCount,
    } as UseFileSystemProps;

    const hasChanged =
      prevParamsRef.current === null ||
      prevParamsRef.current.urlProjectId !== currentParams.urlProjectId ||
      prevParamsRef.current.urlNodeId !== currentParams.urlNodeId ||
      prevParamsRef.current.refreshCount !== currentParams.refreshCount;

    prevParamsRef.current = currentParams;

    if (!hasChanged) {
      return;
    }

    setPagination((prev) => ({ ...prev, page: 1 }));
    // 直接使用 loadData，不将其放入依赖项（loadData 内部使用 ref 管理，不会捕获过时的闭包）
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId, urlNodeId, refreshCount, setPagination]);

  // 监听 pagination 变化
  useEffect(() => {
    if (checkShouldLoadData()) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination, checkShouldLoadData]);

  // 监听 searchTerm 变化
  const prevSearchTermRef = useRef('');
  useEffect(() => {
    if (searchQuery === '' && prevSearchTermRef.current !== '') {
      setPagination((prev) => ({ ...prev, page: 1 }));
      // 200ms 延迟：等待 store 中的搜索状态完全清除后再重新加载数据
      // 避免与 useFileSystemData 中 hasSearch 状态过渡期间的条件竞争
      setTimeout(() => {
        loadData();
      }, 200);
    }
    prevSearchTermRef.current = searchQuery;
  }, [searchQuery, loadData, setPagination]);

  // 搜索提交
  const handleSearchSubmit = useCallback(() => {
    loadData();
  }, [loadData]);

  // 搜索词变化处理
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setStoreSearchTerm(query);
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    [setSearchQuery, setStoreSearchTerm, setPagination]
  );

  return {
    refreshCount,
    handleRefresh,
    handleSearchSubmit,
    handleSearchChange,
  };
};

export type { UseFileSystemEffectsOptions };
