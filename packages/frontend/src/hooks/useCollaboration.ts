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

export function useCollaboration(visible: boolean): UseCollaborationReturn {
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
  } = useCollabWorks(fromShare, user, visible);

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
    user
  );

  useEffect(() => {
    if (!visible) return;
    // fromShare 依赖：路由级 auto-join（useCollabAutoJoin）落定后把 fromShare 置
    // false，面板须在此刻强制拉取 works——路由 hook 无法调面板的 fetchWorks，
    // 若只靠 isCadReady/visible 触发，协同链接直达时 works 不会及时到达，
    // pendingJoinWorkId 对账（fileId/projectId/名称补齐）会被延迟到下次轮询。
    if (isCadReady && !fromShare) {
      fetchWorks(true);
    }
  }, [isCadReady, visible, user, fromShare]);

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
