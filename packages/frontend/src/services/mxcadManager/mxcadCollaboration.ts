import { t } from '@/languages';
import { MxCpp } from 'mxcad';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { APP_COOPERATE_URL } from '@/constants/appConfig';
import {
  globalShowConfirm,
  globalShowThreeButtonConfirm,
} from '@/utils/notificationEvents';
import { getModified, setModified } from '../drawingSession';
import { refreshFileName } from './mxcadHelpers';

export function getCooperate() {
  const mxCAD = MxCpp.getCurrentMxCAD();
  if (!mxCAD) return null;
  const cooperate = mxCAD.getCooperate();
  if (!cooperate) return null;
  cooperate.init({ server_addres: APP_COOPERATE_URL });
  return cooperate;
}

/** 退出协同后的守卫窗：3s 内阻止 auto-join 把刚退出的 session 拉回 */
const EXIT_GUARD_WINDOW_MS = 3000;
/** joining 窗口内等待引擎回调落定的上限（超时后仍尝试退出，兜底引擎永不回调） */
const JOIN_SETTLE_TIMEOUT_MS = 10_000;

export interface ExitCollaborationResult {
  /** exitWork 是否真正执行且成功（ret === 0） */
  exited: boolean;
  /** 是否经过「等待 in-flight join 落定」路径 */
  wasPending: boolean;
  /** 退出失败时的引擎错误码 */
  exitCode?: number;
}

/**
 * 执行 exitWork 并收尾（同步，唯一执行点）：
 * 成功 → 清协同状态 + 置位 exitGuard（3s 窗）+ 刷新文件名。
 * 任何异常吞掉，不向调用方逃逸。
 */
function performExitWorkSync(): ExitCollaborationResult {
  try {
    const cooperate = getCooperate();
    if (!cooperate) return { exited: false, wasPending: false };

    const ret = cooperate.exitWork();
    if (ret === 0) {
      const store = useCADEditorStore.getState();
      store.setCollaborationState({ isInCollaboration: false, workId: null });
      store.setCollabExitGuard(true);
      setTimeout(() => {
        useCADEditorStore.getState().setCollabExitGuard(false);
      }, EXIT_GUARD_WINDOW_MS);
      refreshFileName();
      return { exited: true, wasPending: false };
    }
    return { exited: false, wasPending: false, exitCode: ret };
  } catch {
    return { exited: false, wasPending: false };
  }
}

/**
 * 等待 in-flight 的 join/create 落定（引擎回调把 collabPhase 置为
 * joined/idle）。轮询 store，超时兜底返回 false（调用方仍尝试退出）。
 */
function waitForJoinSettle(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (useCADEditorStore.getState().collabPhase !== 'joining') {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * 协同退出唯一命令（C5 状态机）：
 * - idle → 不调 exitWork，直接返回
 * - joining → 等 in-flight join 落定再决策（落定到 joined 则继续退出，
 *   落定到 idle 则无需退出；超时兜底仍尝试退出）
 * - joined → exitWork + 状态收尾 + exitGuard 置位
 *
 * 历史缺陷：11 条退出路径各写一遍，`isInCollaboration` 布尔表达不了
 * 「加入在途」——窗口期内导航离开时引擎 session 已开但 store 说未加入，
 * 全链路无一次 exitWork（会话泄漏）。现在所有路径收敛到本命令。
 */
export async function exitCollaboration(): Promise<ExitCollaborationResult> {
  let wasPending = false;
  if (useCADEditorStore.getState().collabPhase === 'joining') {
    wasPending = true;
    await waitForJoinSettle(JOIN_SETTLE_TIMEOUT_MS);
  }
  if (useCADEditorStore.getState().collabPhase === 'idle') {
    return { exited: false, wasPending };
  }
  const result = performExitWorkSync();
  return { ...result, wasPending };
}

/**
 * 同步尽力版（beforeunload / hideEditor 等无法 await 的上下文）：
 * idle → 不动作；joined → 立即 exitWork；joining → 尽力 exitWork
 * （引擎尚未真正加入时是 no-op，回调落定后若真加入了由回调侧兜底清理）。
 */
export function exitCurrentCollaboration(): boolean {
  if (useCADEditorStore.getState().collabPhase === 'idle') return true;
  return performExitWorkSync().exited;
}

export function exitCollaborationIfNeeded(): void {
  try {
    exitCurrentCollaboration();
  } catch {
    // exitCurrentCollaboration 内部已吞错，这里兜底防止同步异常逃逸
  }
}

export async function confirmExitCollaborationIfNeeded(): Promise<boolean> {
  if (useCADEditorStore.getState().collabPhase === 'idle') return true;
  const shouldExit = await globalShowConfirm({
    title: t('退出协同'),
    message: t(
      '当前正在协同编辑中，离开页面或打开新文件将退出当前协同，是否继续？'
    ),
    confirmText: t('继续'),
    cancelText: t('取消'),
    type: 'warning',
  });
  if (!shouldExit) return false;
  await exitCollaboration();
  return true;
}

export function showUnsavedChangesDialog(): Promise<
  'save' | 'discard' | 'cancel'
> {
  return globalShowThreeButtonConfirm({
    title: t('未保存的更改'),
    message: t('当前图纸有未保存的更改，是否保存？'),
    confirmText: t('保存'),
    discardText: t('不保存'),
    cancelText: t('取消'),
    dialogType: 'warning',
  }).then((value) => {
    if (value === 'confirm') return 'save';
    if (value === 'discard') return 'discard';
    return 'cancel';
  });
}

export async function checkAndConfirmUnsavedChanges(): Promise<boolean> {
  if (!getModified()) return true;
  const choice = await showUnsavedChangesDialog();
  if (choice === 'cancel') return false;
  if (choice === 'save') {
    try {
      const { MxFun } = await import('mxdraw');
      MxFun.sendStringToExecute('Mx_Save');
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (getModified()) return false;
    } catch (error) {
      const { handleError } = await import('@/utils/errorHandler');
      handleError(error, 'mxcadManager: checkAndConfirmUnsavedChanges');
      return false;
    }
  }
  if (choice === 'discard') setModified(false);
  return true;
}
