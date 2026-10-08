import { useCallback, useEffect, useRef, useState } from 'react';
import { MxCpp } from 'mxcad';
import { useNotification } from '../contexts/NotificationContext';
import { getErrorMessage } from '../utils/errorHandler';
import {
  mxcadManager,
  checkAndConfirmUnsavedChanges,
  refreshFileName,
  getCooperate,
  exitCollaboration,
  isEmptyDocumentName,
} from '../services/mxcadManager';
import {
  patchSession,
  patchSessionFlags,
  subscribe,
} from '../services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import {
  parseWorkData,
  encodeV3WorkData,
  encodeUserData,
} from '../types/collaboration';
import type {
  CollaborateUserData,
  CollaborateWorkDataV3,
  Work,
} from '../types/collaboration';
import {
  showGlobalLoading,
  hideGlobalLoading,
} from '../services/loadingService';
import {
  AUTO_JOIN_SAFETY_TIMEOUT,
  AUTO_JOIN_MAX_RETRIES,
} from '@/constants/timeouts';
import { t } from '@/languages';

export interface CollabActionsState {
  creating: boolean;
  joiningWorkId: number | null;
  waitingForSession: boolean;
  isCadReady: boolean;
  handleCreateWork: (skipChecks?: boolean) => Promise<void>;
  handleJoinWork: (
    workId: number,
    skipModifiedCheck?: boolean
  ) => Promise<void>;
  handleExitWork: () => Promise<void>;
}

