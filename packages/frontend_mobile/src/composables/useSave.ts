import { ref, readonly } from 'vue';
import { t } from '@/languages';
import { useEditorStore } from '@/stores/editor';
import { useUser } from './useUser';
import {
  getMxwebBlob,
  saveToNode,
  saveLibraryDrawing,
  saveLibraryBlock,
} from '../services/saveService';
import { hasAnyPermission } from '@cloudcad/platform';
import { PERMISSIONS } from '../services/permissionService';
import {
  projectControllerGetPersonalSpace,
  nodeControllerGetNode,
} from '../api-sdk';
import { uploadThumbnailForNode } from '../services/thumbnailService';
import { processPendingImages } from '../services/pendingImageService';
import {
  buildCacheKey,
  clearMxwebCache,
  setMxwebCache,
} from '../services/mxwebCacheService';
import { handleApiError } from '../utils/apiConfig';
import { unwrap } from '../utils/apiError';
import { isTokenExpired, readToken } from '../utils/authSession';
import { showToast, showLoadingToast, closeToast } from 'vant';

/**
 * 库图纸/库图块的「库内保存」权限（对齐 PC saveDefaults.hasLibraryPermission）。
 * 只负责端侧取数（localStorage 'user'）；权限码判定走 @cloudcad/platform 一份实现。
 * 须同步读取：本判定在 save() 的 await 之前执行，useUser 的响应式状态在此不可用。
 */
function checkLibraryPermission(): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const userData = JSON.parse(userStr);
    return hasAnyPermission(userData?.role?.permissions, [
      PERMISSIONS.LIBRARY_DRAWING_MANAGE,
      PERMISSIONS.LIBRARY_BLOCK_MANAGE,
    ]);
  } catch {
    return false;
  }
}

export interface SaveResult {
  success: boolean;
  needLogin?: boolean;
  needSaveAs?: boolean;
  message?: string;
}

/** 保存后更新 IndexedDB 缓存和编辑器状态（参考 PC 端 saveToCurrentFile） */
async function updateCacheAndState(
  nodeId: string,
  blob: Blob,
  editorState: ReturnType<typeof useEditorStore>
): Promise<void> {
  try {
    const nodeResult = await nodeControllerGetNode({ path: { nodeId } });
    const nodeInfo = nodeResult.data as
      { updatedAt?: string; path?: string } | undefined;
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
  const saving = ref(false);
  const editorState = useEditorStore();
  const { isAuthenticated } = useUser();

  async function save(commitMessage?: string): Promise<SaveResult> {
    const state = editorState.state;

    if (!isAuthenticated.value || isTokenExpired(readToken())) {
      return { success: false, needLogin: true, message: t('请先登录') };
    }

    // 检查当前文件是否已被删除
    if (state.isCurrentFileDeleted) {
      return {
        success: false,
        needSaveAs: true,
        message: t('当前图纸已被删除，请另存为新文件'),
      };
    }

    saving.value = true;
    showLoadingToast({
      message: t('正在保存文件...'),
      forbidClick: true,
      duration: 0,
    });

    try {
      if (state.isPublicFile) {
        saving.value = false;
        closeToast();
        return { success: false, message: t('公开文件不支持保存') };
      }

      // 项目保存权限门禁。库源在此排除：useFileLoader 对库源固定写 canSave:false，
      // 不排除会在下方库分支判定之前被误拦成「没有保存权限」，用户按提示另存为
      // 却永远回不到库，只看到一句与原因无关的提示。
      if (!state.permissions.canSave && state.fileId && !state.libraryKey) {
        saving.value = false;
        closeToast();
        return {
          success: false,
          needSaveAs: true,
          message: t('没有保存权限，请另存为'),
        };
      }

      const blob = await getMxwebBlob();

      if (!state.fileId) {
        saving.value = false;
        closeToast();
        return {
          success: false,
          needSaveAs: true,
          message: t('请另存为到云图'),
        };
      }

      // 库源：有库管理权限则库内原位保存（对齐 PC saveFile 的 library 分支），
      // 无权限引导另存为到其他位置，不动库原件。放在文件系统节点存在性检查之前——
      // 库图纸不在 file_system 节点体系里，走 nodeControllerGetNode 是错的判定。
      if (state.libraryKey) {
        if (!checkLibraryPermission()) {
          saving.value = false;
          closeToast();
          return {
            success: false,
            needSaveAs: true,
            message: t('资源库图纸只读，请另存为到其他位置'),
          };
        }
        await (state.libraryKey === 'block'
          ? saveLibraryBlock(state.fileId, blob)
          : saveLibraryDrawing(state.fileId, blob));
        await updateCacheAndState(state.fileId, blob, editorState);
        await processPendingImages(state.fileId).catch(() => {});
        closeToast();
        showToast(t('保存成功'));
        saving.value = false;
        return { success: true };
      }

      // 远程检查文件是否存在（处理跨会话/跨用户删除）
      try {
        const nodeResp = await nodeControllerGetNode({
          path: { nodeId: state.fileId },
          throwOnError: true,
        });
        const node = nodeResp.data;
        if (node?.fileStatus === 'DELETED' || node?.deletedAt) {
          editorState.setIsCurrentFileDeleted(true);
          saving.value = false;
          closeToast();
          return {
            success: false,
            needSaveAs: true,
            message: t('当前图纸已被删除，请另存为新文件'),
          };
        }
      } catch {
        // 404 → 节点已被永久删除
        editorState.setIsCurrentFileDeleted(true);
        saving.value = false;
        closeToast();
        return {
          success: false,
          needSaveAs: true,
          message: t('当前图纸已被删除，请另存为新文件'),
        };
      }

      let personalSpaceId: string | null = null;
      try {
        const result = await projectControllerGetPersonalSpace();
        personalSpaceId = unwrap<{ id: string }>(result).id || null;
      } catch {
        personalSpaceId = null;
      }

      const fileInfo = state.fileInfo as Record<string, unknown> | null;
      const parentId = fileInfo?.parentId as string | null | undefined;
      const projectId = fileInfo?.projectId as string | undefined;

      // 「我的图纸」判据：直接落在个人空间根，或位于其子文件夹（此时 parentId 是
      // 子文件夹，但 projectId 仍是解析出的根 = 个人空间 ID）。只看 parentId 会让
      // 子文件夹里的图纸被判成「无归属」，再保存时又弹一次另存为。
      const isMyDrawing = !!(
        personalSpaceId &&
        (parentId === personalSpaceId || projectId === personalSpaceId)
      );

      if (isMyDrawing) {
        await saveToNode(
          state.fileId,
          blob,
          commitMessage,
          state.expectedTimestamp
        );
        // 后处理：缓存更新 + 状态重置
        await updateCacheAndState(state.fileId, blob, editorState);
        await processPendingImages(state.fileId).catch(() => {});
        closeToast();
        showToast(t('保存成功'));
        uploadThumbnailForNode(state.fileId).catch(() => {});
        saving.value = false;
        return { success: true };
      }

      if (projectId && state.permissions.canSave) {
        try {
          await saveToNode(
            state.fileId,
            blob,
            commitMessage,
            state.expectedTimestamp
          );
          // 后处理：缓存更新 + 状态重置
          await updateCacheAndState(state.fileId, blob, editorState);
          await processPendingImages(state.fileId).catch(() => {});
          closeToast();
          showToast(t('保存成功'));
          uploadThumbnailForNode(state.fileId).catch(() => {});
          saving.value = false;
          return { success: true };
        } catch {
          // 保存失败，降级到另存为
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
