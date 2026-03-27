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

import { FileSystemNode } from '@/types/filesystem';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// localStorage 版本控制
const VIEW_MODE_VERSION = 'v1';
const VIEW_MODE_KEY = `fileViewMode:${VIEW_MODE_VERSION}`;

/**
 * 安全的 localStorage 操作
 */
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

// 从 localStorage 读取保存的视图模式
const getInitialViewMode = (): 'grid' | 'list' => {
  if (typeof window === 'undefined') return 'grid';
  const saved = safeStorage.getItem(VIEW_MODE_KEY);
  return saved === 'grid' || saved === 'list' ? saved : 'grid';
};

export interface FileSystemState {
  // Current path and selection
  currentPath: FileSystemNode[];
  selectedItems: string[]; // 改为数组，便于持久化
  currentParentId: string | null;

  // Personal space cache (避免每次进入私人空间页面都重新获取)
  personalSpaceId: string | null;
  personalSpaceIdLoading: boolean;
  setPersonalSpaceId: (id: string | null) => void;
  setPersonalSpaceIdLoading: (loading: boolean) => void;

  // Navigation
  setCurrentPath: (path: FileSystemNode[]) => void;
  setSelectedItems: (items: string[]) => void;
  addSelectedItem: (id: string) => void;
  removeSelectedItem: (id: string) => void;
  clearSelection: () => void;
  setCurrentParentId: (id: string | null) => void;

  // View settings
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

  // Sort settings
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
  setSortBy: (by: 'name' | 'date' | 'size' | 'type') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;

  // Search
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  // Actions
  navigateToFolder: (folderId: string) => void;
  navigateUp: () => void;
  refresh: () => void;
}

export const useFileSystemStore = create<FileSystemState>()(
  persist(
    (set, get) => ({
      currentPath: [],
      selectedItems: [],
      currentParentId: null,
      viewMode: getInitialViewMode(),
      sortBy: 'name',
      sortOrder: 'asc',
      searchTerm: '',
      personalSpaceId: null,
      personalSpaceIdLoading: false,

      setPersonalSpaceId: (id) => set({ personalSpaceId: id }),
      setPersonalSpaceIdLoading: (loading) => set({ personalSpaceIdLoading: loading }),

      setCurrentPath: (path) => set({ currentPath: path }),
      setSelectedItems: (items) => set({ selectedItems: items }),
      addSelectedItem: (id) =>
        set((state) => {
          if (state.selectedItems.includes(id)) {
            return state;
          }
          return { selectedItems: [...state.selectedItems, id] };
        }),
      removeSelectedItem: (id) =>
        set((state) => ({
          selectedItems: state.selectedItems.filter((item) => item !== id),
        })),
      clearSelection: () => set({ selectedItems: [] }),
      setCurrentParentId: (id) => set({ currentParentId: id }),

      setViewMode: (mode) => {
        set({ viewMode: mode });
        // 持久化到 localStorage
        safeStorage.setItem(VIEW_MODE_KEY, mode);
      },
      setSortBy: (by) => set({ sortBy: by }),
      setSortOrder: (order) => set({ sortOrder: order }),
      setSearchTerm: (term) => set({ searchTerm: term }),

      navigateToFolder: (folderId) => {
        const { currentPath } = get();
        const folder = currentPath.find((node) => node.id === folderId);
        if (folder) {
          set({ currentParentId: folderId });
        }
      },

      navigateUp: () => {
        const { currentPath } = get();
        if (currentPath.length > 0) {
          const newPath = [...currentPath];
          newPath.pop();
          const itemNode = newPath[newPath.length - 1];
          if (!itemNode) return;
          const newParentId = newPath.length > 0 ? itemNode.id : null;
          set({ currentPath: newPath, currentParentId: newParentId });
        }
      },

      refresh: () => {
        // This will trigger a re-fetch of data
        // Implementation will connect with API
      },
    }),
    {
      name: 'fileSystemStore',
      partialize: (state) => ({}),
    }
  )
);
