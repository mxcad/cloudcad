import { MxCpp } from 'mxcad';
import { showToast, showConfirmDialog } from 'vant';
import { parseWorkData, type Work } from '@cloudcad/platform';
import { t } from '@/languages';
import { useEditorStore } from '../stores/editor';

const APP_COOPERATE_URL = import.meta.env.VITE_APP_COOPERATE_URL || '/api/cooperate';

// 协同 wire 协议（types + 编解码）已收敛到 @cloudcad/platform（collaboration/wire.ts），
// 本文件只保留 MxCpp/vant 胶水。

// --- Concurrent guards ---
export const exitGuardRef = { current: false };
let cooperateInit = false;

export function getCooperate() {
  try {
    const mxCAD = MxCpp.getCurrentMxCAD();
    if (!mxCAD) return null;
    const cooperate = mxCAD.getCooperate();
    if (!cooperate) return null;
    if (!cooperateInit) {
      cooperate.init({ server_addres: APP_COOPERATE_URL });
      cooperateInit = true;
    }
    return cooperate;
  } catch {
    return null;
  }
}

export function exitCollaborationIfNeeded(): void {
  try {
    const cooperate = getCooperate();
    if (!cooperate) return;
    const ret = cooperate.exitWork();
    if (ret === 0) {
      useEditorStore().setCollaborationState({ isInCollaboration: false, workId: null });
    }
  } catch {
    // ignore
  }
}

/**
 * 离开编辑器/打开新图纸前的协同退出确认（对齐 PC confirmExitCollaborationIfNeeded）。
 *
 * 移动端原先只静默 exitWork，用户不知道「打开另一张图 = 退出当前协同会话」。
 * 不在协同中时直接放行，返回 false 表示调用方必须中止后续打开动作。
 */
export async function confirmExitCollaborationIfNeeded(): Promise<boolean> {
  if (!useEditorStore().state.isInCollaboration) return true;
  let confirmed = false;
  try {
    await showConfirmDialog({
      title: t('退出协同'),
      message: t('当前正在协同编辑中，离开页面或打开新文件将退出当前协同，是否继续？'),
      confirmButtonText: t('继续'),
      cancelButtonText: t('取消'),
      zIndex: 2100,
    } as any);
    confirmed = true;
  } catch {
    return false;
  }
  exitCollaborationIfNeeded();
  return confirmed;
}

/**
 * 加入/创建协同后从服务端 work_data 反查并补齐编辑器会话身份
 * （fileId / projectId / fileName / libraryKey）。
 *
 * 原先在 stores/collab.ts 与 useCollabAutoJoin.ts 各有一份逐字重复实现，
 * 收敛为唯一出口，避免两条入口再次分叉。
 */
export function syncSessionFromWorkData(workId: number): void {
  const cooperate = getCooperate();
  if (!cooperate) return;
  const editorStore = useEditorStore();
  cooperate.getWorks((workList: Work[]) => {
    const joined = workList.find((w) => w.work_id === workId);
    if (!joined) return;
    const data = parseWorkData(joined.work_data);
    if (!data || data.v !== 3) return;
    if (data.drawingId) editorStore.setFileId(data.drawingId);
    if (data.projectId) editorStore.setProjectId(data.projectId);
    if (data.drawingName) editorStore.setFileName(data.drawingName);
    if (data.libraryKey) editorStore.setLibraryKey(data.libraryKey);
  });
}
