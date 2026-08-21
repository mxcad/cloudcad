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

export function exitCurrentCollaboration(): boolean {
  const { isInCollaboration } = useCADEditorStore.getState();
  if (!isInCollaboration) return true;

  try {
    const cooperate = getCooperate();
    if (!cooperate) return false;

    const ret = cooperate.exitWork();
    if (ret === 0) {
      useCADEditorStore.getState().setCollaborationState({
        isInCollaboration: false,
        workId: null,
      });
      refreshFileName();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function exitCollaborationIfNeeded(): void {
  try {
    exitCurrentCollaboration();
  } catch {
    // exitCurrentCollaboration 内部已吞错，这里兜底防止同步异常逃逸
  }
}

export async function confirmExitCollaborationIfNeeded(): Promise<boolean> {
  const { isInCollaboration } = useCADEditorStore.getState();
  if (!isInCollaboration) return true;
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
  exitCurrentCollaboration();
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
