///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingChildren,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockChildren,
  libraryControllerGetBlockAllFiles,
} from '@/api-sdk';
import { FileSystemNode } from '@/types/filesystem';
import { handleError } from '@/utils/errorHandler';
import { PAGE_SIZE } from '@/components/ProjectDrawingsPanel/constants';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import { CategoryLevel, CategoryItem } from '@/components/CategoryTabs';

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

  // 加载分类数据
  const loadCategories = useCallback(
    async (parentId: string, level: number) => {
      try {
        const response =
          libraryType === 'drawing'
            ? await libraryControllerGetDrawingChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } })
            : await libraryControllerGetBlockChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } });

        const folders = (response as any)?.nodes || [];

        const items: CategoryItem[] = [
          { id: 'all', name: '全部', hasChildren: level === 0 },
          ...folders.map((folder: FileSystemNode) => ({
            id: folder.id,
            name: folder.name,
            hasChildren: true,
          })),
        ];

        setCategories((prev) => {
          const newCategories = [...prev];
          if (level < newCategories.length) {
            const existing = newCategories[level];
            if (!existing || existing.items.length <= 1 || items.length > existing.items.length) {
              newCategories[level] = { level, items };
            }
          } else {
            newCategories.push({ level, items });
          }
          if (level <= 1) {
            return newCategories;
          }
          return newCategories.slice(0, level + 1);
        });

        if (folders.length > 0 && level < 2) {
          folders.forEach((folder: FileSystemNode) => {
            loadCategories(folder.id, level + 1).catch(() => {
              // 忽略预加载错误
            });
          });
        }
      } catch (error: unknown) {
        handleError(error, `useLibraryCategories: 加载第 ${level} 级分类失败`);
      }
    },
    [libraryType]
  );

  // 图书馆模式：获取库根节点并递归加载所有层级分类
  useEffect(() => {
    if (!isLibraryMode) return;

    setCategories([]);
    setCategoriesLoaded(false);

    const loadAllCategories = async (parentId: string, level: number): Promise<CategoryLevel | null> => {
      try {
        const response =
          libraryType === 'drawing'
            ? await libraryControllerGetDrawingChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } })
            : await libraryControllerGetBlockChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } });

        const folders = (response as any)?.nodes || [];

        const items: CategoryItem[] = [
          { id: 'all', name: '全部', hasChildren: level === 0 },
          ...folders.map((folder: FileSystemNode) => ({
            id: folder.id,
            name: folder.name,
            hasChildren: true,
          })),
        ];

        const currentLevel: CategoryLevel = { level, items };

        if (level < 2 && folders.length > 0) {
          const childPromises = folders.map((folder: any) =>
            loadAllCategories(folder.id, level + 1)
          );
          (await Promise.all(childPromises)).filter(Boolean) as CategoryLevel[];
        }

        return currentLevel;
      } catch (error: unknown) {
        handleError(error, `useLibraryCategories: 加载第 ${level} 级分类失败`);
        return null;
      }
    };

    const loadAllLevels = async (rootId: string): Promise<CategoryLevel[]> => {
      const levels: CategoryLevel[] = [];

      const level0 = await loadAllCategories(rootId, 0);
      if (level0) {
        levels[0] = level0;

        const level1Folders = level0.items.filter(item => item.id !== 'all');
        if (level1Folders.length > 0) {
          const level1ItemsMap = new Map<string, CategoryItem[]>();
          level1ItemsMap.set('all', [{ id: 'all', name: '全部', hasChildren: true }]);

          const level1Promises = level1Folders.map(async (folder) => {
            const level1 = await loadAllCategories(folder.id, 1);
            if (level1) {
              level1ItemsMap.set(folder.id, level1.items);
            }
          });
          await Promise.all(level1Promises);

          const allLevel1Items: CategoryItem[] = [{ id: 'all', name: '全部', hasChildren: true }];
          const seenIds = new Set(['all']);
          level1ItemsMap.forEach((items) => {
            items.forEach(item => {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                allLevel1Items.push(item);
              }
            });
          });

          levels[1] = { level: 1, items: allLevel1Items };

          const level2Folders = allLevel1Items.filter(item => item.id !== 'all');
          if (level2Folders.length > 0) {
            const level2ItemsMap = new Map<string, CategoryItem[]>();
            level2ItemsMap.set('all', [{ id: 'all', name: '全部', hasChildren: false }]);

            const level2Promises = level2Folders.map(async (folder) => {
              const level2 = await loadAllCategories(folder.id, 2);
              if (level2) {
                level2ItemsMap.set(folder.id, level2.items);
              }
            });
            await Promise.all(level2Promises);

            const allLevel2Items: CategoryItem[] = [{ id: 'all', name: '全部', hasChildren: false }];
            const seenLevel2Ids = new Set(['all']);
            level2ItemsMap.forEach((items) => {
              items.forEach(item => {
                if (!seenLevel2Ids.has(item.id)) {
                  seenLevel2Ids.add(item.id);
                  allLevel2Items.push(item);
                }
              });
            });

            levels[2] = { level: 2, items: allLevel2Items };
          }
        }
      }

      return levels;
    };

    const fetchLibraryRoot = async () => {
      try {
        const response =
          libraryType === 'drawing'
            ? await libraryControllerGetDrawingLibrary()
            : await libraryControllerGetBlockLibrary();
        const libraryNode = response as any as { id?: string; name?: string };
        if (libraryNode?.id) {
          setLibraryRootId(libraryNode.id);

          try {
            const allLevels = await loadAllLevels(libraryNode.id);
            setCategories(allLevels);
            setCategoriesLoaded(true);
          } catch (error: unknown) {
            handleError(error, 'useLibraryCategories: 加载分类失败');
            setCategoriesLoaded(true);
          }
        }
      } catch (error: unknown) {
        handleError(error, `useLibraryCategories: 获取${libraryType === 'drawing' ? '图纸' : '图块'}库根节点失败`);
        setCategoriesLoaded(true);
      }
    };

    fetchLibraryRoot();
  }, [libraryType]);

  const handleCategorySelect = useCallback(
    async (level: number, categoryId: string) => {
      const newPath = selectedCategoryPath.slice(0, level);
      newPath.push(categoryId);

      try {
        localStorage.setItem(`library_category_path_${libraryType}`, JSON.stringify(newPath));
      } catch {
      }

      setSelectedCategoryPath(newPath);

      if (categoryId === 'all') {
        if (libraryRootId) {
          try {
            const response =
              libraryType === 'drawing'
                ? await libraryControllerGetDrawingAllFiles({ path: { nodeId: libraryRootId }, query: {
                    page: 1,
                    limit: PAGE_SIZE,
                  } })
                : await libraryControllerGetBlockAllFiles({ path: { nodeId: libraryRootId }, query: {
                    page: 1,
                    limit: PAGE_SIZE,
                  } });

            const files = (response as any)?.nodes || [];
            // Note: These values need to be consumed by the caller
            // We don't set nodes here - that's done by the caller via the callback pattern
          } catch (error: unknown) {
            handleError(error, 'useLibraryCategories: 获取所有文件失败');
          }
        }
      } else {
        let childCategories: CategoryItem[] = [{ id: 'all', name: '全部', hasChildren: level < 1 }];
        try {
          const response =
            libraryType === 'drawing'
              ? await libraryControllerGetDrawingChildren({ path: { nodeId: categoryId }, query: {
                  nodeType: 'folder',
                  limit: 100,
                } })
              : await libraryControllerGetBlockChildren({ path: { nodeId: categoryId }, query: {
                  nodeType: 'folder',
                  limit: 100,
                } });

          const folders = (response as any)?.nodes || [];
          childCategories = [
            { id: 'all', name: '全部', hasChildren: level < 1 },
            ...folders.map((folder: FileSystemNode) => ({
              id: folder.id,
              name: folder.name,
              hasChildren: true,
            })),
          ];
        } catch (error: unknown) {
          handleError(error, 'useLibraryCategories: 加载子分类失败');
        }

        setCategories(prev => {
          const newCategories = [...prev];
          const nextLevel = level + 1;
          if (nextLevel < newCategories.length) {
            newCategories[nextLevel] = { level: nextLevel, items: childCategories };
          } else {
            newCategories.push({ level: nextLevel, items: childCategories });
          }
          return newCategories.slice(0, nextLevel + 1);
        });
      }
    },
    [libraryRootId, libraryType, selectedCategoryPath]
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
