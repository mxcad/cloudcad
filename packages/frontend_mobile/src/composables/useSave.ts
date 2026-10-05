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
import { isTokenExpired, readToken } from '../utils/authSession';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { PERMISSIONS } from '../services/permissionService';
import { hasAnyPermission } from '@cloudcad/platform';

export interface SaveResult {
  success: boolean;
  needLogin?: boolean;
  needSaveAs?: boolean;
  message?: string;
}

function checkLibraryPermission(): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const userData = JSON.parse(userStr);
    // 权限码判定收敛到 @cloudcad/platform（与 PC 共用一份）；
    // 这里只负责端侧取数（localStorage）与目标权限码清单。
    // 须同步读取：本判定在 save() 的 await 之前执行，useUser 的响应式状态不在此用。
    return hasAnyPermission(userData?.role?.permissions, [
      PERMISSIONS.LIBRARY_DRAWING_MANAGE,
      PERMISSIONS.LIBRARY_BLOCK_MANAGE,
    ]);
  } catch {
    return false;
  }
}

/** 保存后更新 IndexedDB 缓存和编辑器状态（参考 PC 端 saveToCurrentFile） */
async function updateCacheAndState(
  nodeId: string,
  blob: Blob,
  editorState: ReturnType<typeof useEditorState>
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
  const editorState = useEditorState();
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

      // 项目保存权限门禁。库文件在此排除：useFileLoader 对库源固定写
      // canSave:false，不排除会让库文件在下方 checkLibraryPermission 判定之前
      // 被误拦成「没有保存权限」，saveLibraryDrawing/Block 恒不可达。
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
        if (!result.error) {
          personalSpaceId =
            (result.data as unknown as { id: string })?.id || null;
        }
      } catch {
        personalSpaceId = null;
      }

      const fileInfo = state.fileInfo as Record<string, unknown> | null;
      const parentId = fileInfo?.parentId as string | null | undefined;
      // libraryKey 只存在于 store 字段：loadByNodeId 经 options.libraryKey 写入
      // state.libraryKey。FileSystemNode 没有该字段，接口返回的 fileInfo 上读它
      // 恒为 undefined——曾因此让库保存分支彻底不可达。
      const libraryKey = state.libraryKey || undefined;
      const projectId = fileInfo?.projectId as string | undefined;

      const isMyDrawing = !!(
        personalSpaceId &&
        parentId &&
        parentId === personalSpaceId
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
        return {
          success: false,
          needSaveAs: true,
          message: t('无资源库管理权限，请另存为到其他位置'),
        };
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
