import { t } from '@/languages';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import {
  getPersonalSpaceId,
  showSaveAsDialog,
  triggerSaveAs,
} from './mxcadHelpers';
import { saveLibraryFile, saveToNodeFile } from './saveSequences';
import { createDefaultSaveDeps } from './saveDefaults';
import type { CurrentFileInfo } from './mxcadTypes';
import type { SaveFileDeps, SaveFileOutcome } from './saveTypes';

export type { SaveMxwebParams } from './mxcadTypes';
export type {
  SaveNodeInfo,
  SaveSdkHandles,
  SavePermissionQuerier,
  SaveFileDeps,
  SaveFileOutcome,
  SaveFileFn,
  SaveMxwebToNodeParams,
} from './saveTypes';
export { saveMxwebToNode } from './saveSequences';
export { showSaveConfirmDialog } from './saveDialogs';
export {
  createDefaultSaveSdk,
  createDefaultPermissionQuerier,
  createDefaultSaveDeps,
} from './saveDefaults';

/**
 * 保存流深模块（T1）
 *
 * 单入口 saveCurrentFile(fileInfo) 判别联合（node / library / saveAs 目标），
 * 内部隐藏 blob→hash→upload→SDK save 序列（见 saveSequences）与「无权限→
 * 另存为分支」「已删除」「库权限」决策。Mx_Save / Mx_SaveAsToCloud / 另存为
 * 三个入口共享本服务。
 *
 * 依赖经 SaveFileDeps 注入（SDK 句柄 + 权限查询器），默认实现见
 * createDefaultSaveSdk / createDefaultPermissionQuerier（保留原 localStorage
 * 权限解析，permissionUtils 收编在 T2 范围外）。
 */

/**
 * 单入口：判别联合（node / library / saveAs）决策保存目标。
 *
 * - 已删除标记 → 另存为（triggerSaveAs，内部含项目图纸 CAD_SAVE 门控）
 * - 我的图纸（parentId === personalSpaceId）→ node 保存
 * - 资源库文件 → 库权限（LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE）→ library 保存或另存为
 * - 项目文件 → 项目 CAD_SAVE 权限 → node 保存；无权限（含查询失败）→ 拒绝，
 *   不允许另存为
 * - 无 projectId 的图纸（公开分享 / 本地打开）→ 直接另存为
 */
export async function saveCurrentFile(
  fileInfo: CurrentFileInfo,
  deps: SaveFileDeps = createDefaultSaveDeps()
): Promise<SaveFileOutcome> {
  if (useCADEditorStore.getState().isCurrentFileDeleted) {
    globalShowToast(t('当前图纸已被删除，保存将另存为新文件'), 'warning');
    const opened = await triggerSaveAs();
    return opened
      ? { status: 'saveAs' }
      : { status: 'denied', error: t('您没有保存图纸的权限') };
  }

  let personalSpaceId: string | null = null;
  try {
    personalSpaceId = await getPersonalSpaceId();
  } catch {
    // ignore
  }

  const isMyDrawing = personalSpaceId && fileInfo.parentId === personalSpaceId;
  const isLibraryFile = !!fileInfo.libraryKey;

  if (isMyDrawing) {
    return saveToNodeFile(fileInfo, personalSpaceId, deps);
  }

  if (isLibraryFile) {
    try {
      if (await deps.permissions.hasLibraryPermission()) {
        return saveLibraryFile(fileInfo, deps);
      }
      globalShowToast(
        t('当前图纸没有保存权限，已为您打开另存为窗口'),
        'warning'
      );
    } catch (error) {
      handleError(error, 'mxcadManager: Mx_Save library permission check');
    }
    await showSaveAsDialog(personalSpaceId, fileInfo.name || 'untitled');
    return { status: 'saveAs' };
  }

  if (fileInfo.projectId) {
    try {
      if (
        await deps.permissions.hasProjectPermission(
          fileInfo.projectId,
          'CAD_SAVE'
        )
      ) {
        return saveToNodeFile(fileInfo, personalSpaceId, deps);
      }
      // 项目图纸无 CAD_SAVE = 无另存为权限：拒绝保存，不打开另存为窗口
      globalShowToast(t('您没有保存图纸的权限'), 'warning');
      return { status: 'denied', error: t('您没有保存图纸的权限') };
    } catch (error) {
      // 权限查询失败按无权限处理（fail-closed），同样不打开另存为窗口
      handleError(error, 'mxcadManager: Mx_Save project permission check');
      globalShowToast(t('权限检查失败，请稍后重试'), 'warning');
      return { status: 'denied', error: t('权限检查失败，请稍后重试') };
    }
  }

  // 无 projectId 的图纸（公开分享图纸 / 本地打开图纸）→ 直接另存为
  await showSaveAsDialog(personalSpaceId, fileInfo.name || 'untitled');
  return { status: 'saveAs' };
}
