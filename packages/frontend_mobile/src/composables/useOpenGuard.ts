import { showConfirmDialog, showToast } from 'vant';
import { t } from '@/languages';
import { useEditorStore } from '@/stores/editor';
import { useSave } from '@/composables/useSave';
import { saveAsRejectTrigger } from '@/composables/useSaveAs';
import { confirmExitCollaborationIfNeeded } from '@/composables/useCooperate';

/**
 * 打开新图纸前的守卫（对齐 PC guardBeforeOpen）。
 *
 * 顺序与 PC 一致：先确认退出协同（取消则连「是否保存」都不问），
 * 再走未保存更改守卫——移动端无多窗口，打开新图纸即替换当前图纸：
 * 有未保存更改时弹确认框，「保存」成功才继续；保存失败（无权限/需另存为）
 * 中止防丢更改；「不保存」则丢弃更改继续。
 *
 * 返回 false 表示调用方必须中止打开。
 */
export function useOpenGuard() {
  async function guardBeforeOpen(): Promise<boolean> {
    const collabOk = await confirmExitCollaborationIfNeeded();
    if (!collabOk) return false;

    const editorState = useEditorStore();
    if (!editorState.state.isModified) return true;

    const { save } = useSave();
    try {
      await showConfirmDialog({
        title: t('未保存的更改'),
        message: t('当前图纸有未保存的更改，是否保存？'),
        confirmButtonText: t('保存'),
        cancelButtonText: t('不保存'),
      });
      const res = await save();
      if (!res.success) {
        // 不能静默 return false：用户点「保存」后弹窗关闭、再无任何反馈，
        // 看起来就像「调用保存方法无效」。对齐 PC checkAndConfirmUnsavedChanges：
        // 保存被拒（无云端节点 / 无权限 / 已删除）→ 弹出另存为面板并说明原因，
        // 用户能继续把图纸另存为到云图；其他失败 → toast 原因。
        if (res.needSaveAs) {
          saveAsRejectTrigger.value = {
            reason: res.message ?? '',
            seq: saveAsRejectTrigger.value.seq + 1,
          };
        } else if (res.message) {
          showToast(res.message);
        }
        return false;
      }
      return true;
    } catch {
      // 用户选「不保存」：丢弃更改，继续打开
      return true;
    }
  }

  return { guardBeforeOpen };
}
