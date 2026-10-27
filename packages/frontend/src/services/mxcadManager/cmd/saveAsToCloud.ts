import { isAuthenticated } from '@/utils/authCheck';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import { cancelLoginRedirect } from '@/config/clientSetup';
import { SAVE_AS_CHAIN, beginIntent } from '../intentChain';
import { triggerSaveAs } from '../mxcadHelpers';
import type { Command, CommandContext, CommandResult } from './types';

export class SaveAsToCloudCommand implements Command {
  readonly name = 'Mx_SaveAsToCloud';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    if (!isAuthenticated() || isAccessTokenExpired()) {
      cancelLoginRedirect();
      // 挂起另存为意图链（ADR-0081）：登录成功后自动续跑打开另存为对话框，
      // 用户原始意图不丢失（此前只弹登录提示，回来后意图即丢）
      void beginIntent(SAVE_AS_CHAIN);
      return { success: false, error: 'unauthorized' };
    }
    await triggerSaveAs();
    return { success: true };
  }
}
