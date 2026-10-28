import { t } from '@/languages';
import { MxCpp } from 'mxcad';
import { MxFun } from 'mxdraw';
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

// ==================== 引擎命令：加入/退出协同 ====================
//
// 铁律（与 __openWebFile__ 同一规则）：凡动图纸的操作（打开/加入协同/退出协同）
// 必须注册为引擎命令并经 MxFun.sendStringToExecute 派发。引擎命令状态机执行新命令
// 前会先停掉在途绘图命令（stopCmd(kNewCommadIn)）；若在 React 层裸调 SDK，
// 「一边画线、一边加入协同」会并发执行，破坏引擎状态（内存溢出/意外崩溃）。
// 参数按引用传递（同一 JS 上下文），回调函数可直接作为参数传入
// （与 __openWebFile__ 的 retCall 同模式）。
// 测试环境把 mxdraw 别名到空模块（MxFun 为 undefined）：注册跳过，
// 派发侧对应短路，模块加载不受影响。

if (typeof MxFun?.addCommand === 'function') {
  MxFun.addCommand(
    '__joinCollabWork__',
    (args: [number, (iRet: number) => void, string, string]) => {
      const mxcad = MxCpp.getCurrentMxCAD();
      const cooperate = mxcad?.getCooperate();
      if (!cooperate) {
        args[1]?.(-1);
        return;
      }
      cooperate.init({ server_addres: APP_COOPERATE_URL });
      cooperate.joinWork(args[0], args[1], args[2], args[3]);
    }
  );

  MxFun.addCommand(
    '__exitCollabWork__',
    (args: [(ret: number) => void]) => {
      const mxcad = MxCpp.getCurrentMxCAD();
      const cooperate = mxcad?.getCooperate();
      if (!cooperate) {
        args[0]?.(-1);
        return;
      }
      cooperate.init({ server_addres: APP_COOPERATE_URL });
      args[0]?.(cooperate.exitWork());
    }
  );

  MxFun.addCommand(
    '__createCollabWork__',
    (args: [(workid: number) => void, string, string, string]) => {
      const mxcad = MxCpp.getCurrentMxCAD();
      const cooperate = mxcad?.getCooperate();
      if (!cooperate) {
        args[0]?.(-1);
        return;
      }
      cooperate.init({ server_addres: APP_COOPERATE_URL });
      cooperate.createWork(args[0], args[1], args[2], args[3]);
    }
  );
}

/**
 * 加入协同唯一入口：派发 __joinCollabWork__ 引擎命令（引擎命令状态机先停掉
 * 在途绘图命令再执行）。引擎未就绪 / 派发失败时返回 false（回调不会被调用，
 * 调用方须自行落定）。
 */
export function dispatchJoinWork(
  workId: number,
  onResult: (iRet: number) => void,
  userId: string,
  encodedUser: string
): boolean {
  if (!MxCpp.getCurrentMxCAD()) return false;
  if (typeof MxFun?.sendStringToExecute !== 'function') return false;
  try {
    return MxFun.sendStringToExecute('__joinCollabWork__', [
      workId,
      onResult,
      userId,
      encodedUser,
    ]);
  } catch {
    return false;
  }
}

/**
 * 创建协同唯一入口：派发 __createCollabWork__ 引擎命令（成功后引擎自动加入
 * 协同，无需再 joinWork）。引擎未就绪 / 派发失败时返回 false（回调不会被
 * 调用，调用方须自行落定）。
 */
export function dispatchCreateWork(
  onResult: (workid: number) => void,
  workData: string,
  userId: string,
  encodedUser: string
): boolean {
  if (!MxCpp.getCurrentMxCAD()) return false;
  if (typeof MxFun?.sendStringToExecute !== 'function') return false;
  try {
    return MxFun.sendStringToExecute('__createCollabWork__', [
      onResult,
      workData,
      userId,
      encodedUser,
    ]);
  } catch {
    return false;
  }
}

/**
 * 退出协同唯一入口（同步）：__exitCollabWork__ 引擎命令同步执行 exitWork，
 * 回调同步落定。返回引擎错误码；-1 = 引擎/协同对象不可用或派发失败。
 */
export function dispatchExitWork(): number {
  if (!MxCpp.getCurrentMxCAD()) return -1;
  if (typeof MxFun?.sendStringToExecute !== 'function') return -1;
  let ret = -1;
  try {
    MxFun.sendStringToExecute('__exitCollabWork__', [(r: number) => {
      ret = r;
    }]);
  } catch {
    return -1;
  }
  return ret;
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

    // 经 __exitCollabWork__ 引擎命令执行：先停掉在途绘图命令再 exitWork
    const ret = dispatchExitWork();
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
