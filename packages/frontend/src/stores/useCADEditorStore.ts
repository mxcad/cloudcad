import { create } from 'zustand';
import type { CurrentFileInfo } from '../services/mxcadManager/mxcadTypes';

/**
 * 协同会话阶段（C5 状态机）：
 * - idle：不在协同中，也没有进行中的加入/创建
 * - joining：joinWork/createWork 已发出、引擎回调未落定（窗口期内退出须等落定）
 * - joined：引擎回调确认已进入协同会话
 *
 * 历史上 isInCollaboration 布尔值表达不了「加入在途」，窗口期内导航离开时
 * 引擎 session 已开但 store 说未加入、面板已卸载 → 全链路无一次 exitWork
 * （会话泄漏）。phase 与 isInCollaboration 并存：后者仍是「已加入」的唯一
 * 事实源（大量 UI/守卫消费），phase 额外表达 joining 维度，由
 * setCollaborationState 联动维护，避免双写漂移。
 */
export type CollabPhase = 'idle' | 'joining' | 'joined';

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
  collabPhase: CollabPhase;
  /** 退出协同后的短窗守卫（3s），阻止 auto-join 把刚退出的 session 拉回 */
  collabExitGuard: boolean;
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
  setCollabPhase: (phase: CollabPhase) => void;
  setCollabExitGuard: (guard: boolean) => void;
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
  collabPhase: 'idle',
  collabExitGuard: false,
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
    set({
      isInCollaboration,
      collaborationWorkId: workId,
      // 联动 phase，避免 isInCollaboration 与 collabPhase 双写漂移
      collabPhase: isInCollaboration ? 'joined' : 'idle',
    }),
  setCollabPhase: (phase) => set({ collabPhase: phase }),
  setCollabExitGuard: (guard) => set({ collabExitGuard: guard }),
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
