/**
 * 意图链 —— PC 端 adapter（ADR-0081）。
 *
 * 判定与持久化语义在 `@cloudcad/platform` 的 intentChain（两端共用）；这里只放
 * 必须绑端的副作用：sessionStorage 介质、登录闸门事件、引擎命令分发、会话回填。
 *
 * 覆盖的场景：无云端节点的图纸点「分享」。挂起意图后按前置顺序决定下一步——
 * 未登录走登录闸门（回来自动续跑）；已登录但无云端节点弹确认、确认后触发
 * 保存到云端。另存为成功把新节点回填进会话（D6），链继续执行原始分享动作。
 *
 * 续跑锚点是 `document-loaded`：调用方（useFileOpenGuard）保证当前文档已真正
 * 加载完才调 `resumeShareChain`，本模块不自己等引擎。
 */
import {
  clearPendingIntent,
  firstBlockedPrecondition,
  hasPendingIntent,
  readPendingIntent,
  startPendingIntent,
  type IntentDef,
  type IntentStorage,
} from '@cloudcad/platform';
import { CAD_EVENTS } from '@/constants/events';
import { t } from '@/languages';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { isAuthenticated } from '@/utils/authCheck';
import { handleError } from '@/utils/errorHandler';
import { globalShowConfirm } from '@/utils/notificationEvents';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import { emit, patchSession, patchSessionFlags } from '../drawingSession';
import { buildCommandContext } from './cmd/rebindMxCommands';
import { CommandRegistry } from './cmd/types';

/** 分享意图链定义：唯一一处声明「分享需要哪些前置、在哪个锚点续跑」。 */
export const SHARE_CHAIN: IntentDef = {
  id: 'share-current-drawing',
  action: { type: 'Mx_Share' },
  preconditions: ['auth', 'cloud-existence'],
  resumeAfter: 'document-loaded',
};

/** sessionStorage 端口：平台层不读全局存储，介质在端侧注入。 */
const sessionIntentStorage: IntentStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

/** 前置事实：云端节点以当前会话的 fileId 为准。 */
export function shareChainFacts(): {
  authenticated: boolean;
  hasCloudNode: boolean;
} {
  return {
    authenticated: isAuthenticated() && !isAccessTokenExpired(),
    hasCloudNode: Boolean(useCADEditorStore.getState().currentFileId),
  };
}

export function hasShareChain(): boolean {
  return hasPendingIntent(sessionIntentStorage);
}

export function clearShareChain(): void {
  clearPendingIntent(sessionIntentStorage);
}

/** `beginShareChain` 的结论：调用方据此映射 CommandResult / UI 状态。 */
export type ShareChainStart =
  'auth-blocked' | 'cloud-save-pending' | 'cancelled';

/**
 * 挂起分享意图链并决定下一步。
 *
 * - `auth-blocked`：未登录，已请求登录闸门；登录成功后由 `resumeShareChain` 续跑
 * - `cloud-save-pending`：已登录但无云端节点，已触发保存到云端；成功由
 *   `signalShareChainCloudNodeCreated` 回报后执行原始分享
 * - `cancelled`：用户拒绝了确认框，链已清除
 */
export async function beginShareChain(): Promise<ShareChainStart> {
  startPendingIntent(sessionIntentStorage, SHARE_CHAIN);

  const { authenticated, hasCloudNode } = shareChainFacts();
  const blocked = firstBlockedPrecondition(
    SHARE_CHAIN,
    authenticated,
    hasCloudNode
  );

  if (blocked === 'auth') {
    // SAVE_REQUIRED 是「需要登录」的既有总线；kind=share 让闸门文案对应用户动作
    emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'share' });
    return 'auth-blocked';
  }

  if (blocked === 'cloud-existence') {
    const confirmed = await globalShowConfirm({
      title: t('保存到云端'),
      message: t('分享需要图纸先保存到云端，是否现在保存到云端并继续分享？'),
      confirmText: t('保存到云端并分享'),
      cancelText: t('取消'),
      type: 'info',
    });
    if (!confirmed) {
      clearPendingIntent(sessionIntentStorage);
      return 'cancelled';
    }
    dispatchCommand('Mx_SaveToCloud');
    return 'cloud-save-pending';
  }

  // 前置已满足时 beginShareChain 不该被调用（调用方应先直接分享）；清链保持
  // 「返回 cancelled ⇒ 无挂起链」不变式
  clearPendingIntent(sessionIntentStorage);
  return 'cancelled';
}

