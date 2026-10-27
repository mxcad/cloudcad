/**
 * 意图链 —— 移动端 adapter（ADR-0081）。
 *
 * 判定与持久化语义在 `@cloudcad/platform` 的 intentChain（两端共用）；这里只放
 * 必须绑端的副作用：sessionStorage 介质、登录提示、购买引导、页面 watch 的触发器。
 *
 * 覆盖的场景：所有被前置阻塞的编辑器操作（链定义统一声明在本文件）——
 * - 保存 / 另存为 / 版本历史：未登录 → 登录提示
 * - 分享：未登录 → 登录提示；已登录但无云端节点 → 确认「先保存到云端并分享」
 * - 导出下载：未登录 → 登录提示；已登录但会员闸门未过 → 购买引导（跳会员中心）
 *
 * 续跑锚点（页面 watch 后调 resumeIntent）：
 * - `document-loaded`：登录翻转（watch isAuthenticated）/ 文档打开完成
 * - 导出闸门翻转：充值成功（syncUserMembership → useUser 刷新）或管理员开放
 *   免费导出（运行时配置刷新）→ 页面 exportAllowed watch
 * 本模块不执行动作：resumeIntent 置 `resumeAction` 触发器，由页面按 type 分派
 * 原始动作（各面板的 ref / 函数都在页面手里）。
 */
import { ref } from 'vue';
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
import router from '@/router';
import { t } from '@/languages';
import { showConfirmDialog } from 'vant';
import { useUser } from '@/composables/useUser';
import { getRuntimeConfigSnapshot } from '@/composables/useRuntimeConfig';
import { useEditorStore } from '@/stores/editor';
import { isExportDownloadAllowedFor } from './permissionService';
import type { DownloadFormatPayload } from '@/pages/shell/components/DownloadFormatPopup.vue';

/** 保存意图链：未登录时挂起，登录成功后自动续跑执行保存。 */
export const SAVE_CHAIN: IntentDef = {
  id: 'save-to-cloud',
  action: { type: 'save' },
  preconditions: ['auth'],
  resumeAfter: 'document-loaded',
};

/** 另存为意图链：未登录时挂起，登录成功后自动续跑打开另存为面板。 */
export const SAVE_AS_CHAIN: IntentDef = {
  id: 'save-as-to-cloud',
  action: { type: 'saveAs' },
  preconditions: ['auth'],
  resumeAfter: 'document-loaded',
};

/** 版本历史意图链：未登录时挂起，登录成功后自动续跑打开版本历史面板。 */
export const VERSION_HISTORY_CHAIN: IntentDef = {
  id: 'version-history',
  action: { type: 'version-history' },
  preconditions: ['auth'],
  resumeAfter: 'document-loaded',
};

/** 分享意图链：未登录 → 登录；已登录但无云端节点 → 先保存到云端再分享（对齐 PC SHARE_CHAIN）。 */
export const SHARE_CHAIN: IntentDef = {
  id: 'share-current-drawing',
  action: { type: 'share' },
  preconditions: ['auth', 'cloud-existence'],
  resumeAfter: 'document-loaded',
};

/**
 * 导出下载链：动作携带导出参数（格式 / PDF 宽高与色彩 / DWG 版本），
 * 续跑时按它重放原始导出。
 */
export function exportChainDef(payload: DownloadFormatPayload): IntentDef {
  return {
    id: 'export-download',
    action: { type: 'export', payload },
    preconditions: ['auth', 'vip'],
    resumeAfter: 'document-loaded',
  };
}

/** sessionStorage 端口：平台层不读全局存储，介质在端侧注入。 */
const sessionIntentStorage: IntentStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

/**
 * 前置事实：云端节点以当前会话的 fileId 为准；`isVip` 槽位按导出闸门口径填充
 * （会员 ∨ 开放免费导出，与 onExportFormatConfirm 的闸门同源）——闸门放行时动作
 * 直接执行、不会挂链，未放行时才需要判定。
 */
