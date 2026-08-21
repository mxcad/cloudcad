import { defineStore } from 'pinia';
import { reactive } from 'vue';

interface EditorPermissions {
  canSave: boolean;
  canExport: boolean;
  canManageExternalRef: boolean;
}

export type ErrorType = 'auth' | 'permission' | 'not-found' | 'server' | 'network' | 'abort' | 'converting' | 'open-failed' | 'unknown' | null;

export type ProgressStage = 'idle' | 'fetching-info' | 'uploading' | 'converting' | 'loading-cache' | 'opening' | 'complete';

interface EditorState {
  isActive: boolean;
  loading: boolean;
  error: string | null;
  errorType: ErrorType;
  progressStage: ProgressStage;
  uploadProgress: number;
  fileId: string | null;
  projectId: string | null;
  fileInfo: Record<string, unknown> | null;
  permissions: EditorPermissions;
  isPersonalSpace: boolean;
  isModified: boolean;
  fileName: string;
  currentVersion: number | undefined;
  isPublicFile: boolean;
  updatedAt: string | null;
  expectedTimestamp: string | null;
  isInCollaboration: boolean;
  collaborationWorkId: number | null;
  fromCollabShare: boolean;
  targetCollabWorkId: number | null;
  libraryKey: 'drawing' | 'block' | null;
  personalSpaceId: string | null;
  isCurrentFileDeleted: boolean;
  /** 本地图纸内容 MD5（本地 mxweb/dwg/dxf 打开时记录，作为本地协同识别标识） */
  fileHash: string | null;
}

const defaultPermissions: EditorPermissions = {
  canSave: false,
  canExport: false,
  canManageExternalRef: false,
};

const defaultState: EditorState = {
  isActive: false,
  loading: false,
  error: null,
  errorType: null,
  progressStage: 'idle',
  uploadProgress: 0,
  fileId: null,
  projectId: null,
  fileInfo: null,
  permissions: { ...defaultPermissions },
  isPersonalSpace: false,
  isModified: false,
  fileName: '',
  currentVersion: undefined,
  isPublicFile: false,
  updatedAt: null,
  expectedTimestamp: null,
  isInCollaboration: false,
  collaborationWorkId: null,
  fromCollabShare: false,
  targetCollabWorkId: null,
  libraryKey: null,
  personalSpaceId: null,
  isCurrentFileDeleted: false,
  fileHash: null,
};

export const useEditorStore = defineStore('editor', () => {
  const state = reactive<EditorState>({ ...defaultState });

  function setFileId(id: string | null) {
    state.fileId = id;
  }

  function setLoading(val: boolean) {
    state.loading = val;
  }

  function setProgressStage(stage: ProgressStage) {
    state.progressStage = stage;
  }

  function setUploadProgress(pct: number) {
    state.uploadProgress = pct;
  }

  function setError(err: string | null) {
    state.error = err;
  }

  function setErrorType(type: ErrorType) {
    state.errorType = type;
  }

  function setProjectId(id: string | null) {
    state.projectId = id;
  }

  function setFileInfo(info: Record<string, unknown> | null) {
    state.fileInfo = info;
  }

  function setPermissions(perms: Partial<EditorPermissions>) {
    Object.assign(state.permissions, perms);
  }

  function setIsPersonalSpace(val: boolean) {
    state.isPersonalSpace = val;
  }

  function setIsModified(val: boolean) {
    state.isModified = val;
  }

  function setFileName(name: string) {
    state.fileName = name;
  }

  function setIsActive(val: boolean) {
    state.isActive = val;
  }

  function setUpdatedAt(val: string | null) {
    state.updatedAt = val;
    state.expectedTimestamp = val;
  }

  function setExpectedTimestamp(val: string | null) {
    state.expectedTimestamp = val;
  }

  function setCurrentVersion(version: number | undefined) {
    state.currentVersion = version;
  }

  function setIsPublicFile(val: boolean) {
    state.isPublicFile = val;
  }

  function setCollaborationState({ isInCollaboration, workId }: { isInCollaboration: boolean; workId: number | null }) {
    state.isInCollaboration = isInCollaboration;
    state.collaborationWorkId = workId;
  }

  function setCollabShareState({ fromCollabShare, targetWorkId }: { fromCollabShare: boolean; targetWorkId: number | null }) {
    state.fromCollabShare = fromCollabShare;
    state.targetCollabWorkId = targetWorkId;
  }

  function setLibraryKey(key: 'drawing' | 'block' | null) {
    state.libraryKey = key;
  }

  function setFileHash(hash: string | null) {
    state.fileHash = hash;
  }

  function setPersonalSpaceId(id: string | null) {
    state.personalSpaceId = id;
  }

  function setIsCurrentFileDeleted(val: boolean) {
    state.isCurrentFileDeleted = val;
  }

  function setNewFileInfo() {
    state.fileId = '';
    state.projectId = null;
    state.fileInfo = null;
    state.isPersonalSpace = false;
    state.fileName = 'new.dwg';
    state.updatedAt = null;
    state.expectedTimestamp = null;
    state.fileHash = null;
    Object.assign(state.permissions, defaultPermissions);
  }

  function reset() {
    Object.assign(state, { ...defaultState, permissions: { ...defaultPermissions } });
    state.errorType = null;
    state.isCurrentFileDeleted = false;
  }

  function resetFileState() {
    state.fileId = null;
    state.projectId = null;
    state.fileInfo = null;
    state.permissions = { ...defaultPermissions };
    state.isPersonalSpace = false;
    state.isModified = false;
    state.fileName = '';
    state.currentVersion = undefined;
    state.isPublicFile = false;
    state.updatedAt = null;
    state.expectedTimestamp = null;
    state.isInCollaboration = false;
    state.collaborationWorkId = null;
    state.fromCollabShare = false;
    state.targetCollabWorkId = null;
    state.libraryKey = null;
    state.personalSpaceId = null;
    state.isCurrentFileDeleted = false;
    state.fileHash = null;
    state.errorType = null;
    setError(null);
  }

  function resetNewFile() {
    reset();
    const url = new URL(window.location.href);
    url.searchParams.delete('fileId');
    url.searchParams.delete('nodeId');
    url.searchParams.delete('hash');
    url.searchParams.delete('v');
    window.history.replaceState(null, '', url.pathname + url.search);
  }

  return {
    state,
    setFileId,
    setLoading,
    setError,
    setErrorType,
    setProgressStage,
    setUploadProgress,
    setProjectId,
    setFileInfo,
    setPermissions,
    setIsPersonalSpace,
    setIsModified,
    setFileName,
    setIsActive,
    setUpdatedAt,
    setExpectedTimestamp,
    setCurrentVersion,
    setIsPublicFile,
    setCollaborationState,
    setCollabShareState,
    setLibraryKey,
    setPersonalSpaceId,
    setIsCurrentFileDeleted,
    setFileHash,
    setNewFileInfo,
    reset,
    resetFileState,
    resetNewFile,
  };
});
