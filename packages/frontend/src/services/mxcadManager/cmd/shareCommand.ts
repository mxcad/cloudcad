import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../../drawingSession';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { useCADEditorStore } from '../../../stores/useCADEditorStore';
import type { Command, CommandContext, CommandResult } from './types';

export class ShareCommand implements Command {
  readonly name = 'Mx_Share';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    try {
      const { currentFileId, currentFileName } = useCADEditorStore.getState();

      if (!currentFileId) {
        globalShowToast(t('请先保存图纸到云端后再分享'), 'warning');
        return { success: false, error: 'no-file-id' };
      }

      emit(CAD_EVENTS.SHARE_FILE, {
        fileId: currentFileId,
        fileName: currentFileName || 'untitled',
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'mxcadManager: Mx_Share');
      const errorMessage =
        error instanceof Error ? error.message : t('分享失败，请稍后重试');
      globalShowToast(errorMessage, 'error');
      return { success: false, error: String(error) };
    }
  }
}
