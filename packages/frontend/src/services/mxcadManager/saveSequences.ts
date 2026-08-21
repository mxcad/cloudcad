import { t } from '@/languages';
import { saveControllerSaveMxwebToNode } from '@/api-sdk';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { handleError, getErrorMessage } from '@/utils/errorHandler';
import {
  showGlobalLoading,
  hideGlobalLoading,
  setLoadingMessage,
} from '@/services/loadingService';
import { calculateFileHash } from '@/utils/hashUtils';
import { uploadMxCadFile } from '@/utils/mxcadUploadUtils';
import { globalShowToast } from '@/utils/notificationEvents';
import { generateThumbnail, uploadThumbnail } from './mxcadThumbnail';
import {
  getFileInfo,
  saveCurrentDrawingToBlob,
  showSaveAsDialog,
} from './mxcadHelpers';
import { setModified, patchSession } from '../drawingSession';
import { writeFileCacheToIndexedDB } from './mxcadCache';
import { processPendingImages } from './cmd/insertImageCommand';
import { showSaveConfirmDialog } from './saveDialogs';
import type { CurrentFileInfo } from './mxcadTypes';
import type {
  SaveFileDeps,
  SaveFileOutcome,
  SaveMxwebToNodeParams,
} from './saveTypes';

/**
 * blob → hash → upload → SDK save 落库序列（唯一一份）
 *
 * 以 saveCommand.ts 活代码为行为基准（三份重复有差异时以活代码为准）：
 * filename 由调用方决定（节点路径带 .mxweb 扩展名规整、资源库路径用 libraryKey）；
 * commitMessage / expectedTimestamp 原样透传（undefined 由序列化丢弃）。
 * deps 为可选注入：内部保存流传入以走注入的 SDK 句柄（测试/替换用），
 * 默认（公开 API）直接桥接 @api-sdk。
 */
export async function saveMxwebToNode(
  params: SaveMxwebToNodeParams,
  deps?: SaveFileDeps
): Promise<void> {
  const filename = params.filename || 'drawing.mxweb';
  const file = new File([params.blob], filename, { type: params.blob.type });
  const hash = await calculateFileHash(file);

  await uploadMxCadFile({ file, hash, nodeId: params.nodeId, skipDb: true });

  const sdkSave =
    deps?.sdk.saveMxwebToNode ??
    ((
      nodeId: string,
      body: { hash: string; commitMessage?: string; expectedTimestamp?: string }
    ) => saveControllerSaveMxwebToNode({ path: { nodeId }, body }));
  const result = await sdkSave(params.nodeId, {
    hash,
    commitMessage: params.commitMessage,
    expectedTimestamp: params.expectedTimestamp,
  });
  if (result.error) {
    const errBody = result.error as { message?: string };
    throw new Error(
      errBody.message || params.errorMessageFallback || t('保存失败')
    );
  }
}

/** 保存到当前节点（含已删除检查、项目权限、确认对话框、上传落库、缓存与缩略图） */
export async function saveToNodeFile(
  fileInfo: CurrentFileInfo,
  personalSpaceId: string | null,
  deps: SaveFileDeps
): Promise<SaveFileOutcome> {
  try {
    const nodeResp = await deps.sdk.getNode(fileInfo.fileId);
    const node = nodeResp.data;
    if (node?.fileStatus === 'DELETED' || node?.deletedAt) {
      useCADEditorStore.getState().setIsCurrentFileDeleted(true);
      globalShowToast(t('当前图纸已被删除，保存将另存为新文件'), 'warning');
      const fileName = getFileInfo()?.name || 'untitled';
      await showSaveAsDialog(personalSpaceId, fileName);
      return { status: 'saveAs' };
    }
  } catch (error) {
    // getNode 用 throwOnError: true 抛错：仅 404（节点不存在）视为"图纸已删除"，
    // 其他错误（网络/500）必须透传真实原因，避免服务器故障时误导用户走另存为
    const code = (error as { code?: string })?.code;
    if (code === 'NOT_FOUND') {
      useCADEditorStore.getState().setIsCurrentFileDeleted(true);
      globalShowToast(t('当前图纸已被删除，保存将另存为新文件'), 'warning');
      const fileName = getFileInfo()?.name || 'untitled';
      await showSaveAsDialog(personalSpaceId, fileName);
      return { status: 'saveAs' };
    }
    handleError(error, 'mxcadManager: saveToNodeFile getNode');
    const errorMessage = getErrorMessage(error) || t('保存失败，请稍后重试');
    globalShowToast(errorMessage, 'error');
    return { status: 'failed', error: errorMessage };
  }

  const projectId = fileInfo.projectId;
  if (projectId) {
    try {
      if (
        !(await deps.permissions.hasProjectPermission(projectId, 'CAD_SAVE'))
      ) {
        globalShowToast(t('您没有保存图纸的权限'), 'error');
        return { status: 'failed', error: t('您没有保存图纸的权限') };
      }
    } catch (error) {
      const errorMessage =
        getErrorMessage(error) || t('权限检查失败，请稍后重试');
      globalShowToast(errorMessage, 'error');
      return { status: 'failed', error: errorMessage };
    }
  }

  const { fileId, name, expectedTimestamp } = fileInfo;
  const commitMessage = await showSaveConfirmDialog();
  if (commitMessage === null) return { status: 'cancelled' };

  showGlobalLoading(t('正在保存文件...'));

  const savedFile = await saveCurrentDrawingToBlob(name);

  setLoadingMessage(t('正在上传到服务器...'));

  try {
    const filename = savedFile.filename.replace(/\.[^/.]+$/, '') + '.mxweb';
    await saveMxwebToNode(
      {
        nodeId: fileId,
        blob: savedFile.blob,
        filename,
        commitMessage: commitMessage || undefined,
        expectedTimestamp: expectedTimestamp || undefined,
        errorMessageFallback: t('上传失败，请稍后重试'),
      },
      deps
    );
  } catch (uploadError) {
    handleError(uploadError, 'mxcadManager: saveToCurrentFile upload');
    hideGlobalLoading();
    globalShowToast(
      uploadError instanceof Error
        ? uploadError.message
        : t('上传失败，请稍后重试'),
      'error'
    );
    return { status: 'failed', error: String(uploadError) };
  }

  try {
    const fileInfoResponse = await deps.sdk.getNode(fileId);
    // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因，
    // 否则 updatedAt 缓存静默不更新，下次保存 expectedTimestamp 陈旧可能并发冲突
    if (fileInfoResponse.error) throw fileInfoResponse.error;
    const updatedNode = fileInfoResponse.data;
    if (updatedNode) {
      if (updatedNode.updatedAt && getFileInfo()) {
        patchSession({
          updatedAt: updatedNode.updatedAt,
          expectedTimestamp: updatedNode.updatedAt,
        });
      }
      if (updatedNode.path) {
        const basePath = `/api/v1/mxcad/filesData/${updatedNode.path}`;
        const timestamp = updatedNode.updatedAt
          ? new Date(updatedNode.updatedAt).getTime()
          : Date.now();
        const newCachePath = `${basePath}?t=${timestamp}`;
        await writeFileCacheToIndexedDB(basePath, newCachePath, savedFile.data);
      }
    }
  } catch (cacheError) {
    handleError(cacheError, 'mxcadManager: updateLocalCache');
  }

  await processPendingImages();

  try {
    if (fileId) {
      const imageData = await generateThumbnail();
      if (imageData) await uploadThumbnail(fileId, imageData);
    }
  } catch (error) {
    handleError(error, 'mxcadManager: saveToCurrentFile thumbnail');
  }

  setModified(false);
  hideGlobalLoading();
  globalShowToast(t('文件保存成功'), 'success');
  return { status: 'saved' };
}

