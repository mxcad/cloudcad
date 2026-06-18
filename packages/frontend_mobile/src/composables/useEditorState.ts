import { reactive, readonly } from 'vue';

interface EditorPermissions {
  canSave: boolean;
  canExport: boolean;
  canManageExternalRef: boolean;
}

interface EditorState {
  isActive: boolean;
  loading: boolean;
  error: string | null;
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

  // 协同状态
  isInCollaboration: boolean;
  collaborationWorkId: number | null;
  fromCollabShare: boolean;
  targetCollabWorkId: number | null;
}

const state = reactive<EditorState>({
  isActive: false,
  loading: false,
  error: null,
  fileId: null,
  projectId: null,
  fileInfo: null,
  permissions: {
    canSave: false,
    canExport: false,
    canManageExternalRef: false,
  },
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
});

export function useEditorState() {
  function setFileId(id: string | null) {
    state.fileId = id;
  }

  function setLoading(val: boolean) {
    state.loading = val;
  }

  function setError(err: string | null) {
    state.error = err;
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

  function setNewFileInfo() {
    state.fileId = '';
    state.projectId = null;
    state.fileInfo = null;
    state.isPersonalSpace = false;
    state.fileName = 'new.dwg';
    state.updatedAt = null;
    state.expectedTimestamp = null;
    state.permissions = {
      canSave: false,
      canExport: false,
      canManageExternalRef: false,
    };
  }

  function reset() {
    state.isActive = false;
    state.loading = false;
    state.error = null;
    state.fileId = null;
    state.projectId = null;
    state.fileInfo = null;
    state.permissions = {
      canSave: false,
      canExport: false,
      canManageExternalRef: false,
    };
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
    state: readonly(state),
    setFileId,
    setLoading,
    setError,
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
    setNewFileInfo,
    reset,
    resetNewFile,
  };
}
