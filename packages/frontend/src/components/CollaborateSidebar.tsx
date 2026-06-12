import {
  RefreshCw,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { getErrorMessage } from '../utils/errorHandler';
import { Tabs, Tab } from './ui';
import { APP_COOPERATE_URL } from '@/constants/appConfig';
import {
  mxcadManager,
  checkAndConfirmUnsavedChanges,
  refreshFileName,
  patchCurrentFileInfo,
} from '../services/mxcadManager';
import { useAuth } from '../contexts/AuthContext';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import {
  fileSystemControllerGetNode,
  fileSystemControllerGetProjects,
} from '@/api-sdk';
import {
  parseWorkData,
  encodeV3WorkData,
  encodeUserData,
  deduplicateWorkUsers,
} from '../types/collaboration';
import type {
  CollaborateUserData,
  CollaborateWorkDataV3,
} from '../types/collaboration';
import {
  getCooperate,
  exitCurrentCollaboration,
} from '../services/collaborationService';
import {
  showGlobalLoading,
  hideGlobalLoading,
} from '../utils/loadingUtils';
import { CurrentFilePanel } from './CurrentFilePanel';
import { WorkListPanel } from './WorkListPanel';
import styles from './CollaborateSidebar.module.css';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface ProjectCacheEntry {
  id: string;
  name: string;
}

async function fetchMyProjectIds(): Promise<string[]> {
  try {
    const result = await fileSystemControllerGetProjects({ query: {} });
    if (result.error) return [];
    const nodes = (result.data as { nodes?: { id: string }[] })?.nodes || [];
    return nodes.map((n) => n.id);
  } catch {
    return [];
  }
}

export const CollaborateSidebar: React.FC = () => {
  const { user } = useAuth();
  const {
    currentFileId,
    currentFileName: storeFileName,
    currentProjectId,
    fromShare,
    fromCollabShare,
    targetCollabWorkId,
    collabShareLibraryKey,
    setCollaborationState,
    setCollabShareState,
    isInCollaboration,
    collaborationWorkId,
  } = useCADEditorStore();
  const { showToast } = useNotification();

  const [works, setWorks] = useState<Work[]>([]);
  const [currentWorkId, setCurrentWorkIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningWorkId, setJoiningWorkId] = useState<number | null>(null);
  const [fileNameCache, setFileNameCache] = useState<Record<string, string>>({});
  const [projectNameCache, setProjectNameCache] = useState<Record<string, string>>({});
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [myProjectIds, setMyProjectIds] = useState<string[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'current' | 'list'>('current');
  const [isCadReady, setIsCadReady] = useState(false);
  const [blankFileReady, setBlankFileReady] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  const initCheckRef = useRef<NodeJS.Timeout | null>(null);
  const exitGuardRef = useRef(false);
  const joiningLockRef = useRef(false);
  const autoJoinTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingJoinWorkIdRef = useRef<number | null>(null);

  // Sync workId state with store
  const setCurrentWorkId = useCallback((id: number | null) => {
    setCurrentWorkIdState(id);
  }, []);

  const fetchWorks = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        setLoading(false);
        return;
      }

      let done = false;
      const timeoutId = setTimeout(() => {
        if (!done) {
          done = true;
          setLoading(false);
        }
      }, 30000);

      setMyProjectIds(await fetchMyProjectIds());

      cooperate.getWorks((workList: Work[]) => {
        console.log('Fetched works:', workList);
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        setInitialFetchDone(true);
        const filtered = workList
          .filter((w) => parseWorkData(w.work_data) !== null)
          .map((w) => {
            const { linkUserIds, linkUserData } = deduplicateWorkUsers(
              w.link_user_ids,
              w.link_user_data
            );
            return { ...w, link_user_ids: linkUserIds, link_user_data: linkUserData };
          });
          setWorks((prev) => {
            const newWorkIds = filtered.map((w) => w.work_id);
            const localOnly = prev.filter((w) => !newWorkIds.includes(w.work_id));
            if (localOnly.length === 0) return filtered;
            if (initialFetchDone && filtered.length === 0) return filtered;
            return [...filtered, ...localOnly];
          });
        setLoading(false);
      });
    } catch (error) {
      console.error('获取协同列表失败:', error);
      setLoading(false);
    }
  }, []);

  const resolveNames = useCallback(async (workList: Work[]) => {
    const drawingIds = new Set<string>();
    const projectIds = new Set<string>();

    for (const w of workList) {
      const data = parseWorkData(w.work_data);
      if (data?.drawingId) drawingIds.add(data.drawingId);
      if (data?.projectId) projectIds.add(data.projectId);
    }

    const resolvedDrawings: { id: string; name: string }[] = [];
    const resolvedProjects: ProjectCacheEntry[] = [];

    await Promise.all([
      ...[...drawingIds].map(async (id) => {
        try {
          const result = await fileSystemControllerGetNode({
            path: { nodeId: id },
          });
          if (result.data && 'name' in result.data) {
            resolvedDrawings.push({
              id,
              name: (result.data as { name: string }).name,
            });
          }
        } catch {
          resolvedDrawings.push({ id, name: `图纸 ${id.slice(0, 6)}...` });
        }
      }),
      ...[...projectIds].map(async (id) => {
        try {
          const result = await fileSystemControllerGetNode({
            path: { nodeId: id },
          });
          if (result.data && 'name' in result.data) {
            resolvedProjects.push({
              id,
              name: (result.data as { name: string }).name,
            });
          }
        } catch {
          resolvedProjects.push({ id, name: `项目 ${id.slice(0, 6)}...` });
        }
      }),
    ]);

    if (resolvedDrawings.length > 0) {
      setFileNameCache((prev) => {
        const entries = resolvedDrawings.filter((r) => !prev[r.id]);
        if (entries.length === 0) {
          const staleIds = Object.keys(prev).filter((id) => !drawingIds.has(id));
          if (staleIds.length === 0) return prev;
          const cleaned = { ...prev };
          for (const id of staleIds) delete cleaned[id];
          return cleaned;
        }
        const updated = { ...prev };
        for (const e of entries) updated[e.id] = e.name;
        const staleIds = Object.keys(updated).filter((id) => !drawingIds.has(id));
        for (const id of staleIds) delete updated[id];
        return updated;
      });
    }

    if (resolvedProjects.length > 0) {
      setProjectNameCache((prev) => {
        const entries = resolvedProjects.filter((r) => !prev[r.id]);
        if (entries.length === 0) {
          const staleIds = Object.keys(prev).filter((id) => !projectIds.has(id));
          if (staleIds.length === 0) return prev;
          const cleaned = { ...prev };
          for (const id of staleIds) delete cleaned[id];
          return cleaned;
        }
        const updated = { ...prev };
        for (const e of entries) updated[e.id] = e.name;
        const staleIds = Object.keys(updated).filter((id) => !projectIds.has(id));
        for (const id of staleIds) delete updated[id];
        return updated;
      });
    }
  }, []);

  // CAD ready check
  useEffect(() => {
    const checkCadReady = () => {
      const ready = mxcadManager.isReady();
      if (ready) {
        setIsCadReady(true);
        if (initCheckRef.current) {
          clearInterval(initCheckRef.current);
          initCheckRef.current = null;
        }
      }
    };
    checkCadReady();
    if (!mxcadManager.isReady()) {
      initCheckRef.current = setInterval(checkCadReady, 500);
    }
    return () => {
      if (initCheckRef.current) {
        clearInterval(initCheckRef.current);
      }
    };
  }, []);

  // Auto-join: CAD ready is sufficient — joinWork handles file loading internally.
  // No need to wait for mxcad-file-open-complete (never fires in home mode).
  useEffect(() => {
    if (!isCadReady || !fromCollabShare) return;
    setBlankFileReady(true);
  }, [isCadReady, fromCollabShare]);

  // Initial fetch
  useEffect(() => {
    if (isCadReady) {
      fetchWorks(true);
    }
  }, [isCadReady, fetchWorks]);

  // Resolve names
  useEffect(() => {
    if (works.length > 0) {
      resolveNames(works);
    }
  }, [works]);

  // Sync resolved name to editor title
  useEffect(() => {
    if (currentFileId && fileNameCache[currentFileId]) {
      patchCurrentFileInfo({ name: fileNameCache[currentFileId] });
      refreshFileName();
    }
  }, [fileNameCache, currentFileId]);

  // Re-fetch works when current file changes
  useEffect(() => {
    if (!isCadReady || !currentFileId) return;
    fetchWorks(true);
  }, [currentFileId, isCadReady, fetchWorks]);

  // Polling
  useEffect(() => {
    if (!isCadReady) return;
    autoJoinTimerRef.current = setInterval(() => {
      fetchWorks();
    }, 8000);
    return () => {
      if (autoJoinTimerRef.current) {
        clearInterval(autoJoinTimerRef.current);
        autoJoinTimerRef.current = null;
      }
    };
  }, [isCadReady, fetchWorks]);

  // Sync local state with store (handles external collaboration exit, e.g. openFile/openFile_noCache)
  useEffect(() => {
    if (!isInCollaboration && collaborationWorkId === null && currentWorkId !== null) {
      setCurrentWorkId(null);
      fetchWorks();
    }
  }, [isInCollaboration, collaborationWorkId, currentWorkId, fetchWorks]);

  // After auto-join fetches works, sync currentFileId from work data
  useEffect(() => {
    const targetWorkId = pendingJoinWorkIdRef.current;
    if (targetWorkId === null) return;
    const joinedWork = works.find((w) => w.work_id === targetWorkId);
    if (!joinedWork) return;
    const data = parseWorkData(joinedWork.work_data);
    if (!data) return;
    const store = useCADEditorStore.getState();
    const hasRealData = !!(data.drawingId || (data.v === 3 && data.drawingName));
    if (!hasRealData) return;
    if (data.drawingId) store.setCurrentFileId(data.drawingId);
    if (data.projectId) store.setCurrentProjectId(data.projectId);
    if (data.v === 3 && data.drawingName) {
      store.setCurrentFileName(data.drawingName);
      patchCurrentFileInfo({ name: data.drawingName });
      refreshFileName();
    }
    pendingJoinWorkIdRef.current = null;
  }, [works]);

  // Auto-join from collaboration share link
  // Retry joinWork every 1s until the SDK is ready to accept it
  useEffect(() => {
    if (!blankFileReady || !fromCollabShare || !targetCollabWorkId) return;
    if (isInCollaboration) return;
    if (exitGuardRef.current) return;
    if (!user) {
      setCollabShareState({ fromCollabShare: false, targetWorkId: null });
      setWaitingForSession(false);
      return;
    }

    setWaitingForSession(true);

    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 30;

    const userData: CollaborateUserData = {
      v: 1,
      id: user.id,
      name: user.username,
      avatar: user.avatar ?? undefined,
    };

    const tryJoin = () => {
      if (cancelled) return;

      const cooperate = getCooperate();
      if (!cooperate) {
        if (retryCount < MAX_RETRIES) { retryCount++; setTimeout(tryJoin, 1000); }
        return;
      }

      showGlobalLoading('正在打开协同文件...', 'autoJoin');

      cooperate.joinWork(
        targetCollabWorkId,
        (iRet: number) => {
          console.log(`Auto-join attempt ${retryCount + 1}, joinWork returned:`, iRet);
          if (iRet === 0) {
            // 加入成功
            cancelled = true;
            hideGlobalLoading('autoJoin');
            pendingJoinWorkIdRef.current = targetCollabWorkId;
            setWaitingForSession(false);
            setCurrentWorkId(targetCollabWorkId);
            setCollaborationState({ isInCollaboration: true, workId: targetCollabWorkId });
            const storeState = useCADEditorStore.getState();
            patchCurrentFileInfo({
              fileId: storeState.currentFileId || undefined,
              projectId: storeState.currentProjectId ?? null,
              fromShare: true,
              libraryKey: collabShareLibraryKey ?? undefined,
            });
            refreshFileName();
            try {
              const mxCAD = MxCpp.getCurrentMxCAD();
              const fn = mxCAD?.getCurrentFileName?.();
              if (fn && fn !== 'empty_template.mxweb' && fn !== 'empty.mxweb') {
                patchCurrentFileInfo({ name: fn });
                refreshFileName();
              }
            } catch {}
            setTimeout(() => {
              try {
                const mxCAD = MxCpp.getCurrentMxCAD();
                const fn = mxCAD?.getCurrentFileName?.();
                if (fn && fn !== 'empty_template.mxweb' && fn !== 'empty.mxweb') {
                  patchCurrentFileInfo({ name: fn });
                  refreshFileName();
                }
              } catch {}
            }, 500);
            setWorks((prev) => {
              if (prev.some((w) => w.work_id === targetCollabWorkId)) return prev;
              const store = useCADEditorStore.getState();
              const tempWork: Work = {
                work_id: targetCollabWorkId,
                work_data: encodeV3WorkData({
                  drawingId: store.currentFileId || '',
                  projectId: store.currentProjectId ?? null,
                  drawingName: '',
                  sourceType: 'share',
                  creatorId: user.id,
                  creatorName: user.username,
                  creatorAvatar: user.avatar ?? undefined,
                }),
                real_user_id: user.id,
                link_user_ids: [user.id],
                link_user_data: [encodeUserData(userData)],
              };
              return [tempWork, ...prev];
            });
            fetchWorks();
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else if (iRet === 17) {
            // 已经加入过，设置状态即可
            cancelled = true;
            hideGlobalLoading('autoJoin');
            pendingJoinWorkIdRef.current = targetCollabWorkId;
            setWaitingForSession(false);
            setCurrentWorkId(targetCollabWorkId);
            setCollaborationState({ isInCollaboration: true, workId: targetCollabWorkId });
            refreshFileName();
            fetchWorks();
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else if (iRet < 0) {
            // SDK busy — retry
            hideGlobalLoading('autoJoin');
            if (!cancelled && retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(tryJoin, 1000);
            } else {
              setWaitingForSession(false);
              showToast('加入协同超时', 'warning');
              setCollabShareState({ fromCollabShare: false, targetWorkId: null });
            }
          } else {
            // Real error
            cancelled = true;
            hideGlobalLoading('autoJoin');
            setWaitingForSession(false);
            showToast(`加入协同失败，错误码: ${iRet}`, 'error');
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          }
        },
        user.id,
        encodeUserData(userData)
      );
    };

    // Start joining after a brief delay to let the blank file settle
    const timer = setTimeout(tryJoin, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blankFileReady, fromCollabShare, targetCollabWorkId, isInCollaboration, user]);

  // We need a ref-based handle join for create callback
  const handleJoinWorkRef = useRef<(workId: number, skipModifiedCheck?: boolean) => Promise<void>>(async () => {});

  const handleCreateWork = useCallback(async (skipChecks = false) => {
    try {
      if (!skipChecks) {
        const canProceed = await checkAndConfirmUnsavedChanges();
        if (!canProceed) return;
      }

      // Exit current collaboration first
      if (collaborationWorkId !== null) {
        exitCurrentCollaboration();
        setCurrentWorkId(null);
      }

      setCreating(true);
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        setCreating(false);
        return;
      }

      if (currentFileId === undefined || !user) {
        showToast('请先打开图纸并登录', 'error');
        setCreating(false);
        return;
      }

      const userData: CollaborateUserData = {
        v: 1,
        id: user.id,
        name: user.username,
        avatar: user.avatar ?? undefined,
      };

      const fileInfo = mxcadManager.getCurrentFileInfo();
      const drawingName = fileInfo?.name || '未命名图纸';
      let sourceType: CollaborateWorkDataV3['sourceType'];
      let libraryKey: 'drawing' | 'block' | undefined;

      if (fileInfo?.libraryKey) {
        sourceType = 'library';
        libraryKey = fileInfo.libraryKey as 'drawing' | 'block';
      } else if (!currentFileId) {
        sourceType = 'local';
      } else if (fromShare) {
        sourceType = 'share';
      } else {
        sourceType = 'project';
      }

      const workDataPayload = encodeV3WorkData({
        drawingId: currentFileId || '',
        projectId: currentProjectId ?? null,
        drawingName,
        sourceType,
        libraryKey,
        creatorId: user.id,
        creatorName: user.username,
        creatorAvatar: user.avatar ?? undefined,
      });

      showGlobalLoading('正在创建协同...', 'handleCreate');
      cooperate.createWrok(
        (workid: number) => {
          hideGlobalLoading('handleCreate-success');
          setCreating(false);
          if (workid > 0) {
            setCurrentWorkId(workid);
            setCollaborationState({ isInCollaboration: true, workId: workid });
            refreshFileName();
            const newWork: Work = {
              work_id: workid,
              work_data: workDataPayload,
              real_user_id: user.id,
              link_user_ids: [user.id],
              link_user_data: [encodeUserData(userData)],
            };
            setWorks((prev) => {
              if (prev.some((w) => w.work_id === workid)) return prev;
              return [newWork, ...prev];
            });
            fetchWorks();
          } else {
            const errorCode = -workid;
            showToast(`创建协同失败，错误码: ${errorCode}`, 'error');
          }
        },
        workDataPayload,
        user.id,
        encodeUserData(userData)
      );
    } catch (error) {
      hideGlobalLoading('handleCreate-catch');
      console.error('创建协同失败:', error);
      setCreating(false);
      fetchWorks();
      showToast(getErrorMessage(error), 'error');
    }
  }, [
    getCooperate,
    currentFileId,
    currentProjectId,
    user,
    fetchWorks,
    showToast,
    collaborationWorkId,
    fromShare,
  ]);

  const handleJoinWork = useCallback(
    async (workId: number, skipModifiedCheck = false) => {
      // Concurrency guard: prevent double-join
      if (joiningLockRef.current) return;
      joiningLockRef.current = true;

      try {
        // If already in a different work, exit first
        if (
          collaborationWorkId !== null &&
          collaborationWorkId !== workId
        ) {
          exitCurrentCollaboration();
          setCurrentWorkId(null);
          fetchWorks();
        }

        if (!skipModifiedCheck) {
          const canProceed = await checkAndConfirmUnsavedChanges();
          if (!canProceed) {
            joiningLockRef.current = false;
            return;
          }
        }

        setJoiningWorkId(workId);
        const cooperate = getCooperate();
        if (!cooperate) {
          showToast('协同对象未初始化', 'error');
          setJoiningWorkId(null);
          joiningLockRef.current = false;
          return;
        }

        if (!user) {
          showToast('请先登录', 'error');
          setJoiningWorkId(null);
          joiningLockRef.current = false;
          return;
        }

        const userData: CollaborateUserData = {
          v: 1,
          id: user.id,
          name: user.username,
          avatar: user.avatar ?? undefined,
        };

        // Safety fallback: if the file-open event never fires, still hide loading
        const safetyTimer = setTimeout(() => {
          hideGlobalLoading('handleJoin-safetyTimeout');
        }, 15000);

        const onFileOpen = () => {
          clearTimeout(safetyTimer);
          hideGlobalLoading('handleJoin-onFileOpen');
        };
        window.addEventListener('mxcad-file-open-complete', onFileOpen, { once: true });

        showGlobalLoading('正在打开协同文件...', 'handleJoin');
        cooperate.joinWork(
          workId,
          async (iRet: number) => {
            setJoiningWorkId(null);
            joiningLockRef.current = false;
            if (iRet === 0) {
              setCurrentWorkId(workId);
              setCollaborationState({ isInCollaboration: true, workId });
              pendingJoinWorkIdRef.current = workId;
              refreshFileName();
              fetchWorks();
            } else if (iRet === 17) {
              // 已经加入过，设置状态即可
              setCurrentWorkId(workId);
              setCollaborationState({ isInCollaboration: true, workId });
              pendingJoinWorkIdRef.current = workId;
              refreshFileName();
              fetchWorks();
            } else {
              clearTimeout(safetyTimer);
              hideGlobalLoading('handleJoin-error');
              fetchWorks();
              showToast(`加入协同失败，错误码: ${iRet}`, 'error');
            }
          },
          user.id,
          encodeUserData(userData)
        );
      } catch (error) {
        hideGlobalLoading('handleJoin-catch');
        console.error('加入协同失败:', error);
        setJoiningWorkId(null);
        joiningLockRef.current = false;
        fetchWorks();
        showToast(getErrorMessage(error), 'error');
      }
    },
    [getCooperate, user, showToast, fetchWorks, collaborationWorkId]
  );
  handleJoinWorkRef.current = handleJoinWork;

  const handleExitWork = useCallback(async () => {
    try {
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast('协同对象未初始化', 'error');
        return;
      }

      const ret = cooperate.exitWrok();
      if (ret === 0) {
        const exitedWorkId = useCADEditorStore.getState().collaborationWorkId;
        setCurrentWorkId(null);
        setCollaborationState({ isInCollaboration: false, workId: null });
        exitGuardRef.current = true;
        setTimeout(() => { exitGuardRef.current = false; }, 3000);
        refreshFileName();
        if (exitedWorkId !== null) {
          setWorks((prev) => prev.filter((w) => w.work_id !== exitedWorkId));
        }
        // 延迟获取，等待 SDK 状态更新
        setTimeout(() => fetchWorks(), 300);
        showToast('已退出协同', 'success');
      } else {
        // 退出失败也刷新，确保列表与服务器一致
        fetchWorks();
        showToast(`退出协同失败，错误码: ${ret}`, 'error');
      }
    } catch (error) {
      console.error('退出协同失败:', error);
      fetchWorks();
      showToast(getErrorMessage(error), 'error');
    }
  }, [getCooperate, fetchWorks, showToast]);

  // --- Filtered work lists ---

  // Current file works: match by drawingId, sourceType-specific rules
  const currentFileWorks = useMemo(
    () =>
      works.filter((w) => {
        const data = parseWorkData(w.work_data);
        if (!data) return false;

        // V3: use sourceType for matching
        if (data.v === 3) {
          if (data.sourceType === 'local') {
            return currentFileId === '' && data.drawingId === '' && user && (
              data.creatorId === user.id || w.link_user_ids.includes(user.id)
            );
          }
          if (data.sourceType === 'library') {
            return data.drawingId === currentFileId;
          }
          if (data.drawingId !== currentFileId) return false;
          return !data.projectId || data.projectId === currentProjectId;
        }

        // V1/V2 fallback
        if (data.drawingId !== currentFileId) return false;
        if (data.projectId) return data.projectId === currentProjectId;
        return user ? w.real_user_id === user.id || w.link_user_ids.includes(user.id) : false;
      }),
    [works, currentFileId, currentProjectId, user]
  );

  // My created works (for list panel)
  const myWorks = useMemo(
    () =>
      works
        .filter((w) => user && w.real_user_id === user.id)
        .map((w) => {
          const data = parseWorkData(w.work_data);
          return {
            work: w,
            projectName: data?.projectId
              ? projectNameCache[data.projectId] ?? '未知项目'
              : '个人空间',
            drawingName: (data?.drawingId && fileNameCache[data.drawingId]
              ? fileNameCache[data.drawingId]
              : (data && data.v === 3 ? data.drawingName : undefined)) || '未知图纸',
            isCurrentFile: data?.drawingId === currentFileId,
            isJoined: currentWorkId === w.work_id,
            onlineCount: w.link_user_ids.length,
          };
        }),
    [works, user, projectNameCache, fileNameCache, currentFileId, currentWorkId]
  );

  // Project works (for list panel) - exclude those already in myWorks
  const myWorkIds = useMemo(() => new Set(myWorks.map((m) => m.work.work_id)), [myWorks]);

  const projectWorks = useMemo(
    () =>
      works
        .filter((w) => {
          if (myWorkIds.has(w.work_id)) return false;
          const data = parseWorkData(w.work_data);
          if (!data) return false;
          if (!data.projectId) return false;
          return myProjectIds.includes(data.projectId);
        })
        .map((w) => {
          const data = parseWorkData(w.work_data);
          return {
            work: w,
            projectName: data?.projectId
              ? projectNameCache[data.projectId] ?? '未知项目'
              : '',
            drawingName: (data?.drawingId && fileNameCache[data.drawingId]
              ? fileNameCache[data.drawingId]
              : (data && data.v === 3 ? data.drawingName : undefined)) || '未知图纸',
            isCurrentFile: data?.drawingId === currentFileId,
            isJoined: currentWorkId === w.work_id,
            onlineCount: w.link_user_ids.length,
          };
        }),
    [works, myWorkIds, myProjectIds, projectNameCache, fileNameCache, currentFileId, currentWorkId]
  );

  const currentFileName: string = useMemo(() => {
    if (currentFileId === null || currentFileId === undefined) return '';
    const cached = fileNameCache[currentFileId];
    if (cached) return cached;
    return storeFileName || '当前图纸';
  }, [currentFileId, fileNameCache, storeFileName]);

  return (
    <div className={styles.container} data-tour="collaborators-panel">
      <div className={styles.subTabBar}>
        <Tabs>
          <Tab
            active={activeSubTab === 'current'}
            tabVariant="primary"
            size="sm"
            onClick={() => setActiveSubTab('current')}
          >
            当前图纸
          </Tab>
          <Tab
            active={activeSubTab === 'list'}
            tabVariant="primary"
            size="sm"
            onClick={() => setActiveSubTab('list')}
          >
            协同列表
          </Tab>
        </Tabs>

        <button
          className={styles.toolbarRefreshBtn}
          onClick={() => fetchWorks(true)}
          disabled={loading}
          title="刷新列表"
          aria-label="刷新列表"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className={styles.panelContent}>
        {activeSubTab === 'current' ? (
          <CurrentFilePanel
            works={currentFileWorks}
            currentWorkId={currentWorkId}
            fileName={currentFileName}
            isCadReady={isCadReady}
            creating={creating}
            joiningWorkId={joiningWorkId}
            waitingForSession={waitingForSession}
            fromShare={fromShare}
            onCreateWork={handleCreateWork}
            onJoinWork={handleJoinWork}
            onExitWork={handleExitWork}
          />
        ) : (
          <WorkListPanel
            myWorks={myWorks}
            projectWorks={projectWorks}
            loading={loading}
            currentWorkId={currentWorkId}
            joiningWorkId={joiningWorkId}
            onJoinWork={handleJoinWork}
            onExitWork={handleExitWork}
            onRefresh={fetchWorks}
          />
        )}
      </div>
    </div>
  );
};

export default CollaborateSidebar;
