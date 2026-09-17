import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../../drawingSession';
import { handleError } from '@/utils/errorHandler';
import { hideGlobalLoading } from '@/services/loadingService';
import { globalShowToast } from '@/utils/notificationEvents';
import { isAuthenticated } from '@/utils/authCheck';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import {
  getPersonalSpaceId,
  showSaveAsDialog,
} from '../mxcadHelpers';
// 显式导入门面文件 mxcadManager.ts（文件优先于目录 index.ts；index 会 import cmd/ 成环）。
// 门面静态链（instanceManager→openFlow 等）不 import cmd/，无循环。
import { mxcadManager } from '../mxcadManager';
import type { Command, CommandContext, CommandResult } from './types';

export class SaveCommand implements Command {
  readonly name = 'Mx_Save';

  async execute(ctx: CommandContext): Promise<CommandResult> {
    try {
      if (!isAuthenticated() || isAccessTokenExpired()) {
        emit(CAD_EVENTS.SAVE_REQUIRED, { action: t('保存文件') });
        return { success: false, error: 'unauthorized' };
      }

      // 新图纸打开中：会话仍持上一张图纸的 fileInfo，此时保存会把引擎当前
      // 内容写到旧节点（或保存旧图纸），必须拒绝
      if (mxcadManager.hasPendingOpen()) {
        globalShowToast(t('图纸正在打开，请稍后再保存'), 'warning');
        return { success: false, error: 'file-opening' };
      }

      const fileInfo = ctx.fileInfo;
      if (!fileInfo) {
        let personalSpaceId: string | null = null;
        try {
          personalSpaceId = await getPersonalSpaceId();
        } catch {
          // ignore
        }
        await showSaveAsDialog(personalSpaceId, 'untitled');
        return { success: true };
      }

      const outcome = await ctx.saveFile(fileInfo);
      if (outcome.status === 'failed' || outcome.status === 'denied') {
        return { success: false, error: outcome.error };
      }
      return { success: true };
    } catch (error) {
      handleError(error, 'mxcadManager: Mx_Save');
      hideGlobalLoading();
      const errorMessage =
        error instanceof Error ? error.message : t('保存失败，请稍后重试');
      globalShowToast(errorMessage, 'error');
      return { success: false, error: String(error) };
    }
  }
}
