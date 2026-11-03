import { t } from '@/languages';
import { UrlHelper } from '@/utils/mxcadUtils';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { getModified } from '../drawingSession';
import { mxcadManager } from './mxcadManager';
import { waitForFileReady } from './openDrawing';
import { generateThumbnail, uploadThumbnail } from './mxcadThumbnail';
import type { CurrentFileInfo } from './mxcadTypes';

/**
 * 后台渲染缩略图（分享管理页路径 B）
 *
 * 分享管理页没有「当前图纸在屏」的前提，缩略图只能靠隐藏的底层 CAD 编辑器
 * 打开目标 mxweb 后出图。本模块只在编辑器已被访问过（mxcad-app 已挂载）时工作：
 * CADEditorDirect 是全局底层叠加层，首次访问 /cad-editor 后永久挂载——
 * 这是「CAD 编辑器始终在底层」的前提，未挂载时无法凭空建出引擎容器。
 *
 * 安全约束（防止静默替换引擎文档造成数据丢失）：
 *  - 编辑器有未保存改动（getModified）→ 拒绝
 *  - 正在协同（collabPhase !== 'idle'）→ 拒绝
 *  - 引擎未初始化 → 拒绝（提示先打开一次编辑器）
 *
 * 本模块绕过 openDrawing 的 guardBeforeOpen（确认弹窗）与全局 loading 遮罩，
 * 因为这是静默后台出图而非用户主动打开图纸；但引擎打开本身仍走
 * mxcadManager.openFile 的唯一实现（ADR-0084：动图纸必须走引擎命令 + 串行队列，
 * 不裸调 __openWebFile__）。
 *
 * @param nodeId 云端节点 ID
 * @returns 缩略图 DataURL（已上传后端供复用）
 */
export async function renderShareThumbnailInBackground(
  nodeId: string
): Promise<string> {
  // 1. 安全守卫：不替换脏文档 / 协同文档
  if (getModified()) {
    throw new Error(t('当前图纸有未保存的修改，请先保存后再生成分享图片'));
  }
  const phase = useCADEditorStore.getState().collabPhase;
  if (phase !== 'idle') {
    throw new Error(t('协同编辑进行中，暂不能生成分享图片'));
  }

  // 2. 引擎必须已挂载（底层编辑器已被访问过）。无视图且无初始化进行中
  //    说明 CADEditorDirect 尚未挂载，无法凭空建容器出图。
  if (!mxcadManager.getCurrentView() && !mxcadManager.getInitPromise()) {
    throw new Error(t('请先打开一次图纸，再生成分享图片'));
  }
  const ready = await mxcadManager.ensureEngineReady();
  if (!ready) {
    throw new Error(t('CAD 引擎未就绪，请稍后重试'));
  }

  // 3. 等待节点转换就绪（复用 openDrawing 的轮询：120×2s=240s）
  const fileInfo = await waitForFileReady(nodeId);
  if (!fileInfo) {
    throw new Error(t('文件转换未完成，请稍后重试'));
  }

  // 4. 引擎打开（唯一实现，含串行排队 + 60s 超时 + 失败回滚）
  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  await mxcadManager.openFile({
    url: mxcadFileUrl,
    fileInfo: {
      fileId: nodeId,
      parentId: fileInfo.parentId || null,
      projectId: null,
      name: fileInfo.name,
      personalSpaceId: useFileSystemStore.getState().personalSpaceId,
    } satisfies CurrentFileInfo,
  });

  // 5. 出图并上传（供后台复用，后续分享管理页直接取后端缩略图）
  const dataUrl = await generateThumbnail();
  if (!dataUrl) {
    throw new Error(t('缩略图生成失败，请重试'));
  }
  await uploadThumbnail(nodeId, dataUrl);
  return dataUrl;
}
