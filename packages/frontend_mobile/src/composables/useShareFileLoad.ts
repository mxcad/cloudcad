import { useEditorStore } from '../stores/editor';

export async function useShareFileLoad(
  shareToken: string,
  fileId: string,
  createMxCAD: (url?: string) => Promise<any>,
  initEditObjectToolbar: (mxcad: any) => void,
): Promise<boolean> {
  const editorStore = useEditorStore();

  try {
    const { shareControllerResolveShareNode } = await import('../api-sdk');
    const { data: raw } = await shareControllerResolveShareNode({ path: { token: shareToken } });
    if (!raw) return false;

    const info = raw as Record<string, any>;
    if (info.deletedAt) throw new Error('文件已被删除');
    if (!info.fileHash) throw new Error('文件尚未转换完成');
    if (!info.path) throw new Error('文件路径不存在');
    if (!info.updatedAt) throw new Error('无法构造文件访问URL');

    editorStore.setFileId(fileId);
    editorStore.setFileInfo(info);
    editorStore.setFileName(info.name || '');
    editorStore.setUpdatedAt(info.updatedAt || null);
    editorStore.setProjectId(null);
    editorStore.setPermissions({ canSave: false, canExport: true, canManageExternalRef: false });

    const ts = new Date(info.updatedAt).getTime();
    const mxwebUrl = `/api/v1/mxcad/filesData/${info.path}?t=${ts}&shareToken=${shareToken}`;

    const mxcad = await createMxCAD(mxwebUrl);
    mxcad.on('databaseModify', () => { editorStore.setIsModified(true); });
    mxcad.on('openFileComplete', () => { editorStore.setIsModified(false); });
    initEditObjectToolbar(mxcad);

    editorStore.setIsActive(true);
    editorStore.setLoading(false);
    return true;
  } catch (e) {
    console.error('分享文件加载失败:', e);
    return false;
  }
}
