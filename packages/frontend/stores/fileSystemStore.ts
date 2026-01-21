import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FileSystemNode } from '../types';

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
          const newParentId = newPath.length > 0 ? newPath[newPath.length - 1].id : null;
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