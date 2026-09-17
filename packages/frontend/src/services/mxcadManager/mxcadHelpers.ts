import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { isAuthenticated } from '../../utils/authCheck';
import { isAccessTokenExpired } from '../../utils/tokenUtils';
import { cancelLoginRedirect } from '../../config/clientSetup';
import { t } from '@/languages';
import { showGlobalLoading, hideGlobalLoading } from '../loadingService';
import { handleError } from '@/utils/errorHandler';
import { MxCpp } from 'mxcad';
import { globalShowToast } from '../../utils/notificationEvents';
import { projectControllerGetPersonalSpace } from '@/api-sdk';
import { CAD_EVENTS } from '@/constants/events';
import { emit } from '../drawingSession';
import { createDefaultPermissionQuerier } from './saveDefaults';

export function getFileInfo() {
  return useCADEditorStore.getState().currentFileInfo;
}

export function formatEditorFileName(fileName: string): string {
  const isLoggedIn = isAuthenticated();
  const { isInCollaboration } = useCADEditorStore.getState();
  const prefixes: string[] = [];
  if (isInCollaboration) prefixes.push(t('[协同中]'));
  if (!isLoggedIn) prefixes.push(t('[未登录]'));
  if (fileName === 'empty_template.mxweb' || fileName === 'empty.mxweb')
    return prefixes.join(' - ');
  if (prefixes.length === 0) return ` - ${fileName}`;
  return `${prefixes.join(' - ')} - ${fileName}`;
}

/**
 * 显式设置编辑器标题（mxcad-app 插件上下文 fileName.value，编辑器标题栏/标签页
 * 显示的唯一入口）。成功路径由 handleOpenCompleteSideEffects / refreshFileName 调用；
 * 打开失败时引擎会把 currentFileName 置为 URL 尾部的 mxweb 内部访问文件名
 * （如 <md5>.dwg.mxweb?t=...），需用本函数修正为图纸名。
 */
export function setEditorFileName(fileName: string): void {
  try {
    globalThis.MxPluginContext.useFileName().fileName.value =
      formatEditorFileName(fileName);
  } catch (error) {
    console.error('[setEditorFileName] 刷新文件名失败:', error);
  }
}

export function refreshFileName() {
  // currentFileInfo（openSession 写入）优先；协同 auto-join 不经过 openSession，
  // 用 currentFileName（patchSession/pendingJoinWorkIdRef effect 写入）兜底
  const fileName =
    getFileInfo()?.name ||
    useCADEditorStore.getState().currentFileName ||
    '';
  setEditorFileName(fileName);
}

/**
 * 打开失败后的标题修正（mxcad-app 内部会把标题显示成 mxweb 内部访问文件名，
 * 即引擎 currentFileName = 打开 URL 尾部，如 <md5>.dwg.mxweb?t=...）：
 * - 已有当前文件（切换打开失败）：恢复当前文件标题，不记录失败图纸状态
 * - 无当前文件（首次进入失败）：显示目标图纸名而非内部文件名
 */
export function restoreEditorTitle(failedFileName?: string): void {
  if (getFileInfo()) {
    refreshFileName();
  } else if (failedFileName) {
    setEditorFileName(failedFileName);
  }
}

export async function saveCurrentDrawingToBlob(fileName: string): Promise<{
  blob: Blob;
  data: ArrayBuffer | Uint8Array;
  filename: string;
}> {
  const name = fileName || 'untitled';
  showGlobalLoading(t('正在保存文件...'));
  const savedFile = await new Promise<{
    blob: Blob;
    data: ArrayBuffer | Uint8Array;
    filename: string;
  }>((resolve, reject) => {
    MxCpp.App.getCurrentMxCAD().saveFile(
      name,
      (data) => {
        try {
          const isSafari = /^((?!chrome|android).)*safari/i.test(
            navigator.userAgent
          );
          const blob = new Blob([data.buffer], {
            type: isSafari
              ? 'application/octet-stream'
              : 'application/octet-binary',
          });
          resolve({ blob, data, filename: name });
        } catch (e) {
          reject(e);
          console.error('保存文件失败', e);
        }
      },
      false,
      false,
      undefined
    );
  });
  hideGlobalLoading();
  return savedFile;
}