let chainResumeInFlight = false;

/** 链正在执行原始动作期间为 true：防止动作再次落进无云端节点分支形成确认循环。 */
export function isShareChainResumeInFlight(): boolean {
  return chainResumeInFlight;
}

/**
 * 续跑挂起的分享意图链。幂等：无链 / 非分享链直接返回。
 *
 * 前置仍被阻塞时**不自动重试**（D5）——登录缺口交回闸门，云端缺口交回保存到云端，
 * 由用户下一次动作重新推进。
 */
export function resumeShareChain(): void {
  const def = readPendingIntent(sessionIntentStorage);
  if (!def || def.id !== SHARE_CHAIN.id) return;

  const { authenticated, hasCloudNode } = shareChainFacts();
  const blocked = firstBlockedPrecondition(def, authenticated, hasCloudNode);

  if (blocked === 'auth') {
    emit(CAD_EVENTS.SAVE_REQUIRED, { kind: 'share' });
    return;
  }
  if (blocked === 'cloud-existence') {
    dispatchCommand('Mx_SaveToCloud');
    return;
  }

  clearPendingIntent(sessionIntentStorage);
  executeChainAction(def);
}

/**
 * 另存为成功后的链分支回报（D6）：把新节点回填进当前会话，再执行原始分享。
 *
 * 回填不需要重新打开文档——另存为上传的就是当前 blob，引擎内容与新节点已一致，
 * 这里只是修正会话指针。`personalSpaceId` 刻意不猜：result 只给 parentId，
 * 按 targetType 反推会误分类；代价是链上再点一次「保存」可能走另存为而非静默保存。
 *
 * 返回 true 表示链已消费本次另存为（调用方应跳过「打开新图纸」提示——编辑器
 * 已指向新节点，再问是多余点击）。
 */
export function signalShareChainCloudNodeCreated(result: {
  nodeId: string;
  fileName: string;
  projectId?: string;
  parentId: string;
  targetType?: 'personal' | 'project' | 'library';
  libraryType?: 'drawing' | 'block';
}): boolean {
  const def = readPendingIntent(sessionIntentStorage);
  if (!def || def.id !== SHARE_CHAIN.id || !result.nodeId) return false;

  // 资源库落点：projectId 是库节点而非项目，必须带 libraryKey，否则后续保存
  // 会按项目图纸去查 CAD_SAVE 权限，落进「无权限」分支被拒。
  const libraryKey =
    result.targetType === 'library' ? result.libraryType : undefined;

  patchSession({
    fileId: result.nodeId,
    parentId: result.parentId,
    projectId: libraryKey ? null : (result.projectId ?? null),
    name: result.fileName,
    ...(libraryKey ? { libraryKey } : {}),
  });
  patchSessionFlags({
    fileId: result.nodeId,
    fileName: result.fileName,
  });

  clearPendingIntent(sessionIntentStorage);
  executeChainAction(def);
  return true;
}

function dispatchCommand(name: string): void {
  void buildCommandContext()
    .then((ctx) => CommandRegistry.execute(name, ctx))
    .catch((error) => handleError(error, `intentChain: ${name}`));
}

function executeChainAction(def: IntentDef): void {
  chainResumeInFlight = true;
  void (async () => {
    try {
      await CommandRegistry.execute(
        def.action.type,
        await buildCommandContext()
      );
    } catch (error) {
      handleError(error, `intentChain: ${def.action.type}`);
    } finally {
      chainResumeInFlight = false;
    }
  })();
}
