import { MxCpp } from 'mxcad';
import { store } from 'mxcad-app';
import { t } from '@/languages';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CAD_EVENTS } from '@/constants/events';
import { buildCadEditorUrl, getCadEditorBackUrl } from '@/utils/cadEditorRoute';
import { globalShowConfirm } from '@/utils/notificationEvents';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from '../mxcadCollaboration';
import { newSession, resetSessionRuntime, emit } from '../../drawingSession';
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

      // 未保存三键框：仅当前图纸有未保存修改时弹（保存/不保存/取消）。
      const canProceed = await checkAndConfirmUnsavedChanges();
      if (!canProceed)
        return {
          success: false,
          error: 'unsaved changes cancelled',
          silent: true,
        };

      // 无条件确认框：与引擎内置 Mx_NewFile 行为一致（引擎版 = 弹确认框 →
      // mxcad.newFile()）。保证点「新建图纸」一定有确认，即使无未保存修改，
      // 防止误触丢工作。有未保存修改时上方三键框先处理保存，这里再确认新建。
      const confirmed = await globalShowConfirm({
        title: t('新建图纸'),
        message: t('确定新建图纸吗？当前未保存的更改将丢失。'),
        confirmText: t('确定'),
        cancelText: t('取消'),
        type: 'warning',
      });
      if (!confirmed)
        return {
          success: false,
          error: 'new file cancelled',
          silent: true,
        };

      // 立即把会话切到「新建空白图纸」（setFileContext 唯一写入者，发布
      // FILE_CONTEXT_CHANGED）：协同面板/标题/URL 等消费方全部由这一个事件
      // 驱动，不再逐分支手拼。新建图纸无云端身份（currentFileInfo 派生为
      // null），保存/分享命令走「无文件」分支进另存为。
      newSession();
      // 标题必须在新建之前就设好：引擎 newFile() 不触发 openFileComplete，
      // 不会回写标题，但引擎空模板的 empty_template.mxweb 是内部实现名，直接
      // 露出会让用户困惑，故显示 new.dwg。setEditorFileName 同时写 _name 与标题。
      setEditorFileName('new.dwg');
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

      // 引擎原生 newFile()：清空当前图上内容、新建空白图纸。不触发 readMxFile /
      // openFileComplete，正是「新建图纸」语义。此前用 openFile(empty.mxweb) 走
      // openWebFile → 引擎 readMxFile 读 /tmp 临时文件失败（error:3292）→
      // waitForDocumentLoaded 超时，且绕过了引擎 Mx_NewFile 的确认框。newFile()
      // 不派发 openFileComplete，故不设 pendingOpenInfo（那靠 openFileComplete
      // 消费，此处会泄漏）。newFile 后重置图层/颜色/线型 store（引擎版同款）。
      const mxcad = MxCpp.getCurrentMxCAD();
      if (mxcad) {
        mxcad.newFile();
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
