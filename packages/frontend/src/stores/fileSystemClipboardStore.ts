import { create } from 'zustand';

export type ClipboardMode = 'copy' | 'cut';

export interface FileSystemClipboardState {
  items: string[];
  mode: ClipboardMode | null;
  sourceProjectId: string;
  sourceParentIds: Record<string, string>;
  setClipboard: (items: string[], mode: ClipboardMode, sourceProjectId: string, sourceParentIds?: Record<string, string>) => void;
  clearClipboard: () => void;
}

export const useFileSystemClipboardStore = create<FileSystemClipboardState>(
  (set, get) => ({
    items: [],
    mode: null,
    sourceProjectId: '',
    sourceParentIds: {},

    setClipboard: (items, mode, sourceProjectId, sourceParentIds = {}) => {
      set({ items, mode, sourceProjectId, sourceParentIds });
    },

    clearClipboard: () => {
      set({ items: [], mode: null, sourceProjectId: '', sourceParentIds: {} });
    },
  })
);

export const getClipboardCount = () =>
  useFileSystemClipboardStore.getState().items.length;

export const getClipboardMode = () =>
  useFileSystemClipboardStore.getState().mode;
