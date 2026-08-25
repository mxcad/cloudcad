import { create } from 'zustand';
import type {
  ProjectTransferSettings,
  TransferRootKind,
} from '@/lib/crossProjectPaste';

export type ClipboardMode = 'copy' | 'cut';

export interface SetClipboardOptions {
  /** cut 时记录各节点源父目录（undo rollback 用） */
  sourceParentIds?: Record<string, string>;
  /** 剪贴板归属根类型（默认 'project'） */
  sourceRootKind?: TransferRootKind;
  /** 源项目 6 域 transfer 设置快照（源为项目时复制/剪切时记录；非项目根/查询失败为 null；后端仍做最终校验） */
  sourceTransferSettings?: ProjectTransferSettings | null;
}

export interface FileSystemClipboardState {
  items: string[];
  mode: ClipboardMode | null;
  sourceProjectId: string;
  sourceRootKind: TransferRootKind;
  sourceParentIds: Record<string, string>;
  sourceTransferSettings: ProjectTransferSettings | null;
  setClipboard: (
    items: string[],
    mode: ClipboardMode,
    sourceProjectId: string,
    options?: SetClipboardOptions
  ) => void;
  clearClipboard: () => void;
}

export const useFileSystemClipboardStore = create<FileSystemClipboardState>(
  (set) => ({
    items: [],
    mode: null,
    sourceProjectId: '',
    sourceRootKind: 'project',
    sourceParentIds: {},
    sourceTransferSettings: null,

    setClipboard: (
      items,
      mode,
      sourceProjectId,
      {
        sourceParentIds = {},
        sourceRootKind = 'project',
        sourceTransferSettings = null,
      } = {}
    ) => {
      set({
        items,
        mode,
        sourceProjectId,
        sourceParentIds,
        sourceRootKind,
        sourceTransferSettings,
      });
    },

    clearClipboard: () => {
      set({
        items: [],
        mode: null,
        sourceProjectId: '',
        sourceRootKind: 'project',
        sourceParentIds: {},
        sourceTransferSettings: null,
      });
    },
  })
);
