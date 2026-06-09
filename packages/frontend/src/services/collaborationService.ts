import { MxCpp } from 'mxcad';
import { APP_COOPERATE_URL } from '@/constants/appConfig';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { refreshFileName } from './mxcadManager';

export function getCooperate() {
  const mxCAD = MxCpp.getCurrentMxCAD();
  if (!mxCAD) return null;
  const cooperate = mxCAD.getCooperate();
  if (!cooperate) return null;
  cooperate.init({ server_addres: APP_COOPERATE_URL });
  return cooperate;
}

export function exitCurrentCollaboration(): boolean {
  const { isInCollaboration } = useCADEditorStore.getState();
  if (!isInCollaboration) return true;

  try {
    const cooperate = getCooperate();
    if (!cooperate) return false;

    const ret = cooperate.exitWrok();
    if (ret === 0) {
      useCADEditorStore.getState().setCollaborationState({
        isInCollaboration: false,
        workId: null,
      });
      refreshFileName();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
