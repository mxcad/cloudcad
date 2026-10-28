import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import {
  mxcadManager,
  getCooperate,
  dispatchJoinWork,
  dispatchExitWork,
  refreshFileName,
  isEmptyDocumentName,
} from '../services/mxcadManager';
import { patchSession, patchSessionFlags } from '../services/drawingSession';
import {
  encodeUserData,
  type CollaborateUserData,
} from '../types/collaboration';
import {
  showGlobalLoading,
  hideGlobalLoading,
} from '../services/loadingService';
import {
  AUTO_JOIN_SAFETY_TIMEOUT,
  AUTO_JOIN_MAX_RETRIES,
} from '@/constants/timeouts';
import { VIEW_INIT_TIMEOUT_MS } from '../services/mxcadManager/mxcadTypes';
import { globalShowToast } from '../utils/notificationEvents';
import { t } from '@/languages';

/**
 * 协同链接（?collabWorkId=）的 auto-join —— 路由级意图驱动。
 *
 * 设计要点：
 * 1. 意图归位：auto-join 是「URL 用户意图」的执行体，挂在 CADEditorDirect
 *    （路由级、编辑器路由恒挂载），不再挂在 CollaborateSidebar 面板里。面板受
 *    collaborationEnabled / isCollaborationAllowed / 侧边栏 isVisible / activeTab
 *    四重开关支配，任一关掉都会把意图整体静默吞掉（历史缺陷：靠 SidebarContainer
 *    初始落 collaborate tab 才触发，只补了 activeTab 一维，其余三维仍是死穴）。
 * 2. loading 前置：从「意图出现」就弹全局 loading，覆盖引擎 WASM 初始化间隙——
 *    此前 loading 被 isCadReady 门禁压到引擎就绪之后，最慢的一段反而裸奔。
 * 3. 依赖稳定：effect 依赖 user?.id（原始值）而非 user 对象。AuthContext 的
 *    refreshUser()（成员变更 SSE / 资料刷新）每次产生新 user 对象，依赖对象身份
 *    会让 effect 重跑、cleanup 掐断在途 join 重试链（历史缺陷：auto-join 静默失效）。
 * 4. 可观测失败：引擎初始化失败/超时、join 超时/重试耗尽/失败都关 loading +
 *    toast + 清除意图，不再「无 loading 也无报错」。
 *
 * 图纸身份对账（fileId/projectId/名称从 work_data 补齐）由面板侧完成：本 hook
 * 只把已落定的 work 写入 store.pendingJoinWorkId，面板拿到 works 列表后在
 * useCollabActions 的 reconciliation effect 里补齐会话字段（该 effect 依赖 works
 * 列表，只能住在面板）。加入成功后置 fromShare=false，面板的 OPEN_COMPLETE
 * 订阅 / 轮询恢复，works 自动刷新。
 */
