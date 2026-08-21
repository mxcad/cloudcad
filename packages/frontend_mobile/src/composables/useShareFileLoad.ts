import { useEditorStore } from '../stores/editor';
import { classifyApiError } from '../utils/errorHandler';
import { t } from '@/languages';

export async function useShareFileLoad(
  shareToken: string,
  fileId: string,
  createMxCAD: (url?: string) => Promise<any>,
  initEditObjectToolbar: (mxcad: any) => void,
): Promise<boolean> {
  const editorStore = useEditorStore();
  editorStore.setLoading(true);
  editorStore.setProgressStage('fetching-info');

  try {
    const { shareControllerResolveShareNode } = await import('../api-sdk');
    const { data: raw } = await shareControllerResolveShareNode({ path: { token: shareToken } });
    if (!raw) {
      editorStore.setError(t('分享链接不存在或已失效'));
      editorStore.setErrorType('not-found');
      editorStore.setLoading(false);
      return false;
    }

    const info = raw as Record<string, any>;
    if (info.deletedAt) throw new Error(t('文件已被删除'));
    if (!info.fileHash) throw new Error(t('文件尚未转换完成'));
    if (!info.path) throw new Error(t('文件路径不存在'));
    if (!info.updatedAt) throw new Error(t('无法构造文件访问URL'));

    editorStore.setFileId(fileId);
    editorStore.setFileInfo(info);
    editorStore.setFileName(info.name || '');
    editorStore.setUpdatedAt(info.updatedAt || null);
    editorStore.setProjectId(null);
    editorStore.setPermissions({ canSave: false, canExport: true, canManageExternalRef: false });

    const ts = new Date(info.updatedAt).getTime();
    const mxwebUrl = `/api/v1/mxcad/filesData/${info.path}?t=${ts}&shareToken=${shareToken}`;
    editorStore.setProgressStage('opening');

    const mxcad = await createMxCAD(mxwebUrl);
    mxcad.on('databaseModify', () => { editorStore.setIsModified(true); });
    mxcad.on('openFileComplete', () => { editorStore.setIsModified(false); });
    initEditObjectToolbar(mxcad);

    editorStore.setIsActive(true);
    editorStore.setLoading(false);
    return true;
  } catch (e) {
    const classified = classifyApiError(e);
    let message = classified.message;
    let errorType = classified.type;

    const axiosError = e as { response?: { status?: number } };
    if (axiosError.response?.status === 401) {
      message = t('请登录后访问此文件');
      errorType = 'auth';
    } else if (axiosError.response?.status === 404) {
      message = t('分享链接不存在或已失效');
      errorType = 'not-found';
    } else if (message.includes('文件已被删除')) {
      errorType = 'not-found';
    } else if (message.includes('文件尚未转换完成')) {
      errorType = 'converting';
    }

    editorStore.setError(message);
    editorStore.setErrorType(errorType);
    editorStore.setLoading(false);
    return false;
  }
}
