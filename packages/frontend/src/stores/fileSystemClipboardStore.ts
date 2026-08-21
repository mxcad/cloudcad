import { create } from 'zustand';
import type { TransferMode } from '@/types/filesystem';

export type ClipboardMode = 'copy' | 'cut';

export interface FileSystemClipboardState {
  items: string[];
  mode: ClipboardMode | null;
  sourceProjectId: string;
  sourceParentIds: Record<string, string>;
  /** 源项目出向到项目的策略快照（复制/剪切时记录，供跨项目粘贴 UI 判断用；后端仍做最终校验） */
  sourceTransferOutToProject: TransferMode | null;
  setClipboard: (
    items: string[],
    mode: ClipboardMode,
    sourceProjectId: string,
    sourceParentIds?: Record<string, string>,
    sourceTransferOutToProject?: TransferMode | null
  ) => void;
  clearClipboard: () => void;
}

export const useFileSystemClipboardStore = create<FileSystemClipboardState>(
  (set, get) => ({
    items: [],
    mode: null,
    sourceProjectId: '',
    sourceParentIds: {},
    sourceTransferOutToProject: null,

    setClipboard: (
      items,
      mode,
      sourceProjectId,
      sourceParentIds = {},
      sourceTransferOutToProject = null
    ) => {
      set({
        items,
        mode,
        sourceProjectId,
        sourceParentIds,
        sourceTransferOutToProject,
      });
    },

    clearClipboard: () => {
      set({
        items: [],
        mode: null,
        sourceProjectId: '',
        sourceParentIds: {},
        sourceTransferOutToProject: null,
      });
    },
  })
);
