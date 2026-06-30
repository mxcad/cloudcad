import { create } from 'zustand';
import { t } from '@/languages';

export interface UndoableAction {
  type: 'delete' | 'move' | 'copy' | 'paste-copy' | 'rename' | 'createFolder' | 'createDrawing';
  description: string;
  projectId: string | undefined;
  nodeIds?: string[];
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
}

function isProcessingGuard(get: () => FileSystemUndoRedoState): boolean {
  if (get().isProcessing) {
    console.warn('[undoStore] already processing, skipping');
    return true;
  }
  return false;
}

function projectGuard(action: UndoableAction, currentProjectId: string | undefined): void {
  if (action.projectId != null && currentProjectId != null && action.projectId !== currentProjectId) {
    throw new Error(t('无法撤销：当前项目与操作时的项目不一致'));
  }
}

export interface FileSystemUndoRedoState {
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
  isProcessing: boolean;

  pushAction: (action: UndoableAction) => void;
  undo: (currentProjectId: string | undefined) => Promise<void>;
  redo: (currentProjectId: string | undefined) => Promise<void>;
  clearStack: () => void;
  removeActions: (predicate: (action: UndoableAction) => boolean) => void;
}

export const useFileSystemUndoRedoStore = create<FileSystemUndoRedoState>(
  (set, get) => ({
    undoStack: [],
    redoStack: [],
    isProcessing: false,

    pushAction: (action) => {
      set((state) => ({
        undoStack: [...state.undoStack, action],
        redoStack: [],
      }));
    },

    undo: async (currentProjectId) => {
      if (isProcessingGuard(get)) return;
      set({ isProcessing: true });
      try {
        const { undoStack } = get();
        if (undoStack.length === 0) return;
        const action = undoStack[undoStack.length - 1];
        if (!action) return;

        projectGuard(action, currentProjectId);

        await action.rollback();

        set((state) => {
          const idx = state.undoStack.indexOf(action);
          if (idx === -1) return state;
          return {
            undoStack: [...state.undoStack.slice(0, idx), ...state.undoStack.slice(idx + 1)],
            redoStack: [...state.redoStack, action],
          };
        });
      } finally {
        set({ isProcessing: false });
      }
    },

    redo: async (currentProjectId) => {
      if (isProcessingGuard(get)) return;
      set({ isProcessing: true });
      try {
        const { redoStack } = get();
        if (redoStack.length === 0) return;
        const action = redoStack[redoStack.length - 1];
        if (!action) return;

        projectGuard(action, currentProjectId);

        await action.execute();

        set((state) => {
          const idx = state.redoStack.indexOf(action);
          if (idx === -1) return state;
          return {
            redoStack: [...state.redoStack.slice(0, idx), ...state.redoStack.slice(idx + 1)],
            undoStack: [...state.undoStack, action],
          };
        });
      } finally {
        set({ isProcessing: false });
      }
    },

    clearStack: () => {
      set({ undoStack: [], redoStack: [] });
    },

    removeActions: (predicate) => {
      set((state) => ({
        undoStack: state.undoStack.filter((a) => !predicate(a)),
        redoStack: state.redoStack.filter((a) => !predicate(a)),
      }));
    },
  })
);
