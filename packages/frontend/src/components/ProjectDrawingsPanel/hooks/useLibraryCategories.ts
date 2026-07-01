import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingCategories,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockCategories,
} from '@/api-sdk';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import { CategoryLevel, type CategoryItem } from '@/components/CategoryTabs';
import { t } from '@/languages';

// 分类 queryKey 定义在本地而非 queryKeys，避免 Vite HMR 级联刷新 useLibraryQuery 导致其 React Query 缓存丢失
const drawingCategoriesKey = ['library', 'drawing', 'categories'] as const;
const blockCategoriesKey = ['library', 'block', 'categories'] as const;

interface CategoriesData {
  rootId: string;
  categories: CategoryLevel[];
}

const PLACEHOLDER_CATEGORIES: CategoryLevel[] = [
  { level: 0, items: [{ id: 'all', name: t('全部') }] },
  { level: 1, items: [{ id: 'all', name: t('全部') }] },
  { level: 2, items: [{ id: 'all', name: t('全部') }] },
];

function filterCategoriesBySelection(
  allCategories: CategoryLevel[],
  selectedPath: string[],
): CategoryLevel[] {
  return allCategories.map((levelData) => {
    const level = levelData.level;
    if (level === 0) return levelData;
    const parentSelectedId = selectedPath[level - 1];
    if (!parentSelectedId || parentSelectedId === 'all') return levelData;
    const filteredItems = levelData.items.filter(
      (item) => item.id === 'all' || item.parentId === parentSelectedId,
    );
    return { ...levelData, items: filteredItems };
  });
}

async function fetchCategories(libraryType: LibraryType): Promise<CategoriesData> {
  const [rootResponse, categoriesResponse] = await Promise.all([
    libraryType === 'drawing'
      ? libraryControllerGetDrawingLibrary()
      : libraryControllerGetBlockLibrary(),
    libraryType === 'drawing'
      ? libraryControllerGetDrawingCategories()
      : libraryControllerGetBlockCategories(),
  ]);
  if (rootResponse.error) throw rootResponse.error;
  if (categoriesResponse.error) throw categoriesResponse.error;

  const libraryNode = rootResponse.data as { id?: string } | undefined;

  const catData = categoriesResponse.data as { categories?: CategoryLevel[] } | undefined;
  let finalCategories = PLACEHOLDER_CATEGORIES;
  if (catData?.categories && catData.categories.length > 0) {
    const processed = catData.categories.map((level) => ({
      ...level,
      items: [
        { id: 'all', name: t('全部') },
        ...level.items,
      ],
    }));
    const padded = [...processed];
    while (padded.length < 3) {
      const nextLevel = padded.length;
      padded.push({ level: nextLevel, items: [{ id: 'all', name: t('全部') }] });
    }
    finalCategories = padded;
  }

  return {
    rootId: libraryNode?.id || '',
    categories: finalCategories,
  };
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
  const queryClient = useQueryClient();

  const queryKey = libraryType === 'drawing'
    ? drawingCategoriesKey
    : libraryType === 'block'
      ? blockCategoriesKey
      : ['library', 'categories', 'none'] as const;

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchCategories(libraryType!),
    enabled: visible && isLibraryMode && !!libraryType,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // libraryRootId 为 '' 时统一视为 null，避免外部 !libraryRootId 守卫拦截
  const libraryRootId = useMemo(() => data?.rootId || null, [data]);

  // categoriesLoaded: 仅当 visible + isLibraryMode 且请求完成（含降级）
  // 注意：isLoading=false 表示数据已就绪（可能是缓存命中或 API 返回）
  const categoriesLoaded = visible && isLibraryMode && !isLoading;

  // 加载中或未就绪时用占位分类，命中缓存后用真实数据
  const categories = useMemo(() => {
    if (!visible || !isLibraryMode || !data) return PLACEHOLDER_CATEGORIES;
    return data.categories;
  }, [visible, isLibraryMode, data]);

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

  const refreshCategories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const handleCategorySelect = useCallback(
    async (level: number, categoryId: string) => {
      setSelectedCategoryPath((prev) => {
        const newPath = [...prev.slice(0, level), categoryId];
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
