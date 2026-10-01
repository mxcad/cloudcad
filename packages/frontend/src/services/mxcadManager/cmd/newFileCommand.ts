import { MxCpp } from 'mxcad';
import { MxFun } from 'mxdraw';
import { store } from 'mxcad-app';
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
        return { success: false, error: 'collaboration exit cancelled' };

      const canProceed = await checkAndConfirmUnsavedChanges();
      if (!canProceed)
        return { success: false, error: 'unsaved changes cancelled' };

      const newFileInfo = {
        fileId: '',
        parentId: null,
        projectId: null,
        // 新建图纸还没有文件名：留空让标题栏处于空白态，取名单交给保存时的另存为对话框
        name: '',
        personalSpaceId: null,
      };
      // 立即把会话切到「新建空白图纸」：只 patch 部分字段会让新图纸继承旧图纸的
      // currentFileInfo / projectId / fromShare，保存归属与权限判断全落在旧文件上。
      // pendingOpenInfo 一并登记，打开成功后 openFileComplete 的 openSession 幂等确认。
      newSession(newFileInfo);
      mxcadManager.setPendingFileInfo(newFileInfo);
      // 标题必须在发打开命令之前就清掉，不能等 openFileComplete：
      // 引擎的 openFileComplete 回调固定写 fileName.value = " - " + _name，而 _name 是
      // 引擎模块级变量、前端绕过引擎 openWebFile 包装从不更新它；空模板这次打开若被引擎
      // _isStopLoading 闩锁吞掉 openFileComplete（见 waitForDocumentLoaded 注释），
      // 标题就会一直停留在上一张图纸。setEditorFileName 同时清 _name 与标题，
      // 只清标题会被引擎那次回写覆盖回旧名。
      setEditorFileName(newFileInfo.name);
      resetSessionRuntime();

      const mxcad = MxCpp.getCurrentMxCAD();
      if (mxcad) {
        MxFun.sendStringToExecute('__openWebFile__', [
          new URL('../../../public/empty.mxweb', import.meta.url).href,
          void 0,
          void 0,
          void 0,
          1,
        ]);
        const { initLayerList } = store.useLayer();
        const { initColorIndexList } = store.useColor();
        const { initLineTypeList } = store.useLineType();
        initLayerList();
        initColorIndexList();
        initLineTypeList();
      }

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

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
