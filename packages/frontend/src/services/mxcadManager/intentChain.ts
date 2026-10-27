/**
 * 意图链 —— PC 端 adapter（ADR-0081）。
 *
 * 判定与持久化语义在 `@cloudcad/platform` 的 intentChain（两端共用）；这里只放
 * 必须绑端的副作用：sessionStorage 介质、登录闸门事件、引擎命令分发、会话回填。
 *
 * 覆盖的场景：所有被前置阻塞的编辑器操作（链定义统一声明在本文件）——
 * - 分享（Mx_Share）：未登录 → 登录闸门；已登录但无云端节点 → 确认并保存到云端
 * - 另存为（Mx_SaveAsToCloud）/ 保存（Mx_Save）：未登录 → 登录闸门
 * - 导出下载（VIP_EXPORT_COMMANDS 同源清单）：未登录 → 登录闸门；已登录但会员
 *   闸门未过 → 购买引导
 * 前置满足后按序续跑并执行原始动作（与菜单点击同路：CommandRegistry 有实现走
 * 注册表，否则引擎原生命令直接发引擎）。
 *
 * 续跑锚点：`document-loaded`（登录翻转由 useFileOpenGuard 保证文档加载完才续跑）
 * + 导出闸门翻转（充值成功 / 开放免费导出，见 useFileOpenGuard 的 exportAllowed
 * effect）。本模块不自己等引擎。
 */
import { MxFun, store } from 'mxdraw';
import {
  clearPendingIntent,
  firstBlockedPrecondition,
  hasPendingIntent,
  readPendingIntent,
  startPendingIntent,
  type IntentDef,
  type IntentFacts,
  type IntentStorage,
} from '@cloudcad/platform';
import { CAD_EVENTS } from '@/constants/events';
import { t } from '@/languages';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { isAuthenticated } from '@/utils/authCheck';
import { handleError } from '@/utils/errorHandler';
import { globalShowConfirm } from '@/utils/notificationEvents';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import { handleVipFeatureRequiredError } from '@/utils/vipFeatureGuide';
import type { SaveRequiredKind } from '../drawingSession';
import { emit, patchSession, patchSessionFlags } from '../drawingSession';
import { buildCommandContext } from './cmd/rebindMxCommands';
import { CommandRegistry } from './cmd/types';
import { VIP_EXPORT_COMMANDS } from './applyVipExportIcons';
import { isExportDownloadAllowed } from './exportGate';

/** 分享意图链定义：声明「分享需要哪些前置、在哪个锚点续跑」。 */
export const SHARE_CHAIN: IntentDef = {
  id: 'share-current-drawing',
  action: { type: 'Mx_Share' },
  preconditions: ['auth', 'cloud-existence'],
  resumeAfter: 'document-loaded',
};

/** 另存为意图链：未登录时挂起，登录成功后自动续跑打开另存为对话框。 */
export const SAVE_AS_CHAIN: IntentDef = {
  id: 'save-as-to-cloud',
  action: { type: 'Mx_SaveAsToCloud' },
  preconditions: ['auth'],
  resumeAfter: 'document-loaded',
};

/** 保存意图链：未登录时挂起，登录成功后自动续跑执行保存。 */
export const SAVE_CHAIN: IntentDef = {
  id: 'save-to-cloud',
  action: { type: 'Mx_Save' },
  preconditions: ['auth'],
  resumeAfter: 'document-loaded',
};

/**
 * VIP 导出下载链：按引擎命令名建索引，从 VIP_EXPORT_COMMANDS 派生
 * （与命令前置门控同源，新增门控命令自动获得意图链）。
 */
export const VIP_EXPORT_CHAINS: Record<string, IntentDef> = Object.fromEntries(
  VIP_EXPORT_COMMANDS.map(
    (command): [string, IntentDef] => [
      command,
      {
        id: `vip-${command}`,
        action: { type: command },
        preconditions: ['auth', 'vip'],
        resumeAfter: 'document-loaded',
      },
    ]
  )
);

/** sessionStorage 端口：平台层不读全局存储，介质在端侧注入。 */
const sessionIntentStorage: IntentStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

/**
 * 前置事实：云端节点以当前会话的 fileId 为准；`isVip` 槽位按导出闸门口径填充
 * （会员 ∨ 开放免费导出，与 vipCommandGuard 同源）——闸门放行时命令直接执行、
 * 不会挂链，未放行时才需要判定。
 */
