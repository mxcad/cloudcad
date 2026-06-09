import { create } from 'zustand';

export interface UndoableAction {
  type: 'delete' | 'move' | 'copy' | 'rename' | 'createFolder';
  description: string;
  projectId: string;
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
}

export interface FileSystemUndoRedoState {
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];

  pushAction: (action: UndoableAction) => void;
  undo: (currentProjectId: string) => Promise<void>;
  redo: (currentProjectId: string) => Promise<void>;
  clearStack: () => void;
}

export const useFileSystemUndoRedoStore = create<FileSystemUndoRedoState>(
  (set, get) => ({
    undoStack: [],
    redoStack: [],

    pushAction: (action) => {
      set((state) => ({
        undoStack: [...state.undoStack, action],
        redoStack: [],
      }));
    },

    undo: async (currentProjectId) => {
      const { undoStack } = get();
      if (undoStack.length === 0) return;

      const action = undoStack[undoStack.length - 1];
      if (!action) return;

      if (action.projectId && currentProjectId && action.projectId !== currentProjectId) {
        throw new Error('无法撤销：当前项目与操作时的项目不一致');
      }

      await action.rollback();

      set((state) => ({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, action],
      }));
    },

    redo: async (currentProjectId) => {
      const { redoStack } = get();
      if (redoStack.length === 0) return;

      const action = redoStack[redoStack.length - 1];
      if (!action) return;

      if (action.projectId && currentProjectId && action.projectId !== currentProjectId) {
        throw new Error('无法重做：当前项目与操作时的项目不一致');
      }

      await action.execute();

      set((state) => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, action],
      }));
    },

    clearStack: () => {
      set({ undoStack: [], redoStack: [] });
    },
  })
);
