import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { useCollabWorks } from './useCollabWorks';
import { useCollabActions } from './useCollabActions';
import type { WorkListItem } from './useCollabWorks';
import type { Work } from '../types/collaboration';

export interface UseCollaborationReturn {
  works: Work[];
  currentWorkId: number | null;
  loading: boolean;
  creating: boolean;
  joiningWorkId: number | null;
  fileNameCache: Record<string, string>;
  projectNameCache: Record<string, string>;
  waitingForSession: boolean;
  myProjectIds: string[];
  isCadReady: boolean;
  fromShare: boolean;
  currentFileWorks: Work[];
  myWorks: WorkListItem[];
  projectWorks: WorkListItem[];
  currentFileName: string;
  fetchWorks: (showLoading?: boolean, force?: boolean) => Promise<void>;
  handleCreateWork: (skipChecks?: boolean) => Promise<void>;
  handleJoinWork: (
    workId: number,
    skipModifiedCheck?: boolean
  ) => Promise<void>;
  handleExitWork: () => Promise<void>;
}

export function useCollaboration(visible: boolean, onFileLoaded?: () => void): UseCollaborationReturn {
  const fromShare = useCADEditorStore((s) => s.fromShare);
  const { user } = useAuth();

  const {
    works,
    currentWorkId,
    loading,
    fileNameCache,
    projectNameCache,
    myProjectIds,
    setCurrentWorkId,
    setWorks,
    currentFileWorks,
    myWorks,
    projectWorks,
    currentFileName,
    fetchWorks,
  } = useCollabWorks(fromShare, user?.id, visible);

  const {
    creating,
    joiningWorkId,
    waitingForSession,
    isCadReady,
    handleCreateWork,
    handleJoinWork,
    handleExitWork,
  } = useCollabActions(
    visible,
    works,
    setWorks,
    currentWorkId,
    setCurrentWorkId,
    fetchWorks,
    user,
    onFileLoaded
  );

  useEffect(() => {
    if (!visible) return;
    if (isCadReady) {
      fetchWorks(true);
    }
  }, [isCadReady, visible]);

  return {
    works,
    currentWorkId,
    loading,
    creating,
    joiningWorkId,
    fileNameCache,
    projectNameCache,
    waitingForSession,
    myProjectIds,
    isCadReady,
    fromShare,
    currentFileWorks,
    myWorks,
    projectWorks,
    currentFileName,
    fetchWorks,
    handleCreateWork,
    handleJoinWork,
    handleExitWork,
  };
}
