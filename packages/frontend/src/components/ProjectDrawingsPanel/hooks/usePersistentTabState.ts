///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSidebarDrawingsTabStore } from '@/stores/sidebarDrawingsTabStore';

interface UsePersistentTabStateOptions {
  /** 子tab标识 */
  tabId?: string;
  /** 是否为库模式 */
  isLibraryMode: boolean;
  /** 面板是否可见 */
  visible: boolean;
  /** 个人空间模式的初始projectId */
  initialProjectId?: string;
  /** 是否为个人空间模式 */
  isPersonalSpace: boolean;
}

interface UsePersistentTabStateReturn {
  /** 选中的项目ID */
  selectedProjectId: string | null;
  /** 设置选中的项目ID */
  setSelectedProjectId: (id: string | null) => void;
  /** 面包屑导航 */
  breadcrumb: { id: string; name: string }[];
  /** 设置面包屑导航 */
  setBreadcrumb: React.Dispatch<React.SetStateAction<{ id: string; name: string }[]>>;
  /** 搜索查询 */
  searchQuery: string;
  /** 设置搜索查询 */
  setSearchQuery: (query: string) => void;
  /** 当前页码 */
  currentPage: number;
  /** 设置当前页码 */
  setCurrentPage: (page: number) => void;
}

/**
 * 持久化Tab状态 Hook
 *
 * 管理子tab的持久化状态，包括 selectedProjectId、breadcrumb、searchQuery、currentPage。
 * 仅在非库模式下使用，库模式保持原有行为。
 */
export function usePersistentTabState({
  tabId,
  isLibraryMode,
  visible,
  initialProjectId,
  isPersonalSpace,
}: UsePersistentTabStateOptions): UsePersistentTabStateReturn {
  // 持久化模式标识（仅非库模式使用）
  const isPersistentMode = !isLibraryMode && !!tabId;
  const { getSubTabState, updateSubTab } = useSidebarDrawingsTabStore();
  const persistentState = isPersistentMode ? getSubTabState(tabId!) : null;
  const prevVisibleRef = useRef(visible);
  const initializedRef = useRef(false);

  // 初始化状态
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => {
      if (isPersistentMode && persistentState?.initialized) {
        return persistentState.selectedProjectId;
      }
      return isPersonalSpace ? initialProjectId || null : null;
    }
  );

  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>(
    () => {
      if (isPersistentMode && persistentState?.initialized) {
        return persistentState.breadcrumb;
      }
      return [];
    }
  );

  const [searchQuery, setSearchQuery] = useState('');

  const [currentPage, setCurrentPage] = useState(1);

  // 包装 setter 函数以触发持久化
  const handleSetSelectedProjectId = useCallback(
    (id: string | null) => {
      setSelectedProjectId(id);
    },
    []
  );

  const handleSetBreadcrumb = useCallback(
    (itemsOrUpdater: { id: string; name: string }[] | ((prev: { id: string; name: string }[]) => { id: string; name: string }[])) => {
      if (typeof itemsOrUpdater === 'function') {
        setBreadcrumb(itemsOrUpdater);
      } else {
        setBreadcrumb(itemsOrUpdater);
      }
    },
    []
  );

  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSetCurrentPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 持久化状态同步 effect
  useEffect(() => {
    if (!isPersistentMode || !visible || !initializedRef.current) return;
    // 更新持久化状态
    updateSubTab(tabId!, {
      selectedProjectId,
      breadcrumb,
      searchQuery,
      currentPage,
    });
  }, [
    isPersistentMode,
    tabId,
    visible,
    selectedProjectId,
    breadcrumb,
    searchQuery,
    currentPage,
    updateSubTab,
  ]);

  // 可见性变化时恢复状态
  useEffect(() => {
    if (!isPersistentMode) return;
    if (prevVisibleRef.current === visible) return;
    prevVisibleRef.current = visible;

    if (visible && persistentState?.initialized && !initializedRef.current) {
      // 恢复持久化状态
      setSelectedProjectId(persistentState.selectedProjectId);
      setBreadcrumb(persistentState.breadcrumb);
      setSearchQuery(persistentState.searchQuery);
      setCurrentPage(persistentState.currentPage);
      initializedRef.current = true;
    } else if (visible && !initializedRef.current) {
      // 首次可见，标记已初始化
      initializedRef.current = true;
      updateSubTab(tabId!, {
        selectedProjectId,
        breadcrumb,
        searchQuery,
        currentPage,
        initialized: true,
      });
    }
  }, [
    isPersistentMode,
    visible,
    persistentState,
    tabId,
    selectedProjectId,
    breadcrumb,
    searchQuery,
    currentPage,
    updateSubTab,
  ]);

  return {
    selectedProjectId,
    setSelectedProjectId: handleSetSelectedProjectId,
    breadcrumb,
    setBreadcrumb: handleSetBreadcrumb,
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    currentPage,
    setCurrentPage: handleSetCurrentPage,
  };
}
