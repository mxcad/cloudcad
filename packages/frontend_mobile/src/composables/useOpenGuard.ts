import { showConfirmDialog } from 'vant';
import { t } from '@/languages';
import { useEditorState } from '@/composables/useEditorState';
import { useSave } from '@/composables/useSave';

/**
 * 打开新图纸前的未保存更改守卫（对齐 PC guardBeforeOpen）。
 *
 * 移动端无多窗口，打开新图纸即替换当前图纸：有未保存更改时弹确认框——
 * 「保存」成功才继续；保存失败（无权限/需另存为）中止，防丢更改；
 * 「不保存」则丢弃更改继续。
 *
 * 返回 false 表示调用方必须中止打开。
 */
export function useOpenGuard() {
  async function guardBeforeOpen(): Promise<boolean> {
    const editorState = useEditorState();
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
      return res.success;
    } catch {
      // 用户选「不保存」：丢弃更改，继续打开
      return true;
    }
  }

  return { guardBeforeOpen };
}