export function intentFacts(): IntentFacts {
  const { user, isAuthenticated } = useUser();
  return {
    authenticated: isAuthenticated.value,
    hasCloudNode: Boolean(useEditorStore().state.fileId),
    isVip: isExportDownloadAllowedFor(
      user.value,
      getRuntimeConfigSnapshot().freeExportDownloadEnabled,
    ),
  };
}

/** 触发器：有链挂起等登录提示（页面 watch 后展示 LoginPromptPopup）。 */
export const loginPromptRequired = ref<IntentDef | null>(null);
/** 触发器：有链等「先保存到云端并分享」确认（页面 watch 后弹确认框）。 */
export const cloudSaveConfirmRequired = ref<IntentDef | null>(null);
/** 触发器：链已续跑、该分派原始动作（页面 watch 后按 type 分派）。 */
export const resumeAction = ref<{
  type: string;
  payload?: DownloadFormatPayload;
} | null>(null);

export function hasIntentChain(): boolean {
  return hasPendingIntent(sessionIntentStorage);
}

export function clearIntentChain(): void {
  clearPendingIntent(sessionIntentStorage);
}

/** `beginIntent` 的结论：调用方据此映射 UI 状态。 */
export type IntentStart =
  | 'auth-blocked'
  | 'cloud-save-pending'
  | 'vip-blocked'
  | 'cancelled';

/**
 * 挂起意图链并决定下一步。
 *
 * - `auth-blocked`：未登录，已请求登录提示；登录成功后由 `resumeIntent` 续跑
 * - `cloud-save-pending`：已登录但无云端节点，页面弹「先保存到云端并分享」确认
 * - `vip-blocked`：已登录但会员闸门未过，已弹购买引导；闸门放行（充值成功 /
 *   开放免费导出）后由 `resumeIntent` 续跑
 * - `cancelled`：用户拒绝了确认框，或前置已满足（链已清除）
 */
export async function beginIntent(def: IntentDef): Promise<IntentStart> {
  startPendingIntent(sessionIntentStorage, def);

  const blocked = firstBlockedPrecondition(def, intentFacts());

  if (blocked === 'auth') {
    loginPromptRequired.value = def;
    return 'auth-blocked';
  }

  if (blocked === 'cloud-existence') {
    cloudSaveConfirmRequired.value = def;
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
 * 会员缺口处置：弹购买引导；确认跳会员中心充值——支付成功后 syncUserMembership
 * 刷新用户态，页面 exportAllowed 翻转，resumeIntent 续跑；取消则清链（放弃本次
 * 意图，与 PC 购买引导取消语义同构，避免后续每次锚点续跑都重新弹引导）。
 */
async function settleVipBlocked(): Promise<void> {
  try {
    await showConfirmDialog({
      title: t('需要购买VIP'),
      message: t('导出下载为会员专属功能，开通 VIP 后即可使用'),
      confirmButtonText: t('去购买'),
      cancelButtonText: t('取消'),
    });
  } catch {
    clearPendingIntent(sessionIntentStorage);
    return;
  }
  void router.push('/shell/member');
}

/**
 * 续跑挂起的意图链。幂等：无链直接返回。
 *
 * 前置仍被阻塞时**不自动重试**（D5）——登录缺口交回提示，云端缺口交回保存到
 * 云端确认，会员缺口交回购买引导，由用户下一次动作重新推进。
 */
export function resumeIntent(): void {
  const def = readPendingIntent(sessionIntentStorage);
  if (!def) return;

  const blocked = firstBlockedPrecondition(def, intentFacts());

  if (blocked === 'auth') {
    loginPromptRequired.value = def;
    return;
  }
  if (blocked === 'cloud-existence') {
    cloudSaveConfirmRequired.value = def;
    return;
  }
  if (blocked === 'vip') {
    void settleVipBlocked();
    return;
  }

  clearPendingIntent(sessionIntentStorage);
  const action = def.action as { type: string; payload?: DownloadFormatPayload };
  resumeAction.value = { type: action.type, payload: action.payload };
}
