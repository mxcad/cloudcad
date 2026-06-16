import { ref, readonly } from 'vue';
import { useEditorState } from './useEditorState';
import { useUser } from './useUser';
import {
  getMxwebBlob,
  saveToNode,
  saveLibraryDrawing,
  saveLibraryBlock,
} from '../services/saveService';
import {
  fileSystemControllerGetPersonalSpace,
  fileSystemControllerCheckProjectPermission,
} from '../api-sdk';
import { uploadThumbnailForNode } from '../services/thumbnailService';
import { processPendingImages } from '../services/pendingImageService';
import { handleApiError } from '../utils/apiConfig';
import { showToast } from 'vant';
import { PERMISSIONS } from '../services/permissionService';

const saving = ref(false);

export interface SaveResult {
  success: boolean;
  needLogin?: boolean;
  needSaveAs?: boolean;
  message?: string;
}

function isAccessTokenExpired(): boolean {
  try {
    const token = localStorage.getItem('accessToken');
    if (!token) return true;
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    if (!payload.exp) return true;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function checkLibraryPermission(): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const userData = JSON.parse(userStr);
    const permissions = userData?.role?.permissions || [];
    const permStrings = permissions
      .map((p: unknown) => (typeof p === 'string' ? p : (p as Record<string, unknown>)?.permission))
      .filter(Boolean) as string[];
    return (
      permStrings.includes(PERMISSIONS.LIBRARY_DRAWING_MANAGE) ||
      permStrings.includes(PERMISSIONS.LIBRARY_BLOCK_MANAGE)
    );
  } catch {
    return false;
  }
}

export function useSave() {
  const editorState = useEditorState();
  const { isAuthenticated } = useUser();

  async function save(commitMessage?: string): Promise<SaveResult> {
    const state = editorState.state;

    if (!isAuthenticated.value || isAccessTokenExpired()) {
      return { success: false, needLogin: true, message: '请先登录' };
    }

    saving.value = true;

    try {
      if (state.isPublicFile) {
        saving.value = false;
        return { success: false, message: '公开文件不支持保存' };
      }

      if (!state.permissions.canSave && state.fileId) {
        saving.value = false;
        return { success: false, needSaveAs: true, message: '没有保存权限，请另存为' };
      }

      const blob = await getMxwebBlob();

      if (!state.fileId) {
        saving.value = false;
        return { success: false, needSaveAs: true, message: '请另存为到云图' };
      }

      let personalSpaceId: string | null = null;
      try {
        const result = await fileSystemControllerGetPersonalSpace();
        if (!result.error) {
          personalSpaceId = (result.data as unknown as { id: string })?.id || null;
        }
      } catch {
        personalSpaceId = null;
      }

      const fileInfo = state.fileInfo as Record<string, unknown> | null;
      const parentId = fileInfo?.parentId as string | null | undefined;
      const libraryKey = fileInfo?.libraryKey as string | undefined;
      const projectId = fileInfo?.projectId as string | undefined;

      const isMyDrawing = !!(personalSpaceId && parentId && parentId === personalSpaceId);

      if (isMyDrawing) {
        const result = await saveToNode(state.fileId, blob, commitMessage, state.expectedTimestamp);
        if (result.updatedAt) {
          editorState.setExpectedTimestamp(result.updatedAt);
        }
        await processPendingImages(state.fileId).catch(() => {});
        showToast('保存成功');
        uploadThumbnailForNode(state.fileId).catch(() => {});
        saving.value = false;
        return { success: true };
      }

      if (libraryKey) {
        if (checkLibraryPermission()) {
          if (libraryKey === 'block') {
            await saveLibraryBlock(state.fileId, blob);
          } else {
            await saveLibraryDrawing(state.fileId, blob);
          }
          await processPendingImages(state.fileId).catch(() => {});
          showToast('保存成功');
          uploadThumbnailForNode(state.fileId).catch(() => {});
          saving.value = false;
          return { success: true };
        }
        saving.value = false;
        return { success: false, needSaveAs: true, message: '无资源库管理权限，请另存为到其他位置' };
      }

      if (projectId && state.permissions.canSave) {
        try {
          const permResult = await fileSystemControllerCheckProjectPermission({
            path: { projectId },
            query: { permission: PERMISSIONS.CAD_SAVE as any },
          });
          if (!permResult.error && permResult.data?.hasPermission) {
            const result = await saveToNode(state.fileId, blob, commitMessage, state.expectedTimestamp);
            if (result.updatedAt) {
              editorState.setExpectedTimestamp(result.updatedAt);
            }
            await processPendingImages(state.fileId).catch(() => {});
            showToast('保存成功');
            uploadThumbnailForNode(state.fileId).catch(() => {});
            saving.value = false;
            return { success: true };
          }
        } catch {
          // 权限检查失败，降级到另存为
        }
      }

      saving.value = false;
      return { success: false, needSaveAs: true, message: '请另存为到云图' };
    } catch (e: unknown) {
      handleApiError(e, '保存失败');
      saving.value = false;
      return { success: false, message: '保存失败' };
    }
  }

  return {
    saving: readonly(saving),
    save,
  };
}