export function intentFacts(): IntentFacts {
  return {
    authenticated: isAuthenticated() && !isAccessTokenExpired(),
    hasCloudNode: Boolean(useCADEditorStore.getState().currentFileId),
    isVip: isExportDownloadAllowed(),
  };
}

export function hasIntentChain(): boolean {
  return hasPendingIntent(sessionIntentStorage);
}

export function clearIntentChain(): void {
  clearPendingIntent(sessionIntentStorage);
}

/** 登录闸门展示文案按链身份取（SaveRequiredKind）。 */
function loginKindFor(def: IntentDef): SaveRequiredKind {
  if (def.id === SHARE_CHAIN.id) return 'share';
  if (def.id === SAVE_AS_CHAIN.id) return 'saveAs';
  if (def.id === SAVE_CHAIN.id) return 'save';
  return 'export';
}

/** `beginIntent` 的结论：调用方据此映射 CommandResult / UI 状态。 */
export type IntentStart =
  | 'auth-blocked'
  | 'cloud-save-pending'
  | 'vip-blocked'
  | 'cancelled';

/**
 * 挂起意图链并决定下一步。
 *
 * - `auth-blocked`：未登录，已请求登录闸门；登录成功后由 `resumeIntent` 续跑
 * - `cloud-save-pending`：已登录但无云端节点，已触发保存到云端；成功由
 *   `signalShareChainCloudNodeCreated` 回报后执行原始分享
 * - `vip-blocked`：已登录但会员闸门未过，已弹购买引导；闸门放行（充值成功 /
 *   开放免费导出）后由 `resumeIntent` 续跑
 * - `cancelled`：用户拒绝了确认框，或前置已满足（链已清除）
 */
export async function beginIntent(def: IntentDef): Promise<IntentStart> {
  startPendingIntent(sessionIntentStorage, def);

  const blocked = firstBlockedPrecondition(def, intentFacts());

  if (blocked === 'auth') {
    // SAVE_REQUIRED 是「需要登录」的既有总线；kind 让闸门文案对应用户动作
    emit(CAD_EVENTS.SAVE_REQUIRED, { kind: loginKindFor(def) });
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

  if (blocked === 'vip') {
    void settleVipBlocked();
    return 'vip-blocked';
  }

  // 前置已满足时 beginIntent 不该被调用（调用方应先直接执行）；清链保持
  // 「返回 cancelled ⇒ 无挂起链」不变式
  clearPendingIntent(sessionIntentStorage);
  return 'cancelled';
}

/**
 * 会员缺口处置：弹购买引导；用户取消则清链（放弃本次意图，与分享链取消语义
 * 同构，避免后续每次锚点续跑都重新弹引导）。
 */
async function settleVipBlocked(): Promise<void> {
  const confirmed = await handleVipFeatureRequiredError(
    undefined,
    t('导出下载为会员专属功能，开通 VIP 后即可使用')
  );
  if (!confirmed) clearPendingIntent(sessionIntentStorage);
}

let chainResumeInFlight = false;

/** 链正在执行原始动作期间为 true：防止动作再次落进无云端节点分支形成确认循环。 */
export function isChainResumeInFlight(): boolean {
  return chainResumeInFlight;
}

/**
 * 续跑挂起的意图链。幂等：无链直接返回。
 *
 * 前置仍被阻塞时**不自动重试**（D5）——登录缺口交回闸门，云端缺口交回保存到云端，
 * 会员缺口交回购买引导，由用户下一次动作重新推进。
 */
export function resumeIntent(): void {
  const def = readPendingIntent(sessionIntentStorage);
  if (!def) return;

  const blocked = firstBlockedPrecondition(def, intentFacts());

  if (blocked === 'auth') {
    emit(CAD_EVENTS.SAVE_REQUIRED, { kind: loginKindFor(def) });
    return;
  }
  if (blocked === 'cloud-existence') {
    dispatchCommand('Mx_SaveToCloud');
    return;
  }
  if (blocked === 'vip') {
    void settleVipBlocked();
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
      if (CommandRegistry.has(def.action.type)) {
        await CommandRegistry.execute(
          def.action.type,
          await buildCommandContext()
        );
      } else {
        // 引擎原生命令（showDWGCutDialog / Mx_PrintDialog 等）：与菜单点击同路
        // 直发引擎（经 VIP 闸门补丁，此刻闸门已放行）
        const mxf = store?.state?.MxFun ?? MxFun;
        mxf?.sendStringToExecute?.(def.action.type);
      }
    } catch (error) {
      handleError(error, `intentChain: ${def.action.type}`);
    } finally {
      chainResumeInFlight = false;
    }
  })();
}
