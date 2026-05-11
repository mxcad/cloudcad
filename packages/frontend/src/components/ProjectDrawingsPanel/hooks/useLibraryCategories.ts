///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * useLibraryCategories - 资源库分类加载 Hook（方案 B：单次 API 调用）
 *
 * 使用新的 /library/drawing/categories 和 /library/block/categories 端点，
 * 一次请求获取全部三级分类树。后端通过 PostgreSQL 递归 CTE 在单次数据库查询
 * 中完成所有层级的检索，前端不再需要多次 API 调用和渐进式加载。
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingCategories,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockCategories,
} from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import { CategoryLevel, type CategoryItem } from '@/components/CategoryTabs';

// 根据选中路径过滤分类：上级选中具体分类时，下级只显示属于该父分类的项（含"全部"）
function filterCategoriesBySelection(
  allCategories: CategoryLevel[],
  selectedPath: string[],
): CategoryLevel[] {
  return allCategories.map((levelData) => {
    const level = levelData.level;
    if (level === 0) return levelData; // L0 不需要过滤

    // 获取上一级选中的分类 ID
    const parentSelectedId = selectedPath[level - 1];
    if (!parentSelectedId || parentSelectedId === 'all') return levelData; // 上级为"全部"，显示全部

    const filteredItems = levelData.items.filter(
      (item) => item.id === 'all' || item.parentId === parentSelectedId,
    );
    return { ...levelData, items: filteredItems };
  });
}

export interface UseLibraryCategoriesReturn {
  libraryRootId: string | null;
  categories: CategoryLevel[];
  categoriesLoaded: boolean;
  selectedCategoryPath: string[];
  setSelectedCategoryPath: React.Dispatch<React.SetStateAction<string[]>>;
  handleCategorySelect: (level: number, categoryId: string) => Promise<void>;
  refreshCategories: () => void;
  listInitializedRef: React.MutableRefObject<boolean>;
}

export function useLibraryCategories(
  isLibraryMode: boolean,
  libraryType: LibraryType | undefined
): UseLibraryCategoriesReturn {
  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryLevel[]>([]);
  const [categoriesRefreshKey, setCategoriesRefreshKey] = useState(0);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  const getDefaultCategoryPath = (): string[] => {
    try {
      const saved = localStorage.getItem(`library_category_path_${libraryType}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
    }
    return ['all'];
  };

  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string[]>(
    getDefaultCategoryPath
  );

  const listInitializedRef = useRef(false);

  // 图书馆模式：并行获取库根节点和全部三级分类（一次请求）
  useEffect(() => {
    if (!isLibraryMode) return;

    setCategories([]);
    setCategoriesLoaded(false);

    const fetchAll = async () => {
      try {
        // 并行获取根节点（需要其 ID 用于"全部"文件加载）和分类树
        const [rootResponse, categoriesResponse] = await Promise.all([
          libraryType === 'drawing'
            ? libraryControllerGetDrawingLibrary()
            : libraryControllerGetBlockLibrary(),
          libraryType === 'drawing'
            ? libraryControllerGetDrawingCategories()
            : libraryControllerGetBlockCategories(),
        ]);

        const libraryNode = rootResponse.data as { id?: string } | undefined;
        if (libraryNode?.id) {
          setLibraryRootId(libraryNode.id);
        }

        const catData = categoriesResponse.data as { categories?: CategoryLevel[] } | undefined;
        if (catData?.categories && catData.categories.length > 0) {
          setCategories(catData.categories);
        }
        setCategoriesLoaded(true);
      } catch (error: unknown) {
        handleError(error, `useLibraryCategories: 加载${libraryType === 'drawing' ? '图纸' : '图块'}库分类失败`);
        setCategoriesLoaded(true);
      }
    };

    fetchAll();
  }, [isLibraryMode, libraryType, categoriesRefreshKey]);

  // 暴露刷新分类列表的方法
  const refreshCategories = useCallback(() => {
    setCategoriesRefreshKey((k) => k + 1);
  }, []);
  const handleCategorySelect = useCallback(
    async (level: number, categoryId: string) => {
      // 使用函数式 setState 避免 stale closure。
      // 选中某级时，重置所有更深层级为 'all'。
      setSelectedCategoryPath((prev) => {
        const newPath = [...prev.slice(0, level), categoryId];
        // 补齐到 3 级，确保路径长度匹配分类级数
        while (newPath.length < 3) newPath.push('all');
        try {
          localStorage.setItem(`library_category_path_${libraryType}`, JSON.stringify(newPath));
        } catch {
        }
        return newPath;
      });
    },
    [libraryType]
  );

  // 根据选中路径过滤分类：上级选中具体分类时，下级只显示属于该父分类的项
  const filteredCategories = useMemo(
    () => filterCategoriesBySelection(categories, selectedCategoryPath),
    [categories, selectedCategoryPath],
  );

  return {
    libraryRootId,
    categories: filteredCategories,
    categoriesLoaded,
    selectedCategoryPath,
    setSelectedCategoryPath,
    handleCategorySelect,
    refreshCategories,
    listInitializedRef,
  };
}