/** 保存到资源库节点（drawing / block），含路径兜底、上传落库、缓存与缩略图 */
export async function saveLibraryFile(
  fileInfo: CurrentFileInfo,
  deps: SaveFileDeps
): Promise<SaveFileOutcome> {
  const { fileId, name, libraryKey, expectedTimestamp } = fileInfo;
  let { path: nodePath } = fileInfo;
  const commitMessage = '';

  if (!libraryKey) {
    globalShowToast(t('保存失败：未知的资源库类型'), 'error');
    return { status: 'failed', error: t('保存失败：未知的资源库类型') };
  }

  if (!nodePath) {
    try {
      const nodeResponse = await deps.sdk.getLibraryNode(fileId, libraryKey);
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出
      // 避免被误报为"缺少文件路径信息"，掩盖真实原因（无权限等）
      if (nodeResponse.error) throw nodeResponse.error;
      const node = nodeResponse.data;
      if (node) {
        nodePath = node.path ?? undefined;
        if (nodePath) {
          patchSession({ path: nodePath });
        }
      }
    } catch (error) {
      handleError(error, 'mxcadManager: saveLibraryFile getNodePath');
    }
  }

  if (!nodePath) {
    globalShowToast(t('保存失败：缺少文件路径信息'), 'error');
    return { status: 'failed', error: t('保存失败：缺少文件路径信息') };
  }

  showGlobalLoading(t('正在保存文件...'));

  const savedFile = await saveCurrentDrawingToBlob(name);

  try {
    setLoadingMessage(t('正在上传到服务器...'));
    await saveMxwebToNode(
      {
        nodeId: fileId,
        blob: savedFile.blob,
        filename: `${libraryKey}.mxweb`,
        commitMessage: commitMessage || '',
        expectedTimestamp: expectedTimestamp || undefined,
        errorMessageFallback: t('保存失败'),
      },
      deps
    );

    const basePath =
      libraryKey === 'drawing'
        ? `/api/v1/library/drawing/filesData/${nodePath}`
        : `/api/v1/library/block/filesData/${nodePath}`;

    const updatedAt = await getNodeUpdatedAt(fileId, libraryKey, deps);
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    const newCachePath = `${basePath}?t=${timestamp}`;
    await writeFileCacheToIndexedDB(basePath, newCachePath, savedFile.data);

    await processPendingImages();

    try {
      if (fileId) {
        const imageData = await generateThumbnail(true);
        if (imageData) await uploadThumbnail(fileId, imageData);
      }
    } catch (error) {
      handleError(error, 'mxcadManager: saveLibraryFile thumbnail');
    }

    setModified(false);
    hideGlobalLoading();
    globalShowToast(t('文件保存成功'), 'success');
    return { status: 'saved' };
  } catch (error) {
    handleError(error, 'mxcadManager: saveLibraryFile');
    hideGlobalLoading();
    const errorMessage = getErrorMessage(error) || t('保存失败，请稍后重试');
    globalShowToast(errorMessage, 'error');
    return { status: 'failed', error: errorMessage };
  }
}

async function getNodeUpdatedAt(
  nodeId: string,
  libraryKey: 'drawing' | 'block',
  deps: SaveFileDeps
): Promise<string | null> {
  try {
    const response = await deps.sdk.getLibraryNode(nodeId, libraryKey);
    if (response.error) throw response.error;
    return response.data?.updatedAt || null;
  } catch (error) {
    handleError(error, 'mxcadManager: getNodeUpdatedAt');
    return null;
  }
}
