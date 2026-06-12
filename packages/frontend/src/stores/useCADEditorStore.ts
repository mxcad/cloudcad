import { create } from 'zustand';

interface CADEditorState {
  isActive: boolean;
  loading: boolean;
  error: string | null;
  canSave: boolean;
  canExport: boolean;
  canManageExternalRef: boolean;
  currentFileId: string | null;
  currentFileName: string | null;
  currentProjectId: string | null;
  isPersonalSpaceMode: boolean;
  fromShare: boolean;
  fromCollabShare: boolean;
  targetCollabWorkId: number | null;
  collabShareLibraryKey: 'drawing' | 'block' | null;
  isInCollaboration: boolean;
  collaborationWorkId: number | null;
  setIsActive: (active: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPermissions: (permissions: { canSave?: boolean; canExport?: boolean; canManageExternalRef?: boolean }) => void;
  setCurrentFileId: (fileId: string | null) => void;
  setCurrentFileName: (name: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  setIsPersonalSpaceMode: (mode: boolean) => void;
  setFromShare: (fromShare: boolean) => void;
  setCollabShareState: (state: { fromCollabShare: boolean; targetWorkId: number | null; libraryKey?: 'drawing' | 'block' | null }) => void;
  setCollaborationState: (state: { isInCollaboration: boolean; workId: number | null }) => void;
}

export const useCADEditorStore = create<CADEditorState>((set) => ({
  isActive: false,
  loading: false,
  error: null,
  canSave: false,
  canExport: false,
  canManageExternalRef: false,
  currentFileId: null,
  currentFileName: null,
  currentProjectId: null,
  isPersonalSpaceMode: false,
  fromShare: false,
  fromCollabShare: false,
  targetCollabWorkId: null,
  collabShareLibraryKey: null,
  isInCollaboration: false,
  collaborationWorkId: null,
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
  setCurrentFileName: (name) => set({ currentFileName: name }),
  setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),
  setIsPersonalSpaceMode: (mode) => set({ isPersonalSpaceMode: mode }),
  setFromShare: (fromShare) => set({ fromShare }),
  setCollabShareState: ({ fromCollabShare, targetWorkId, libraryKey }) =>
    set({ fromCollabShare, targetCollabWorkId: targetWorkId, collabShareLibraryKey: libraryKey ?? null }),
  setCollaborationState: ({ isInCollaboration, workId }) =>
    set({ isInCollaboration, collaborationWorkId: workId }),
}));
