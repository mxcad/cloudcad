import { useEditorStore } from '../stores/editor';

export function useEditorState() {
  const store = useEditorStore();
  return {
    state: store.state,
    setFileId: store.setFileId,
    setLoading: store.setLoading,
    setError: store.setError,
    setProjectId: store.setProjectId,
    setFileInfo: store.setFileInfo,
    setPermissions: store.setPermissions,
    setIsPersonalSpace: store.setIsPersonalSpace,
    setIsModified: store.setIsModified,
    setFileName: store.setFileName,
    setIsActive: store.setIsActive,
    setUpdatedAt: store.setUpdatedAt,
    setExpectedTimestamp: store.setExpectedTimestamp,
    setCurrentVersion: store.setCurrentVersion,
    setIsPublicFile: store.setIsPublicFile,
    setCollaborationState: store.setCollaborationState,
    setCollabShareState: store.setCollabShareState,
    setNewFileInfo: store.setNewFileInfo,
    reset: store.reset,
    resetNewFile: store.resetNewFile,
  };
}
