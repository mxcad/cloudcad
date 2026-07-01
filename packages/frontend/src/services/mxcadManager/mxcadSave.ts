import { t } from '@/languages';
import { handleError } from '@/utils/errorHandler';
import { globalShowPrompt } from '@/contexts/NotificationContext';
import { calculateFileHash } from '@/utils/hashUtils';
import { uploadMxCadFile } from '@/utils/mxcadUploadUtils';
import type { SaveMxwebParams } from './mxcadTypes';

export type { SaveMxwebParams } from './mxcadTypes';

export async function saveMxwebToNode(params: SaveMxwebParams): Promise<void> {
  try {
    const filename = params.filename || 'drawing.mxweb';
    const file = new File([params.blob], filename, { type: params.blob.type });
    const hash = await calculateFileHash(file);

    await uploadMxCadFile({ file, hash, nodeId: params.nodeId, skipDb: true });

    const formData = new FormData();
    formData.append('hash', hash);
    if (params.commitMessage) formData.append('commitMessage', params.commitMessage);
    if (params.expectedTimestamp) formData.append('expectedTimestamp', params.expectedTimestamp);

    const token = localStorage.getItem('accessToken');
    const response = await fetch(`/api/v1/mxcad/savemxweb/${params.nodeId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ message: t('保存失败') }));
      throw new Error((errBody as { message?: string }).message || t('保存失败'));
    }
  } catch (error) {
    handleError(error, 'mxcadSave: saveMxwebToNode');
    throw error;
  }
}

export function showSaveConfirmDialog(): Promise<string | null> {
  return globalShowPrompt({
    title: t('保存文件'),
    label: t('修改说明（可选）'),
    confirmText: t('保存'),
    multiline: true,
  });
}
