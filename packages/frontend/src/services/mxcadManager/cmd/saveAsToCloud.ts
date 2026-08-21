import { isAuthenticated } from '@/utils/authCheck';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import { cancelLoginRedirect } from '@/config/clientSetup';
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../../drawingSession';
import { t } from '@/languages';
import { triggerSaveAs } from '../mxcadHelpers';
import type { Command, CommandContext, CommandResult } from './types';

export class SaveAsToCloudCommand implements Command {
  readonly name = 'Mx_SaveAsToCloud';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    if (!isAuthenticated() || isAccessTokenExpired()) {
      cancelLoginRedirect();
      emit(CAD_EVENTS.SAVE_REQUIRED, { action: t('保存文件') });
      return { success: false, error: 'unauthorized' };
    }
    await triggerSaveAs();
    return { success: true };
  }
}
