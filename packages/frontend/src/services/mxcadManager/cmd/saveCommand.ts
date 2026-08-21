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
import type { Command, CommandContext, CommandResult } from './types';

export class SaveCommand implements Command {
  readonly name = 'Mx_Save';

  async execute(ctx: CommandContext): Promise<CommandResult> {
    try {
      if (!isAuthenticated() || isAccessTokenExpired()) {
        emit(CAD_EVENTS.SAVE_REQUIRED, { action: t('保存文件') });
        return { success: false, error: 'unauthorized' };
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
      if (outcome.status === 'failed') {
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
