import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BatchTask {
  taskId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalCount: number;
  completedCount: number;
  errorCount: number;
  currentFile?: string;
  errors?: Array<{ nodeId: string; fileName: string; error: string }>;
  zipPath?: string;
  createdAt: string;
}

export interface BatchFileItem {
  nodeId: string;
  fileName: string;
  formats: string[];
  isFolder?: boolean;
  relativePath?: string;
  dwgVersion?: number;
  width?: string;
  height?: string;
  colorPolicy?: string;
}

interface BatchDownloadState {
  tasks: BatchTask[];
  isDialogOpen: boolean;
  dialogFileList: BatchFileItem[];
  dialogMode: 'batch' | 'folder';
  folderDialogNodeId: string | null;
  folderDialogName: string | null;
  progressTaskId: string | null;
  setProgressTaskId: (taskId: string | null) => void;
  addTask: (task: BatchTask) => void;
  updateTask: (taskId: string, updates: Partial<BatchTask>) => void;
  removeTask: (taskId: string) => void;
  openDialog: (fileList: BatchFileItem[]) => void;
  openFolderDialog: (nodeId: string, name: string) => void;
  closeDialog: () => void;
}

export const useBatchDownloadStore = create<BatchDownloadState>()(
  persist(
    (set) => ({
      tasks: [],
      isDialogOpen: false,
      dialogFileList: [],
      dialogMode: 'batch',
      folderDialogNodeId: null,
      folderDialogName: null,
      progressTaskId: null,

      addTask: (task) =>
        set((state) => ({
          tasks: [task, ...state.tasks].slice(0, 50),
        })),

      updateTask: (taskId, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.taskId === taskId ? { ...t, ...updates } : t
          ),
        })),

      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.taskId !== taskId),
        })),

      setProgressTaskId: (taskId) => set({ progressTaskId: taskId }),

      openDialog: (fileList) =>
        set({
          isDialogOpen: true,
          dialogFileList: fileList,
          dialogMode: 'batch',
          folderDialogNodeId: null,
          folderDialogName: null,
        }),

      openFolderDialog: (nodeId, name) =>
        set({
          isDialogOpen: true,
          dialogFileList: [],
          dialogMode: 'folder',
          folderDialogNodeId: nodeId,
          folderDialogName: name,
        }),

      closeDialog: () =>
        set({
          isDialogOpen: false,
          dialogFileList: [],
          dialogMode: 'batch',
          folderDialogNodeId: null,
          folderDialogName: null,
        }),
    }),
    {
      name: 'batch-download-tasks',
      partialize: (state) => ({ tasks: state.tasks }),
    }
  )
);
