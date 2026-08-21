import { create } from 'zustand';
import type { CurrentFileInfo } from '../services/mxcadManager/mxcadTypes';

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
  currentFileInfo: CurrentFileInfo | null;
  isDirty: boolean;
  isCurrentFileDeleted: boolean;
  isLeavingPage: boolean;
  navigateFunction: ((path: string) => void) | null;
  openedBackUrl: string | null;
  openedInitialFileId: string | null;
  setIsActive: (active: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPermissions: (permissions: {
    canSave?: boolean;
    canExport?: boolean;
    canManageExternalRef?: boolean;
  }) => void;
  setCurrentFileId: (fileId: string | null) => void;
  setCurrentFileName: (name: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  setIsPersonalSpaceMode: (mode: boolean) => void;
  setFromShare: (fromShare: boolean) => void;
  setCollabShareState: (state: {
    fromCollabShare: boolean;
    targetWorkId: number | null;
    libraryKey?: 'drawing' | 'block' | null;
  }) => void;
  setCollaborationState: (state: {
    isInCollaboration: boolean;
    workId: number | null;
  }) => void;
  setCurrentFileInfo: (info: CurrentFileInfo | null) => void;
  patchCurrentFileInfo: (partial: Partial<CurrentFileInfo>) => void;
  setIsDirty: (dirty: boolean) => void;
  setIsCurrentFileDeleted: (deleted: boolean) => void;
  setIsLeavingPage: (leaving: boolean) => void;
  setNavigateFunction: (fn: ((path: string) => void) | null) => void;
  setOpenedBackInfo: (backUrl: string, fileId: string) => void;
  clearOpenedBackInfo: () => void;
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
  currentFileInfo: null,
  isDirty: false,
  isCurrentFileDeleted: false,
  isLeavingPage: false,
  navigateFunction: null,
  openedBackUrl: null,
  openedInitialFileId: null,
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
    set({
      fromCollabShare,
      targetCollabWorkId: targetWorkId,
      collabShareLibraryKey: libraryKey ?? null,
    }),
  setCollaborationState: ({ isInCollaboration, workId }) =>
    set({ isInCollaboration, collaborationWorkId: workId }),
  setCurrentFileInfo: (info) => set({ currentFileInfo: info }),
  patchCurrentFileInfo: (partial) =>
    set((state) => ({
      currentFileInfo: state.currentFileInfo
        ? { ...state.currentFileInfo, ...partial }
        : null,
    })),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setIsCurrentFileDeleted: (deleted) => set({ isCurrentFileDeleted: deleted }),
  setIsLeavingPage: (leaving) => set({ isLeavingPage: leaving }),
  setNavigateFunction: (fn) => set({ navigateFunction: fn }),
  setOpenedBackInfo: (backUrl, fileId) =>
    set({ openedBackUrl: backUrl, openedInitialFileId: fileId }),
  clearOpenedBackInfo: () =>
    set({ openedBackUrl: null, openedInitialFileId: null }),
}));
