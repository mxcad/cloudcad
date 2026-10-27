import { MxCpp } from 'mxcad';
import { store } from 'mxcad-app';
import { t } from '@/languages';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CAD_EVENTS } from '@/constants/events';
import { buildCadEditorUrl, getCadEditorBackUrl } from '@/utils/cadEditorRoute';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from '../mxcadCollaboration';
import { newSession, resetSessionRuntime, emit } from '../../drawingSession';
import { mxcadManager } from '../mxcadManager';
import { setEditorFileName } from '../mxcadHelpers';
import type { Command, CommandContext, CommandResult } from './types';

export class NewFileCommand implements Command {
  readonly name = 'Mx_NewFile';

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    try {
      const collabOk = await confirmExitCollaborationIfNeeded();
      if (!collabOk)
        return {
          success: false,
          error: 'collaboration exit cancelled',
          silent: true,
        };

      const canProceed = await checkAndConfirmUnsavedChanges();
      if (!canProceed)
        return {
          success: false,
          error: 'unsaved changes cancelled',
          silent: true,
        };

      // 立即把会话切到「新建空白图纸」（setFileContext 唯一写入者，发布
      // FILE_CONTEXT_CHANGED）：协同面板/标题/URL 等消费方全部由这一个事件
      // 驱动，不再逐分支手拼。新建图纸无云端身份（currentFileInfo 派生为
      // null），保存/分享命令走「无文件」分支进另存为。
      newSession();
      // 登记待打开会话：打开成功后 openFileComplete 消费它做幂等确认；
      // 失败时 60s 超时 / retCall 回滚清理，不再残留永久 hasPendingOpen 锁
      // （旧实现裸发 __openWebFile__ 无失败通道，pending 泄漏 → Mx_Save 永久被拦）
      mxcadManager.setPendingOpenInfo({
        context: { kind: 'new', fileId: null, name: null },
      });
      // 标题必须在发打开命令之前就清掉，不能等 openFileComplete：
      // 引擎的 openFileComplete 回调固定写 fileName.value = " - " + _name，而 _name 是
      // 引擎模块级变量、前端绕过引擎 openWebFile 包装从不更新它；空模板这次打开若被引擎
      // _isStopLoading 闩锁吞掉 openFileComplete（见 waitForDocumentLoaded 注释），
      // 标题就会一直停留在上一张图纸。setEditorFileName 同时清 _name 与标题，
      // 只清标题会被引擎那次回写覆盖回旧名。
      setEditorFileName('');
      resetSessionRuntime();

      // 新文件没有云端身份：URL 清空身份参数（fileId 路径段 / nodeId / hash），
      // 只保留跨文件不失效的 back（返回地址）。
      const targetUrl = buildCadEditorUrl({
        fileId: '',
        back: getCadEditorBackUrl(),
      });
      const navigateFunction = useCADEditorStore.getState().navigateFunction;
      if (navigateFunction) {
        navigateFunction(targetUrl);
      } else {
        window.history.replaceState(null, '', targetUrl);
      }

      emit(CAD_EVENTS.NEW_FILE, {
        fileId: null,
        parentId: null,
        projectId: null,
      });

      const mxcad = MxCpp.getCurrentMxCAD();
      if (mxcad) {
        // 走串行打开队列（enqueueOpen 唯一入口）：裸发 __openWebFile__ 会与在途
        // 打开重叠，锁死引擎 _isStopLoading 闩锁吞掉 openFileComplete → pending
        // 永不消费。fetchAttributes=1（仅载入内存）与引擎对空模板的原有语义一致。
        await mxcadManager.openFile({
          url: new URL('../../../public/empty.mxweb', import.meta.url).href,
          fetchAttributes: 1,
        });
        const { initLayerList } = store.useLayer();
        const { initColorIndexList } = store.useColor();
        const { initLineTypeList } = store.useLineType();
        initLayerList();
        initColorIndexList();
        initLineTypeList();
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        message: t('新建图纸失败，请稍后重试'),
      };
    }
  }
}
