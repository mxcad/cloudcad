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

// 模块级缓存：所有组件实例共享，避免切换 tab 时重新请求
interface CategoriesCacheEntry {
  rootId: string;
  categories: CategoryLevel[];
}
const categoriesCache = new Map<string, CategoriesCacheEntry>();

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
  libraryType: LibraryType | undefined,
  visible: boolean = true,
): UseLibraryCategoriesReturn {
  // 占位分类数据：始终渲染三级"全部"，确保加载前后高度一致，消除跳动
  const PLACEHOLDER_CATEGORIES: CategoryLevel[] = [
    { level: 0, items: [{ id: 'all', name: '全部' }] },
    { level: 1, items: [{ id: 'all', name: '全部' }] },
    { level: 2, items: [{ id: 'all', name: '全部' }] },
  ];

  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryLevel[]>(PLACEHOLDER_CATEGORIES);
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
  // 切换 visible 时优先使用缓存，无缓存才请求 API
  useEffect(() => {
    if (!visible || !isLibraryMode) return;

    const cacheKey = libraryType || '';
    const cached = categoriesCache.get(cacheKey);

    // 已有缓存，直接恢复状态（不重新请求）
    if (cached) {
      setLibraryRootId(cached.rootId);
      setCategories(cached.categories);
      setCategoriesLoaded(true);
      return;
    }

    // 无缓存，首次加载
    setCategories(PLACEHOLDER_CATEGORIES);
    setCategoriesLoaded(false);

    const fetchAll = async () => {
      try {
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
        let finalCategories = PLACEHOLDER_CATEGORIES;
        if (catData?.categories && catData.categories.length > 0) {
          const processed = catData.categories.map((level) => ({
            ...level,
            items: [
              { id: 'all', name: '全部' },
              ...level.items,
            ],
          }));
          const padded = [...processed];
          while (padded.length < 3) {
            const nextLevel = padded.length;
            padded.push({ level: nextLevel, items: [{ id: 'all', name: '全部' }] });
          }
          finalCategories = padded;
          setCategories(padded);
        }
        setCategoriesLoaded(true);

        // 写入模块级缓存
        if (libraryNode?.id) {
          categoriesCache.set(cacheKey, { rootId: libraryNode.id, categories: finalCategories });
        }
      } catch (error: unknown) {
        handleError(error, `useLibraryCategories: 加载${libraryType === 'drawing' ? '图纸' : '图块'}库分类失败`);
        setCategoriesLoaded(true);
      }
    };

    fetchAll();
  }, [visible, isLibraryMode, libraryType, categoriesRefreshKey]);

  // 暴露刷新分类列表的方法：清除缓存并重新请求
  const refreshCategories = useCallback(() => {
    if (libraryType) {
      categoriesCache.delete(libraryType);
    }
    setCategoriesRefreshKey((k) => k + 1);
  }, [libraryType]);
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
