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
    reset,
  };
}
