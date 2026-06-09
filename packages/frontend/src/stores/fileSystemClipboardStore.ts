import { create } from 'zustand';

export type ClipboardMode = 'copy' | 'cut';

export interface FileSystemClipboardState {
  items: string[];
  mode: ClipboardMode | null;
  sourceProjectId: string;
  setClipboard: (items: string[], mode: ClipboardMode, sourceProjectId: string) => void;
  clearClipboard: () => void;
}

export const useFileSystemClipboardStore = create<FileSystemClipboardState>(
  (set, get) => ({
    items: [],
    mode: null,
    sourceProjectId: '',

    setClipboard: (items, mode, sourceProjectId) => {
      set({ items, mode, sourceProjectId });
    },

    clearClipboard: () => {
      set({ items: [], mode: null, sourceProjectId: '' });
    },
  })
);

export const getClipboardCount = () =>
  useFileSystemClipboardStore.getState().items.length;

export const getClipboardMode = () =>
  useFileSystemClipboardStore.getState().mode;
