import { create } from 'zustand';
import { FileSystemNode } from '../types';

export interface FileSystemState {
  // Current path and selection
  currentPath: FileSystemNode[];
  selectedItems: Set<string>;
  currentParentId: string | null;

  // Navigation
  setCurrentPath: (path: FileSystemNode[]) => void;
  setSelectedItems: (items: Set<string>) => void;
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

export const useFileSystemStore = create<FileSystemState>((set, get) => ({
  currentPath: [],
  selectedItems: new Set(),
  currentParentId: null,
  viewMode: 'grid',
  sortBy: 'name',
  sortOrder: 'asc',
  searchTerm: '',

  setCurrentPath: (path) => set({ currentPath: path }),
  setSelectedItems: (items) => set({ selectedItems: items }),
  addSelectedItem: (id) =>
    set((state) => {
      const newSelection = new Set(state.selectedItems);
      newSelection.add(id);
      return { selectedItems: newSelection };
    }),
  removeSelectedItem: (id) =>
    set((state) => {
      const newSelection = new Set(state.selectedItems);
      newSelection.delete(id);
      return { selectedItems: newSelection };
    }),
  clearSelection: () => set({ selectedItems: new Set() }),
  setCurrentParentId: (id) => set({ currentParentId: id }),

  setViewMode: (mode) => set({ viewMode: mode }),
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
}));