import { saveControllerSaveMxwebToNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { globalShowPrompt } from '@/contexts/NotificationContext';
import type { SaveMxwebParams } from './mxcadTypes';

export type { SaveMxwebParams } from './mxcadTypes';

export async function saveMxwebToNode(params: SaveMxwebParams): Promise<void> {
  try {
    const filename = params.filename || 'drawing.mxweb';
    await saveControllerSaveMxwebToNode({
      path: { nodeId: params.nodeId },
      body: {
        file: new File([params.blob], filename, { type: params.blob.type }),
        ...(params.commitMessage ? { commitMessage: params.commitMessage } : {}),
        ...(params.expectedTimestamp ? { expectedTimestamp: params.expectedTimestamp } : {}),
      },
    });
  } catch (error) {
    handleError(error, 'mxcadSave: saveMxwebToNode');
    throw error;
  }
}

export function showSaveConfirmDialog(): Promise<string | null> {
  return globalShowPrompt({
    title: '保存文件',
    label: '修改说明（可选）',
    confirmText: '保存',
    multiline: true,
  });
}