export async function getPersonalSpaceId(): Promise<string | null> {
  const cached = () => useFileSystemStore.getState().personalSpaceId;
  try {
    const response = await projectControllerGetPersonalSpace();
    // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
    if (response.error) throw response.error;
    const personalSpaceId = response.data?.id || null;
    if (personalSpaceId) {
      // 成功结果同步进本地缓存，供后续请求偶发失败时回退
      if (cached() !== personalSpaceId) {
        useFileSystemStore.getState().setPersonalSpaceId(personalSpaceId);
      }
      return personalSpaceId;
    }
    return cached();
  } catch (error) {
    handleError(error, 'mxcadManager: getPersonalSpaceId');
    // 网络抖动/瞬时故障时回退本地缓存，避免保存链路把"我的图纸"
    // 误判为未知归属而静默弹出另存为（历史偶发 bug）
    return cached();
  }
}

export async function showSaveAsDialog(
  personalSpaceId: string | null,
  fileName: string,
  sourceFileHash?: string
) {
  const name = fileName || 'untitled';
  const savedFile = await saveCurrentDrawingToBlob(name);
  const fileInfo = getFileInfo();
  emit(CAD_EVENTS.SAVE_AS, {
    currentFileName: name,
    mxwebBlob: savedFile.blob,
    personalSpaceId,
    sourceNodeId: fileInfo?.fileId || null,
    sourceFileHash: sourceFileHash || null,
  });
}

/**
 * 另存为（云图）统一入口。返回是否实际打开了另存为窗口。
 *
 * 项目图纸门控：无 CAD_SAVE 权限 = 无另存为权限，拒绝并提示（fail-closed），
 * 不打开另存为窗口。不受门控的图纸：
 * - 公开分享图纸 / 本地打开图纸（无 projectId）
 * - 资源库文件（libraryKey）：projectId 是库节点 ID（库根/库文件夹）而非项目，
 *   归属公开资源库，按库权限体系处理（无库权限即可另存为）
 */
export async function triggerSaveAs(): Promise<boolean> {
  const fileInfo = getFileInfo();
  const fileName = fileInfo?.name || 'untitled';

  if (!isAuthenticated() || isAccessTokenExpired()) {
    cancelLoginRedirect();
    await showSaveAsDialog(null, fileName);
    return true;
  }

  // 新图纸打开中：会话仍持上一张图纸的 fileInfo，另存为 blob 会是新图纸内容
  // 而归属信息是旧图纸——拒绝。动态导入避免与门面（mxcadManager.ts 反向
  // import 本模块的 getFileInfo）形成模块初始化期循环
  const { mxcadManager } = await import('./mxcadManager');
  if (mxcadManager.hasPendingOpen()) {
    globalShowToast(t('图纸正在打开，请稍后再保存'), 'warning');
    return false;
  }

  if (fileInfo?.projectId && !fileInfo.libraryKey) {
    try {
      const hasSavePermission = await createDefaultPermissionQuerier()
        .hasProjectPermission(fileInfo.projectId, 'CAD_SAVE');
      if (!hasSavePermission) {
        globalShowToast(t('您没有保存图纸的权限'), 'warning');
        return false;
      }
    } catch (error) {
      handleError(error, 'mxcadManager: triggerSaveAs project permission check');
      globalShowToast(t('权限检查失败，请稍后重试'), 'warning');
      return false;
    }
  }

  let personalSpaceId: string | null = null;
  try {
    personalSpaceId = await getPersonalSpaceId();
  } catch {
    globalShowToast(t('登录状态可能已过期，请保存到本地或重新登录'), 'warning');
  }
  await showSaveAsDialog(personalSpaceId, fileName);
  return true;
}
