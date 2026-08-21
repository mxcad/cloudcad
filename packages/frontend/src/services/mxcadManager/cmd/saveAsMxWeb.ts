import { handleError } from '@/utils/errorHandler';
import { saveAsFileDialog } from 'mxcad';
import { t } from '@/languages';
import { hideGlobalLoading } from '@/services/loadingService';
import { globalShowToast } from '@/utils/notificationEvents';
import type { Command, CommandContext, CommandResult } from './types';

export class SaveAsMxWebCommand implements Command {
  readonly name = 'Mx_SaveAsMxWeb';

  async execute(ctx: CommandContext): Promise<CommandResult> {
    try {
      const { blob, filename } = await ctx.saveDrawingToBlob(ctx.fileName);
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      const saveResult = await saveAsFileDialog({
        blob,
        filename: `${nameWithoutExt}.mxweb`,
        types: [
          {
            description: t('MXWEB 文件'),
            accept: { 'application/octet-stream': ['.mxweb'] },
          },
        ],
      });
      hideGlobalLoading();
      if (saveResult !== false) {
        globalShowToast(t('文件已保存到本地'), 'success');
      }
      return { success: true };
    } catch (error) {
      hideGlobalLoading();
      handleError(error, 'Mx_SaveAsMxWeb');
      return { success: false, error: String(error) };
    }
  }
}
