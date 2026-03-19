///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { FileSystemNode } from '@/types/filesystem';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 从 localStorage 读取保存的视图模式
const getInitialViewMode = (): 'grid' | 'list' => {
  if (typeof window === 'undefined') return 'grid';
  const saved = localStorage.getItem('fileViewMode');
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
        if (typeof window !== 'undefined') {
          localStorage.setItem('fileViewMode', mode);
        }
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
