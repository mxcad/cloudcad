import { t } from '@/languages';
import { globalShowPrompt } from '@/utils/notificationEvents';

/** 保存确认对话框（从 mxcadSave 收编） */
export function showSaveConfirmDialog(): Promise<string | null> {
  return globalShowPrompt({
    title: t('保存文件'),
    label: t('修改说明（可选）'),
    confirmText: t('保存'),
    multiline: true,
    required: false,
  });
}
