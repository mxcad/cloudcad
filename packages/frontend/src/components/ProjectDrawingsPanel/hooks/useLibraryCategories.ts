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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingCategories,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockCategories,
} from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import { CategoryLevel } from '@/components/CategoryTabs';

export interface UseLibraryCategoriesReturn {
  libraryRootId: string | null;
  categories: CategoryLevel[];
  categoriesLoaded: boolean;
  selectedCategoryPath: string[];
  setSelectedCategoryPath: React.Dispatch<React.SetStateAction<string[]>>;
  handleCategorySelect: (level: number, categoryId: string) => Promise<void>;
  listInitializedRef: React.MutableRefObject<boolean>;
}

export function useLibraryCategories(
  isLibraryMode: boolean,
  libraryType: LibraryType | undefined
): UseLibraryCategoriesReturn {
  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryLevel[]>([]);
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
  }, [isLibraryMode, libraryType]);

  const handleCategorySelect = useCallback(
    async (level: number, categoryId: string) => {
      const newPath = selectedCategoryPath.slice(0, level);
      newPath.push(categoryId);

      try {
        localStorage.setItem(`library_category_path_${libraryType}`, JSON.stringify(newPath));
      } catch {
      }

      setSelectedCategoryPath(newPath);
    },
    [libraryType, selectedCategoryPath]
  );

  return {
    libraryRootId,
    categories,
    categoriesLoaded,
    selectedCategoryPath,
    setSelectedCategoryPath,
    handleCategorySelect,
    listInitializedRef,
  };
}
