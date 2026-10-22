import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../../drawingSession';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { useCADEditorStore } from '../../../stores/useCADEditorStore';
import { beginShareChain, isShareChainResumeInFlight } from '../intentChain';
import type { Command, CommandContext, CommandResult } from './types';

export class ShareCommand implements Command {
  readonly name = 'Mx_Share';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    try {
      const { currentFileId, currentFileName } = useCADEditorStore.getState();

      if (currentFileId) {
        emit(CAD_EVENTS.SHARE_FILE, {
          fileId: currentFileId,
          fileName: currentFileName || 'untitled',
        });
        return { success: true };
      }

      // 无云端节点：进意图链（ADR-0081）——挂起意图后按前置顺序决定下一步
      // （未登录走登录闸门、已登录弹确认再保存到云端），链完成会回到本命令。
      if (isShareChainResumeInFlight()) {
        // 链已回填会话却仍无 fileId：停止推进，避免「确认 → 保存 → 确认」死循环
        globalShowToast(t('请先保存图纸到云端后再分享'), 'warning');
        return { success: false, error: 'no-file-id' };
      }

      const step = await beginShareChain();
      if (step === 'auth-blocked')
        return { success: false, error: 'unauthorized' };
      if (step === 'cancelled') return { success: false, error: 'cancelled' };
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
