import { MxCpp } from 'mxcad';
import { MxFun } from 'mxdraw';
import { store } from 'mxcad-app';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { CAD_EVENTS } from '@/constants/events';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from '../mxcadCollaboration';
import {
  resetSessionRuntime,
  setModified,
  clearCurrentFileDeleted,
  emit,
} from '../../drawingSession';
import { mxcadManager } from '../mxcadManager';
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

      mxcadManager.setPendingFileInfo({
        fileId: '',
        parentId: null,
        projectId: null,
        name: 'new.dwg',
        personalSpaceId: null,
      });
      clearCurrentFileDeleted();
      resetSessionRuntime();
      setModified(false);

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

      const navigateFunction = useCADEditorStore.getState().navigateFunction;
      if (navigateFunction) {
        navigateFunction('/cad-editor');
      } else {
        window.history.replaceState(null, '', '/cad-editor');
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
