import { ref, readonly } from 'vue';
import { useEditorState } from './useEditorState';
import { useUser } from './useUser';
import { getMxwebBlob, saveToNode, saveLibraryDrawing, saveLibraryBlock } from '../services/saveService';
import { uploadThumbnailForNode } from '../services/thumbnailService';
import { showToast } from 'vant';

const saving = ref(false);

export type SaveDestination = 'current' | 'personal' | 'project' | 'library-drawing' | 'library-block';

export function useSave() {
  const editorState = useEditorState();
  const { isAuthenticated } = useUser();

  async function save(commitMessage?: string): Promise<boolean> {
    const state = editorState.state;
    if (!isAuthenticated.value) {
      showToast('请先登录');
      return false;
    }

    saving.value = true;

    try {
      const blob = await getMxwebBlob();

      if (state.fileId && state.permissions.canSave) {
        await saveToNode(state.fileId, blob, commitMessage);
        showToast('保存成功');
        uploadThumbnailForNode(state.fileId).catch(() => {});
        saving.value = false;
        return true;
      }

      if (state.fileId) {
        const nodePath = state.fileInfo?.path as string | undefined;
        if (nodePath?.includes('/drawing/')) {
          if (state.permissions.canSave) {
            await saveLibraryDrawing(state.fileId, blob);
            showToast('保存成功');
            uploadThumbnailForNode(state.fileId).catch(() => {});
            saving.value = false;
            return true;
          }
        } else if (nodePath?.includes('/block/')) {
          if (state.permissions.canSave) {
            await saveLibraryBlock(state.fileId, blob);
            showToast('保存成功');
            uploadThumbnailForNode(state.fileId).catch(() => {});
            saving.value = false;
            return true;
          }
        }
      }

      showToast('无法保存到当前位置，请使用另存为');
      saving.value = false;
      return false;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '保存失败';
      showToast(message);
      saving.value = false;
      return false;
    }
  }

  return {
    saving: readonly(saving),
    save,
  };
}