export function useCollabActions(
  visible: boolean,
  works: Work[],
  setWorks: React.Dispatch<React.SetStateAction<Work[]>>,
  currentWorkId: number | null,
  setCurrentWorkId: (id: number | null) => void,
  fetchWorks: (showLoading?: boolean, force?: boolean) => Promise<void>,
  user: { id: string; username: string; avatar?: string | null } | null,
  onFileLoaded?: () => void
): CollabActionsState {
  const {
    currentFileId,
    currentProjectId,
    fromShare,
    fromCollabShare,
    targetCollabWorkId,
    collabShareLibraryKey,
    isInCollaboration,
    collaborationWorkId,
    isPersonalSpaceMode,
    setCollaborationState,
    setCollabPhase,
    setCollabShareState,
  } = useCADEditorStore();
  const { showToast } = useNotification();

  const [creating, setCreating] = useState(false);
  const [joiningWorkId, setJoiningWorkId] = useState<number | null>(null);
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [isCadReady, setIsCadReady] = useState(false);

  const initCheckRef = useRef<NodeJS.Timeout | null>(null);
  const joiningLockRef = useRef(false);
  const autoJoinTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingJoinWorkIdRef = useRef<number | null>(null);
  // 组件卸载标记：用户发起的 join/create 回调在卸载后仍会触发，
  // 此时引擎 session 若已开必须就地清理（孤儿清理），否则会话泄漏
  const joinCancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      joinCancelledRef.current = true;
    };
  }, []);

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

  const isCadReadyCombined = isCadReady && !fromCollabShare;
  useEffect(() => {
    if (!isCadReadyCombined || !visible || fromShare) return;

    if (fromCollabShare) {
      setWaitingForSession(true);
    }
  }, [isCadReadyCombined, visible, fromCollabShare, fromShare]);

  const handleCreateWork = useCallback(
    async (skipChecks = false) => {
      try {
        if (!skipChecks) {
          const canProceed = await checkAndConfirmUnsavedChanges();
          if (!canProceed) return;
        }

        if (collaborationWorkId !== null) {
          await exitCollaboration();
          setCurrentWorkId(null);
        }

        setCreating(true);
        const cooperate = getCooperate();
        if (!cooperate) {
          showToast(t('协同对象未初始化'), 'error');
          setCreating(false);
          return;
        }

        if (currentFileId === undefined || !user) {
          showToast(t('请先打开图纸并登录'), 'error');
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
        const drawingName = fileInfo?.name || t('未命名图纸');
        let sourceType: CollaborateWorkDataV3['sourceType'];
        let libraryKey: 'drawing' | 'block' | undefined;

        if (fileInfo?.libraryKey) {
          sourceType = 'library';
          libraryKey = fileInfo.libraryKey as 'drawing' | 'block';
        } else if (!currentFileId) {
          sourceType = 'local';
        } else if (fromShare) {
          sourceType = 'share';
        } else if (isPersonalSpaceMode) {
          sourceType = 'my';
        } else if (currentProjectId) {
          sourceType = 'project';
        } else {
          sourceType = 'local';
        }

        const workDataPayload = encodeV3WorkData({
          drawingId: currentFileId || '',
          projectId:
            sourceType === 'my' || sourceType === 'local'
              ? null
              : (currentProjectId ?? null),
          drawingName,
          sourceType,
          libraryKey,
          // 本地图纸以文件内容 MD5 作为协同识别的唯一标识（drawingId 为空串），
          // 使同一张本地图纸创建的多个协同可被准确聚合；云图/库等用 nodeId 识别，不携带。
          fileHash: sourceType === 'local' ? (fileInfo?.fileHash ?? undefined) : undefined,
          creatorId: user.id,
          creatorName: user.username,
          creatorAvatar: user.avatar ?? undefined,
        });

        showGlobalLoading(t('正在创建协同...'), 'handleCreate');
        setCollabPhase('joining');
        cooperate.createWork(
          (workid: number) => {
            hideGlobalLoading('handleCreate-success');
            setCreating(false);
            if (joinCancelledRef.current) {
              // 组件已卸载：引擎 session 若已开则就地清理，防会话泄漏
              if (workid > 0) {
                try {
                  getCooperate()?.exitWork();
                } catch {
                  /* 忽略 */
                }
              }
              setCollabPhase('idle');
              return;
            }
            if (workid > 0) {
              setCurrentWorkId(workid);
              setCollaborationState({
                isInCollaboration: true,
                workId: workid,
              });
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
              // 创建成功后拉取服务端完整协同列表（以服务端为准，不进行本地合并）
              fetchWorks();
            } else {
              setCollabPhase('idle');
              const errorCode = -workid;
              showToast(`${t('创建协同失败，错误码: ')}${errorCode}`, 'error');
            }
          },
          workDataPayload,
          user.id,
          encodeUserData(userData)
        );
      } catch (error) {
        hideGlobalLoading('handleCreate-catch');
        setCreating(false);
        setCollabPhase('idle');
        fetchWorks();
        showToast(getErrorMessage(error), 'error');
      }
    },
    [
      currentFileId,
      currentProjectId,
      user,
      fetchWorks,
      showToast,
      collaborationWorkId,
      fromShare,
      isPersonalSpaceMode,
      setCurrentWorkId,
      setCollaborationState,
      setCollabPhase,
      setWorks,
    ]
  );

  const handleJoinWork = useCallback(
    async (workId: number, skipModifiedCheck = false) => {
      if (joiningLockRef.current) return;
      joiningLockRef.current = true;

      // 提升到 try 外：catch 分支也要取消订阅，避免订阅泄漏累积（评审修复）
      let unsubscribeOpenComplete: (() => void) | null = null;

      try {
        if (collaborationWorkId !== null && collaborationWorkId !== workId) {
          await exitCollaboration();
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
          showToast(t('协同对象未初始化'), 'error');
          setJoiningWorkId(null);
          joiningLockRef.current = false;
          return;
        }

        if (!user) {
          showToast(t('请先登录'), 'error');
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

        const safetyTimer = setTimeout(() => {
          hideGlobalLoading('handleJoin-safetyTimeout');
          unsubscribeOpenComplete?.();
          unsubscribeOpenComplete = null;
        }, AUTO_JOIN_SAFETY_TIMEOUT);

        const onFileOpen = () => {
          clearTimeout(safetyTimer);
          hideGlobalLoading('handleJoin-onFileOpen');
          unsubscribeOpenComplete?.();
          unsubscribeOpenComplete = null;
        };
        unsubscribeOpenComplete = subscribe(
          CAD_EVENTS.OPEN_COMPLETE,
          onFileOpen
        );

        showGlobalLoading(t('正在打开协同文件...'), 'handleJoin');
        setCollabPhase('joining');
        cooperate.joinWork(
          workId,
          (iRet: number) => {
            setJoiningWorkId(null);
            joiningLockRef.current = false;
            if (joinCancelledRef.current) {
              // 组件已卸载：引擎 session 若已开则就地清理，防会话泄漏
              if (iRet === 0 || iRet === 17) {
                try {
                  getCooperate()?.exitWork();
                } catch {
                  /* 忽略 */
                }
              }
              setCollabPhase('idle');
              return;
            }
            if (iRet === 0) {
              setCurrentWorkId(workId);
              setCollaborationState({ isInCollaboration: true, workId });
              pendingJoinWorkIdRef.current = workId;
              refreshFileName();
              fetchWorks();
            } else if (iRet === 17) {
              setCurrentWorkId(workId);
              setCollaborationState({ isInCollaboration: true, workId });
              pendingJoinWorkIdRef.current = workId;
              refreshFileName();
              fetchWorks();
            } else {
              clearTimeout(safetyTimer);
              hideGlobalLoading('handleJoin-error');
              unsubscribeOpenComplete?.();
              unsubscribeOpenComplete = null;
              setCollabPhase('idle');
              fetchWorks();
              showToast(t('该协同已关闭'), 'error');
            }
          },
          user.id,
          encodeUserData(userData)
        );
      } catch (error) {
        hideGlobalLoading('handleJoin-catch');
        setJoiningWorkId(null);
        joiningLockRef.current = false;
        unsubscribeOpenComplete?.();
        unsubscribeOpenComplete = null;
        setCollabPhase('idle');
        fetchWorks();
        showToast(getErrorMessage(error), 'error');
      }
    },
    [
      user,
      showToast,
      fetchWorks,
      collaborationWorkId,
      setCurrentWorkId,
      setCollaborationState,
      setCollabPhase,
    ]
  );

  const handleExitWork = useCallback(async () => {
    try {
      const cooperate = getCooperate();
      if (!cooperate) {
        showToast(t('协同对象未初始化'), 'error');
        return;
      }

      // 先取旧 workId（命令内部会清状态）；exitGuard 置位统一在命令内
      const exitedWorkId = useCADEditorStore.getState().collaborationWorkId;
      const result = await exitCollaboration();
      if (result.exited) {
        setCurrentWorkId(null);
        if (exitedWorkId !== null) {
          setWorks((prev) => prev.filter((w) => w.work_id !== exitedWorkId));
        }
        fetchWorks();
        showToast(t('已退出协同'), 'success');
      } else {
        fetchWorks();
        showToast(
          `${t('退出协同失败，错误码: ')}${result.exitCode ?? '未知'}`,
          'error'
        );
      }
    } catch (error) {
      fetchWorks();
      showToast(getErrorMessage(error), 'error');
    }
  }, [fetchWorks, showToast, setCurrentWorkId, setWorks]);

  useEffect(() => {
    if (!visible || !isCadReady || !fromCollabShare || !targetCollabWorkId)
      return;
    // phase/exitGuard 用 getState() 读且不进依赖数组：tryJoin 置 'joining'
    // 若触发 effect 重跑，cleanup 的 cancelled 会掐断 in-flight 的重试链
    // （phase !== 'idle' 同时覆盖 joined 与 joining，加入在途不重复发起）
    const guardState = useCADEditorStore.getState();
    if (guardState.collabPhase !== 'idle') return;
    if (guardState.collabExitGuard) return;
    if (!user) return;

    setWaitingForSession(true);
    showGlobalLoading(t('正在打开协同文件...'), 'autoJoin');

    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = AUTO_JOIN_MAX_RETRIES;

    const safetyTimer = setTimeout(() => {
      hideGlobalLoading('autoJoin-safetyTimeout');
      // joinWork 永不回调（引擎挂起/白名单异常）时兜底关闭骨架屏，
      // 避免页面永久停留在加载态
      onFileLoaded?.();
      if (useCADEditorStore.getState().collabPhase === 'joining') {
        useCADEditorStore.getState().setCollabPhase('idle');
      }
    }, AUTO_JOIN_SAFETY_TIMEOUT);

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
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(tryJoin, 1000);
        }
        return;
      }

      setCollabPhase('joining');
      cooperate.joinWork(
        targetCollabWorkId,
        (iRet: number) => {
          if (cancelled) {
            // 组件已卸载/用户已离开：引擎 session 若已开则就地清理，
            // 防「引擎已加入但 store 说未加入」的会话泄漏
            if (iRet === 0 || iRet === 17) {
              try {
                getCooperate()?.exitWork();
              } catch {
                /* 忽略 */
              }
            }
            setCollabPhase('idle');
            return;
          }
          if (iRet === 0) {
            cancelled = true;
            clearTimeout(safetyTimer);
            pendingJoinWorkIdRef.current = targetCollabWorkId;
            setWaitingForSession(false);
            setCurrentWorkId(targetCollabWorkId);
            setCollaborationState({
              isInCollaboration: true,
              workId: targetCollabWorkId,
            });
            const storeState = useCADEditorStore.getState();
            patchSession({
              fileId: storeState.currentFileId || undefined,
              projectId: storeState.currentProjectId ?? null,
              // 加入协同成功后解除分享模式：fromShare=true 会阻断协同面板的
              // fetchWorks/轮询/名称解析，导致当前图纸状态与协同列表无法刷新
              fromShare: false,
              libraryKey: collabShareLibraryKey ?? undefined,
            });
            refreshFileName();
            try {
              const mxCAD = MxCpp.getCurrentMxCAD();
              const fn = mxCAD?.getCurrentFileName?.();
              if (fn && !isEmptyDocumentName(fn)) {
                patchSession({ name: fn });
                refreshFileName();
              }
              // 引擎文件名校读可能失败（未就绪），忽略
            } catch {
              /* 忽略 */
            }
            setTimeout(() => {
              try {
                const mxCAD = MxCpp.getCurrentMxCAD();
                const fn = mxCAD?.getCurrentFileName?.();
                if (fn && !isEmptyDocumentName(fn)) {
                  patchSession({ name: fn });
                  refreshFileName();
                }
              } catch {
                /* 忽略 */
              }
              hideGlobalLoading('autoJoin-fileLoaded');
              onFileLoaded?.();
            }, 500);
            setWorks((prev) => {
              if (prev.some((w) => w.work_id === targetCollabWorkId))
                return prev;
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
            // force=true：协同链接加入时 fromShare=true 会阻断普通 fetchWorks，
            // 必须强制拉取服务端 works 列表，以便 pendingJoinWorkIdRef effect
            // 从 work_data.drawingId 补齐 currentFileId
            fetchWorks(false, true);
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else if (iRet === 17) {
            cancelled = true;
            clearTimeout(safetyTimer);
            hideGlobalLoading('autoJoin');
            onFileLoaded?.();
            pendingJoinWorkIdRef.current = targetCollabWorkId;
            setWaitingForSession(false);
            setCurrentWorkId(targetCollabWorkId);
            setCollaborationState({
              isInCollaboration: true,
              workId: targetCollabWorkId,
            });
            // 同上：解除分享模式，恢复协同面板轮询/刷新/名称解析
            patchSessionFlags({ fromShare: false });
            refreshFileName();
            fetchWorks(false, true);
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else if (iRet < 0) {
            if (!cancelled && retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(tryJoin, 1000);
            } else {
              clearTimeout(safetyTimer);
              hideGlobalLoading('autoJoin');
              setWaitingForSession(false);
              // 失败也关闭骨架屏：auto-join 已结束（超时），不允许页面停留在加载态
              onFileLoaded?.();
              showToast(t('加入协同超时'), 'warning');
              setCollabPhase('idle');
              setCollabShareState({
                fromCollabShare: false,
                targetWorkId: null,
              });
            }
          } else {
            cancelled = true;
            clearTimeout(safetyTimer);
            hideGlobalLoading('autoJoin');
            setWaitingForSession(false);
            // 失败也关闭骨架屏：协同已关闭/链接失效，auto-join 已结束
            onFileLoaded?.();
            showToast(t('该协同已关闭，链接已失效'), 'error');
            setCollabPhase('idle');
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          }
        },
        user.id,
        encodeUserData(userData)
      );
    };

    const timer = setTimeout(tryJoin, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(safetyTimer);
      hideGlobalLoading('autoJoin-cleanup');
      // join 未落定就卸载（如 cooperate 一直不可用的重试中）→ 落定 phase，
      // 避免卡在 'joining'；已 joined 的不覆盖（回调侧已处理）
      if (useCADEditorStore.getState().collabPhase === 'joining') {
        useCADEditorStore.getState().setCollabPhase('idle');
      }
    };
  }, [
    isCadReady,
    fromCollabShare,
    targetCollabWorkId,
    user,
    visible,
    collabShareLibraryKey,
    setCurrentWorkId,
    setWorks,
    fetchWorks,
    setCollaborationState,
    setCollabPhase,
    setCollabShareState,
  ]);

  useEffect(() => {
    if (!visible) return;
    if (
      !isInCollaboration &&
      collaborationWorkId === null &&
      currentWorkId !== null
    ) {
      setCurrentWorkId(null);
      fetchWorks();
    }
  }, [
    visible,
    isInCollaboration,
    collaborationWorkId,
    currentWorkId,
    fetchWorks,
    setCurrentWorkId,
  ]);

  useEffect(() => {
    const targetWorkId = pendingJoinWorkIdRef.current;
    if (targetWorkId === null) return;
    const joinedWork = works.find((w) => w.work_id === targetWorkId);
    if (!joinedWork) return;
    const data = parseWorkData(joinedWork.work_data);
    if (!data) return;
    const hasRealData = !!(
      data.drawingId ||
      (data.v === 3 && data.drawingName)
    );
    if (!hasRealData) return;
    patchSessionFlags({
      fileId: data.drawingId ?? undefined,
      projectId: data.projectId ?? undefined,
      fileName: data.v === 3 && data.drawingName ? data.drawingName : undefined,
    });
    if (data.v === 3 && data.drawingName) {
      patchSession({ name: data.drawingName });
      refreshFileName();
      // 只有当drawingName有效时才清空ref，否则等待fetchWorks返回
      // 服务端的真实work数据（包含正确的drawingName）
      pendingJoinWorkIdRef.current = null;
    }
  }, [works]);

  return {
    creating,
    joiningWorkId,
    waitingForSession,
    isCadReady,
    handleCreateWork,
    handleJoinWork,
    handleExitWork,
  };
}
