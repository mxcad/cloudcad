import { create } from 'zustand';

interface CADEditorState {
  isActive: boolean;
  loading: boolean;
  error: string | null;
  canSave: boolean;
  canExport: boolean;
  canManageExternalRef: boolean;
  currentFileId: string | null;
  currentProjectId: string | null;
  isPersonalSpaceMode: boolean;
  setIsActive: (active: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPermissions: (permissions: { canSave?: boolean; canExport?: boolean; canManageExternalRef?: boolean }) => void;
  setCurrentFileId: (fileId: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  setIsPersonalSpaceMode: (mode: boolean) => void;
}

export const useCADEditorStore = create<CADEditorState>((set) => ({
  isActive: false,
  loading: false,
  error: null,
  canSave: false,
  canExport: false,
  canManageExternalRef: false,
  currentFileId: null,
  currentProjectId: null,
  isPersonalSpaceMode: false,
  setIsActive: (active) => set({ isActive: active }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setPermissions: ({ canSave, canExport, canManageExternalRef }) =>
    set((state) => ({
      canSave: canSave ?? state.canSave,
      canExport: canExport ?? state.canExport,
      canManageExternalRef: canManageExternalRef ?? state.canManageExternalRef,
    })),
  setCurrentFileId: (fileId) => set({ currentFileId: fileId }),
  setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),
  setIsPersonalSpaceMode: (mode) => set({ isPersonalSpaceMode: mode }),
}));
