import { useCallback, useEffect, useRef, useState } from 'react';
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
import { AUTO_JOIN_SAFETY_TIMEOUT } from '@/constants/timeouts';
import { t } from '@/languages';

/**
 * 从引擎读当前图纸名并同步到会话（引擎未就绪会抛错，静默忽略）。
 * 走 mxcadManager 唯一出口，hook 层不直接摸 MxCpp。
 */
function syncCurrentFileNameToSession(): void {
  try {
    const name = mxcadManager.getCurrentFileName();
    if (name && !isEmptyDocumentName(name)) {
      patchSession({ name });
      refreshFileName();
    }
  } catch {
    /* 引擎未就绪，忽略 */
  }
}

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
  user: { id: string; username: string; avatar?: string | null } | null
): CollabActionsState {
  const {
    currentFileId,
    currentProjectId,
    fromShare,
    fromCollabShare,
    isInCollaboration,
    collaborationWorkId,
    isPersonalSpaceMode,
    setCollaborationState,
    setCollabPhase,
  } = useCADEditorStore();
  const pendingJoinWorkId = useCADEditorStore((s) => s.pendingJoinWorkId);
  const setPendingJoinWorkId = useCADEditorStore((s) => s.setPendingJoinWorkId);
  const { showToast } = useNotification();

  const [creating, setCreating] = useState(false);
  const [joiningWorkId, setJoiningWorkId] = useState<number | null>(null);
  const [isCadReady, setIsCadReady] = useState(false);

  const initCheckRef = useRef<NodeJS.Timeout | null>(null);
  const joiningLockRef = useRef(false);
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

  // 「正在建立协同连接」由协同链接意图（fromCollabShare）驱动：意图出现即等待，
  // auto-join 落定（成功/超时/失败）时把 fromCollabShare 置 false 而结束。
  // auto-join 已上移路由级（useCollabAutoJoin），本 hook 不再负责触发，也不再有
  // 依赖 isCadReady/visible 的门禁——面板可见与否不影响意图是否被执行。
  const waitingForSession = fromCollabShare;

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
          fileHash:
            sourceType === 'local'
              ? (fileInfo?.fileHash ?? undefined)
              : undefined,
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
              setPendingJoinWorkId(workId);
              refreshFileName();
              fetchWorks();
            } else if (iRet === 17) {
              setCurrentWorkId(workId);
              setCollaborationState({ isInCollaboration: true, workId });
              setPendingJoinWorkId(workId);
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

  // 图纸身份对账：auto-join / 手动加入落定后，store.pendingJoinWorkId 指向已加入的
  // work，但面板此时可能还没有 works 列表（从路由级发起，无法直接写本地 works）。
  // 拿到列表后从 work_data 补齐 fileId/projectId/名称，使编辑器标题与协同面板状态
  // 一致。ref 已上移 store，故 auto-join 与手动加入共用同一条对账路径。
  useEffect(() => {
    if (pendingJoinWorkId === null) return;
    const joinedWork = works.find((w) => w.work_id === pendingJoinWorkId);
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
      // 只有当 drawingName 有效时才清空，否则等待 fetchWorks 返回
      // 服务端的真实 work 数据（包含正确的 drawingName）
      setPendingJoinWorkId(null);
    }
  }, [works, pendingJoinWorkId, setPendingJoinWorkId]);

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