export function useCollabAutoJoin(onFileLoaded?: () => void): void {
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  // 回调身份不进 effect 依赖：父组件若传内联箭头，每次渲染都变身份，
  // 放进 deps 会让 effect 重跑、cleanup 掐断在途 join 重试链（历史缺陷）。
  const onFileLoadedRef = useRef(onFileLoaded);
  onFileLoadedRef.current = onFileLoaded;

  const fromCollabShare = useCADEditorStore((s) => s.fromCollabShare);
  const targetCollabWorkId = useCADEditorStore((s) => s.targetCollabWorkId);
  const collabShareLibraryKey = useCADEditorStore(
    (s) => s.collabShareLibraryKey
  );
  const setCollabShareState = useCADEditorStore((s) => s.setCollabShareState);
  const setCollaborationState = useCADEditorStore(
    (s) => s.setCollaborationState
  );
  const setPendingJoinWorkId = useCADEditorStore((s) => s.setPendingJoinWorkId);

  useEffect(() => {
    // 意图不存在 / 未登录：不启动（未登录走 loginGate.requireLogin 提示）
    if (!fromCollabShare || targetCollabWorkId === null) return;
    const u = userRef.current;
    if (!u) return;

    // phase/exitGuard 用 getState() 读且不进依赖数组：tryJoin 置 'joining'，
    // 若触发 effect 重跑，cleanup 的 cancelled 会掐断 in-flight 的重试链
    // （phase !== 'idle' 同时覆盖 joined 与 joining，加入在途不重复发起）
    const guardState = useCADEditorStore.getState();
    if (guardState.collabPhase !== 'idle') return;
    if (guardState.collabExitGuard) return;

    const workId = targetCollabWorkId;
    const libraryKey = collabShareLibraryKey;

    // 意图在途即弹 loading：覆盖引擎初始化间隙 + join 全程
    showGlobalLoading(t('正在打开协同文件...'), 'autoJoin');

    let cancelled = false;
    let retryCount = 0;
    let joinSafetyTimer: ReturnType<typeof setTimeout> | null = null;
    let enginePollTimer: ReturnType<typeof setTimeout> | null = null;
    // 引擎初始化有硬上限（useHomeInit 60s 超时 + 余量）；超时即放弃，避免永久 loading
    const engineInitDeadline = Date.now() + VIEW_INIT_TIMEOUT_MS + 10_000;

    /** 统一收尾（仅失败/超时路径）：关 loading、落定 phase、清意图、提示用户 */
    const settle = (message: string, type: 'error' | 'warning') => {
      if (joinSafetyTimer) clearTimeout(joinSafetyTimer);
      if (enginePollTimer) clearTimeout(enginePollTimer);
      hideGlobalLoading('autoJoin-settle');
      useCADEditorStore.getState().setCollabPhase('idle');
      setCollabShareState({ fromCollabShare: false, targetWorkId: null });
      setPendingJoinWorkId(null);
      globalShowToast(message, type);
      onFileLoadedRef.current?.();
    };

    const startJoinSafety = () => {
      joinSafetyTimer = setTimeout(() => {
        // joinWork 永不回调（引擎挂起/白名单异常）时兜底：关 loading + 骨架屏
        settle(t('加入协同超时'), 'warning');
      }, AUTO_JOIN_SAFETY_TIMEOUT);
    };

    const userData: CollaborateUserData = {
      v: 1,
      id: u.id,
      name: u.username,
      avatar: u.avatar ?? undefined,
    };

    const tryJoin = () => {
      if (cancelled) return;

      const cooperate = getCooperate();
      if (!cooperate) {
        if (retryCount < AUTO_JOIN_MAX_RETRIES) {
          retryCount++;
          enginePollTimer = setTimeout(tryJoin, 1000);
        } else {
          settle(t('加入协同超时'), 'error');
        }
        return;
      }

      useCADEditorStore.getState().setCollabPhase('joining');
      // 经 __joinCollabWork__ 引擎命令加入：引擎命令状态机先停掉在途绘图命令
      // （如画线）再执行，避免「一边画线、一边加入协同」并发破坏引擎状态
      const dispatched = dispatchJoinWork(
        workId,
        (iRet: number) => {
          if (cancelled) {
            // 组件已卸载/用户已离开：引擎 session 若已开则就地清理，
            // 防「引擎已加入但 store 说未加入」的会话泄漏
            if (iRet === 0 || iRet === 17) {
              dispatchExitWork();
            }
            useCADEditorStore.getState().setCollabPhase('idle');
            return;
          }
          if (iRet === 0) {
            cancelled = true;
            if (joinSafetyTimer) clearTimeout(joinSafetyTimer);
            if (enginePollTimer) clearTimeout(enginePollTimer);
            setPendingJoinWorkId(workId);
            setCollaborationState({ isInCollaboration: true, workId });
            const storeState = useCADEditorStore.getState();
            patchSession({
              fileId: storeState.currentFileId || undefined,
              projectId: storeState.currentProjectId ?? null,
              // 加入协同成功后解除分享模式：fromShare=true 会阻断协同面板的
              // fetchWorks/轮询/名称解析，导致当前图纸状态与协同列表无法刷新
              fromShare: false,
              libraryKey: libraryKey ?? undefined,
            });
            refreshFileName();
            syncCurrentFileNameToSession();
            setTimeout(() => {
              syncCurrentFileNameToSession();
              hideGlobalLoading('autoJoin-fileLoaded');
              onFileLoadedRef.current?.();
            }, 500);
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else if (iRet === 17) {
            cancelled = true;
            if (joinSafetyTimer) clearTimeout(joinSafetyTimer);
            if (enginePollTimer) clearTimeout(enginePollTimer);
            hideGlobalLoading('autoJoin');
            onFileLoadedRef.current?.();
            setPendingJoinWorkId(workId);
            setCollaborationState({ isInCollaboration: true, workId });
            // 同上：解除分享模式，恢复协同面板轮询/刷新/名称解析
            patchSessionFlags({ fromShare: false });
            refreshFileName();
            setCollabShareState({ fromCollabShare: false, targetWorkId: null });
          } else if (iRet < 0) {
            if (retryCount < AUTO_JOIN_MAX_RETRIES) {
              retryCount++;
              enginePollTimer = setTimeout(tryJoin, 1000);
            } else {
              settle(t('加入协同超时'), 'warning');
            }
          } else {
            settle(t('该协同已关闭，链接已失效'), 'error');
          }
        },
        u.id,
        encodeUserData(userData)
      );
      if (!dispatched) {
        // 派发失败（引擎异常）：回调不会再来，按瞬时失败进重试链
        if (retryCount < AUTO_JOIN_MAX_RETRIES) {
          retryCount++;
          enginePollTimer = setTimeout(tryJoin, 1000);
        } else {
          settle(t('加入协同超时'), 'warning');
        }
      }
    };

    const waitEngineReady = () => {
      if (cancelled) return;
      // 引擎初始化失败（useHomeInit 已把 store.error 置位）：放弃并关 loading，
      // 避免 loading 遮罩盖住错误屏
      if (useCADEditorStore.getState().error !== null) {
        settle(t('CAD 编辑器初始化失败，请刷新页面重试'), 'error');
        return;
      }
      if (mxcadManager.isReady()) {
        startJoinSafety();
        enginePollTimer = setTimeout(tryJoin, 500);
        return;
      }
      if (Date.now() >= engineInitDeadline) {
        settle(t('CAD 编辑器初始化失败，请刷新页面重试'), 'error');
        return;
      }
      enginePollTimer = setTimeout(waitEngineReady, 200);
    };

    waitEngineReady();

    return () => {
      cancelled = true;
      if (enginePollTimer) clearTimeout(enginePollTimer);
      if (joinSafetyTimer) clearTimeout(joinSafetyTimer);
      hideGlobalLoading('autoJoin-cleanup');
      // join 未落定就卸载（如 cooperate 一直不可用的重试中）→ 落定 phase，
      // 避免卡在 'joining'；已 joined 的不覆盖（回调侧已处理）
      if (useCADEditorStore.getState().collabPhase === 'joining') {
        useCADEditorStore.getState().setCollabPhase('idle');
      }
    };
  }, [
    fromCollabShare,
    targetCollabWorkId,
    collabShareLibraryKey,
    user?.id,
    setCollabShareState,
    setCollaborationState,
    setPendingJoinWorkId,
  ]);
}

/** 从引擎读当前图纸名并同步到会话（引擎未就绪会抛错，静默忽略）。 */
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
