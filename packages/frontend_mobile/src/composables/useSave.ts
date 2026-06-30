import { ref, readonly } from 'vue';
import { t } from '@/languages';
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
  fileSystemControllerGetNode,
} from '../api-sdk';
import { uploadThumbnailForNode } from '../services/thumbnailService';
import { processPendingImages } from '../services/pendingImageService';
import { buildCacheKey, clearMxwebCache, setMxwebCache } from '../services/mxwebCacheService';
import { handleApiError } from '../utils/apiConfig';
import { showToast, showLoadingToast, closeToast } from 'vant';
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

/** 保存后更新 IndexedDB 缓存和编辑器状态（参考 PC 端 saveToCurrentFile） */
async function updateCacheAndState(
  nodeId: string,
  blob: Blob,
  editorState: ReturnType<typeof useEditorState>,
): Promise<void> {
  try {
    const nodeResult = await fileSystemControllerGetNode({ path: { nodeId } });
    const nodeInfo = nodeResult.data as { updatedAt?: string; path?: string } | undefined;
    if (!nodeInfo) return;

    // 更新乐观锁时间戳
    if (nodeInfo.updatedAt) {
      editorState.setExpectedTimestamp(nodeInfo.updatedAt);
    }

    // 更新 IndexedDB 缓存
    if (nodeInfo.path) {
      const arrayBuffer = await blob.arrayBuffer();
      const timestamp = nodeInfo.updatedAt
        ? new Date(nodeInfo.updatedAt).getTime()
        : Date.now();
      const cacheKey = buildCacheKey(nodeInfo.path, timestamp);
      await clearMxwebCache(cacheKey).catch(() => {});
      await setMxwebCache(cacheKey, arrayBuffer).catch(() => {});
    }

    // 重置文档修改状态
    editorState.setIsModified(false);
  } catch {
    // 缓存更新失败不影响主流程
  }
}

export function useSave() {
  const editorState = useEditorState();
  const { isAuthenticated } = useUser();

  async function save(commitMessage?: string): Promise<SaveResult> {
    const state = editorState.state;

    if (!isAuthenticated.value || isAccessTokenExpired()) {
      return { success: false, needLogin: true, message: t('请先登录') };
    }

    saving.value = true;
    showLoadingToast({ message: t('正在保存文件...'), forbidClick: true, duration: 0 });

    try {
      if (state.isPublicFile) {
        saving.value = false;
        closeToast();
        return { success: false, message: t('公开文件不支持保存') };
      }

      if (!state.permissions.canSave && state.fileId) {
        saving.value = false;
        closeToast();
        return { success: false, needSaveAs: true, message: t('没有保存权限，请另存为') };
      }

      const blob = await getMxwebBlob();

      if (!state.fileId) {
        saving.value = false;
        closeToast();
        return { success: false, needSaveAs: true, message: t('请另存为到云图') };
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
        await saveToNode(state.fileId, blob, commitMessage, state.expectedTimestamp);
        // 后处理：缓存更新 + 状态重置
        await updateCacheAndState(state.fileId, blob, editorState);
        await processPendingImages(state.fileId).catch(() => {});
        closeToast();
        showToast(t('保存成功'));
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
          // 后处理：缓存更新 + 状态重置
          await updateCacheAndState(state.fileId, blob, editorState);
          await processPendingImages(state.fileId).catch(() => {});
          closeToast();
          showToast(t('保存成功'));
          uploadThumbnailForNode(state.fileId).catch(() => {});
          saving.value = false;
          return { success: true };
        }
        saving.value = false;
        closeToast();
        return { success: false, needSaveAs: true, message: t('无资源库管理权限，请另存为到其他位置') };
      }

      if (projectId && state.permissions.canSave) {
        try {
          const permResult = await fileSystemControllerCheckProjectPermission({
            path: { projectId },
            query: { permission: PERMISSIONS.CAD_SAVE as any },
          });
          if (!permResult.error && permResult.data?.hasPermission) {
            await saveToNode(state.fileId, blob, commitMessage, state.expectedTimestamp);
            // 后处理：缓存更新 + 状态重置
            await updateCacheAndState(state.fileId, blob, editorState);
            await processPendingImages(state.fileId).catch(() => {});
            closeToast();
            showToast(t('保存成功'));
            uploadThumbnailForNode(state.fileId).catch(() => {});
            saving.value = false;
            return { success: true };
          }
        } catch {
          // 权限检查失败，降级到另存为
        }
      }

      saving.value = false;
      closeToast();
      return { success: false, needSaveAs: true, message: t('请另存为到云图') };
    } catch (e: unknown) {
      closeToast();
      handleApiError(e, t('保存失败'));
      saving.value = false;
      return { success: false, message: t('保存失败') };
    }
  }

  return {
    saving: readonly(saving),
    save,
  };
}
