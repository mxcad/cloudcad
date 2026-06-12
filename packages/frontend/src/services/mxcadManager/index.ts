///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * MxCAD Manager — 组装层
 *
 * 此模块作为 mxcadManager 的统一入口，从各子模块重新导出所有公共 API，
 * 并包含未被子模块覆盖的核心逻辑：MxCADManager 类、命令处理、文件上传等。
 */

import { Z_LAYERS } from '@/constants/layers';

// ==================== 从子模块重新导出 ====================

export {
  escapeHtml,
} from '@/utils/sanitize';

export {
  type CurrentFileInfo,
  type PendingImage,
  type UploadTargetInfo,
  type FileReadyInfo,
  CSS_CLASSES,
  DEFAULT_MESSAGES,
  FILE_UPLOAD_CONFIG,
  FILE_OPEN_RETRY_CONFIG,
  THUMBNAIL_CONFIG,
} from './mxcadTypes';

export { saveMxwebToNode, showSaveConfirmDialog } from './mxcadSave';
export type { SaveMxwebParams } from './mxcadSave';

export { checkThumbnail, uploadThumbnail, dataURLtoBlob, generateThumbnail } from './mxcadThumbnail';

export { uploadExtReferenceImage, checkExtReferenceImages, resolveExtReferenceUrl } from './mxcadExtRef';
export type { ExtRefUploadParams, ExtRefUploadResult } from './mxcadExtRef';

export { checkDuplicateFile, showDuplicateFileDialog } from './mxcadCheck';
export type { DuplicateCheckResult } from './mxcadCheck';

// ==================== 从子模块导入（内部使用） ====================

import { CSS_CLASSES, DEFAULT_MESSAGES, FILE_UPLOAD_CONFIG, FILE_OPEN_RETRY_CONFIG, THUMBNAIL_CONFIG } from './mxcadTypes';
import type { CurrentFileInfo, PendingImage } from './mxcadTypes';
import { showSaveConfirmDialog as _showSaveConfirmDialog } from './mxcadSave';
import { showDuplicateFileDialog as _showDuplicateFileDialog } from './mxcadCheck';
import { checkDuplicateFile as _checkDuplicateFile } from './mxcadCheck';


import { escapeHtml } from '@/utils/sanitize';

// ==================== 外部依赖 ====================
// @ts-ignore
import "mxcad-app/style"
import { MxCADView, store } from 'mxcad-app';
import { mxCadControllerCheckFileExist, thumbnailControllerCheckThumbnail, thumbnailControllerUploadThumbnail, fileSystemControllerCheckProjectPermission, mxCadControllerUploadExtReferenceImage, publicFileControllerConvertAndDownload } from '@/api-sdk';
import { fileSystemControllerGetNode, fileSystemControllerGetRootNode, fileSystemControllerGetPersonalSpace } from '@/api-sdk';
import { libraryControllerGetDrawingNode, libraryControllerGetBlockNode, saveControllerSaveMxwebToNode } from '@/api-sdk';
import { MxFun } from 'mxdraw';
import { FetchAttributes, McGePoint3d, MxCpp, saveAsFileDialog } from 'mxcad';
import { calculateFileHash } from '../../utils/hashUtils';
import { uploadMxCadFile } from '../../utils/mxcadUploadUtils';
import { UrlHelper } from '@/utils/mxcadUtils';
import { StoragePathConstants } from '@/constants/storage.constants';
import { globalShowToast, globalShowThreeButtonConfirm } from '../../contexts/NotificationContext';
import { successOnce } from '../../utils/message';
import { isAuthenticated } from '../../utils/authCheck';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { isAccessTokenExpired } from '../../utils/tokenUtils';
import { cancelLoginRedirect } from '../../config/clientSetup';
import { handleError } from '@/utils/errorHandler';
import { showGlobalLoading, hideGlobalLoading, setLoadingMessage, setLoadingProgress } from '../../utils/loadingUtils';
import { APP_COOPERATE_URL } from '@/constants/appConfig';


// ==================== 辅助函数 ====================

/**
 * 生成 CAD 编辑器标题显示的文件名
 * 根据用户登录状态添加前缀
 * @param fileName 原始文件名
 * @returns 格式化后的文件名（未登录时添加 [未登录] 前缀，empty_template.mxweb 不显示文件名）
 */
function formatEditorFileName(fileName: string): string {
  const isLoggedIn = isAuthenticated();
  const { isInCollaboration } = useCADEditorStore.getState();
  const prefixes: string[] = [];

  if (isInCollaboration) prefixes.push('[协同中]');
  if (!isLoggedIn) prefixes.push('[未登录]');

  if (fileName === 'empty_template.mxweb' || fileName === 'empty.mxweb') {
    return prefixes.join(' - ');
  }

  if (prefixes.length === 0) return ` - ${fileName}`;

  return `${prefixes.join(' - ')} - ${fileName}`;
}

// ==================== 全局状态 ====================

// 当前打开的文件信息（用于返回逻辑）
let currentFileInfo: {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  path?: string; // 文件路径
  personalSpaceId?: string | null; // 私人空间 ID，用于判断是否为私人空间模式
  libraryKey?: 'drawing' | 'block'; // 公共资源库标识
  fromPlatform?: boolean; // 是否从平台跳转进入
  fromShare?: boolean; // 是否来自分享链接
  updatedAt?: string; // 乐观锁时间戳
  expectedTimestamp?: string;
} | null = null;

// 私人空间 ID 缓存（用于判断文件是否属于私人空间）
let cachedPersonalSpaceId: string | null = null;

// 文档修改状态跟踪
let documentModified = false;

let pendingImages: PendingImage[] = [];

// 标记是否正在离开页面（用于抑制 beforeunload 二次弹窗）
const isLeavingPageRef = { current: false };

/**
 * 检查文档是否有未保存的修改
 * 尝试从 MxCAD SDK 获取修改状态，如果不可用则使用本地跟踪状态
 */
export function isDocumentModified(): boolean {
  // 本地跟踪状态
  return documentModified;
}

/**
 * 设置文档修改状态
 * @param modified 是否已修改
 */
export function setDocumentModified(modified: boolean): void {
  documentModified = modified;
}

/**
 * 重置文档修改状态（打开新文件或保存后调用）
 */
export function resetDocumentModified(): void {
  documentModified = false;
}

/**
 * 设置浏览器关闭保护
 * 当文档有未保存的更改时，阻止用户关闭浏览器标签页或窗口
 */
function setupBeforeUnloadHandler(): void {
  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    // 退出当前协同会话
    exitCollaborationIfNeeded();

    // 如果正在主动离开页面（已弹过确认），跳过二次弹窗
    if (isLeavingPageRef.current) {
      e.returnValue = '';
      return;
    }
    if (isDocumentModified()) {
      // 标准做法：设置 returnValue 并返回提示文本
      e.preventDefault();
      e.returnValue = '您有未保存的更改，确定要离开吗？';
      return e.returnValue;
    }
    // 没有修改时，删除 returnValue（某些浏览器需要）
    e.returnValue = '';
  });
}

// 在模块加载时自动启用浏览器关闭保护
setupBeforeUnloadHandler();

/**
 * 退出当前协同会话（如果存在）
 * 在打开新文件或页面关闭前调用
 */
function exitCollaborationIfNeeded(): void {
  try {
    const { isInCollaboration } = useCADEditorStore.getState();
    if (!isInCollaboration) return;

    const mxCAD = MxCpp.getCurrentMxCAD();
    if (!mxCAD) return;
    const cooperate = mxCAD.getCooperate();
    if (!cooperate) return;

    cooperate.init({ server_addres: APP_COOPERATE_URL });
    const ret = cooperate.exitWrok();
    if (ret === 0) {
      useCADEditorStore.getState().setCollaborationState({
        isInCollaboration: false,
        workId: null,
      });
      refreshFileName();
    }
  } catch {
    // best-effort
  }
}

/**
 * 显示未保存更改确认对话框
 * @returns Promise<'save' | 'discard' | 'cancel'> 用户选择：保存、放弃更改、取消
 */
export function showUnsavedChangesDialog(): Promise<
  'save' | 'discard' | 'cancel'
> {
  return globalShowThreeButtonConfirm({
    title: '未保存的更改',
    message: '当前图纸有未保存的更改，是否保存？',
    confirmText: '保存',
    discardText: '不保存',
    cancelText: '取消',
    dialogType: 'warning',
  }).then((value) => {
    if (value === 'confirm') return 'save';
    if (value === 'discard') return 'discard';
    return 'cancel';
  });
}

/**
 * 检查是否有未保存的更改并提示用户
 * @returns Promise<boolean> 是否可以继续操作（true=可以继续，false=用户取消）
 */
export async function checkAndConfirmUnsavedChanges(): Promise<boolean> {
  if (!isDocumentModified()) {
    return true;
  }

  const choice = await showUnsavedChangesDialog();

  if (choice === 'cancel') {
    return false;
  }

  if (choice === 'save') {
    // 触发保存命令
    try {
      await MxFun.sendStringToExecute('Mx_Save');
      // 等待保存完成
      await new Promise((resolve) => setTimeout(resolve, 500));
      // 保存后检查是否还有未保存的更改
      if (isDocumentModified()) {
        // 保存可能失败或被取消
        return false;
      }
    } catch (error) {
      handleError(error, 'mxcadManager: checkAndConfirmUnsavedChanges');
      return false;
    }
  }

  // 选择"不保存"时，重置修改状态
  if (choice === 'discard') {
    resetDocumentModified();
  }

  return true;
}
/**
 * 设置私人空间 ID 缓存（由 CADEditorDirect 组件调用）
 */
export function setPersonalSpaceId(personalSpaceId: string | null) {
  cachedPersonalSpaceId = personalSpaceId;
}

// 当前打开的 mxweb 文件 URL（用于重新加载）
let currentMxwebUrl: string | null = null;

// 当前文件的缓存时间戳（用于清理旧缓存）
let currentCacheTimestamp: number | undefined = undefined;

// React Router navigate 函数（由 CADEditorDirect 组件设置）
let navigateFunction: ((path: string) => void) | null = null;

/**
 * 设置当前文件信息（由 CADEditorDirect 组件调用）
 */
export function setCurrentFileInfo(fileInfo: {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block';
  path?: string;
  fromPlatform?: boolean;
  fromShare?: boolean;
  updatedAt?: string;
}) {
  currentFileInfo = { ...fileInfo, expectedTimestamp: fileInfo.updatedAt };
  const store = useCADEditorStore.getState();
  store.setCurrentFileId(fileInfo.fileId);
  store.setCurrentFileName(fileInfo.name || null);
}

export function patchCurrentFileInfo(partial: {
  fileId?: string;
  projectId?: string | null;
  parentId?: string | null;
  name?: string;
  fromShare?: boolean;
  libraryKey?: 'drawing' | 'block';
}) {
  if (currentFileInfo) {
    if (partial.fileId !== undefined) currentFileInfo.fileId = partial.fileId;
    if (partial.projectId !== undefined) currentFileInfo.projectId = partial.projectId;
    if (partial.parentId !== undefined) currentFileInfo.parentId = partial.parentId;
    if (partial.name !== undefined) currentFileInfo.name = partial.name;
    if (partial.fromShare !== undefined) currentFileInfo.fromShare = partial.fromShare;
    if (partial.libraryKey !== undefined) currentFileInfo.libraryKey = partial.libraryKey;
  }
}

export function setCacheTimestamp(timestamp: number | undefined) {
  currentCacheTimestamp = timestamp;
}

export function setNavigateFunction(navigate: (path: string) => void) {
  navigateFunction = navigate;
}

/**
 * 清除当前文件信息和 navigate 函数
 */
export function clearCurrentFileInfo() {
  currentFileInfo = null;
  navigateFunction = null;
}

/**
 * 刷新编辑器文件名显示
 * 用于登录状态变化后更新文件名前缀（[未登录] -> 正常显示）
 */
export function refreshFileName() {
  const fileName = currentFileInfo?.name || '';
  try {
    globalThis.MxPluginContext.useFileName().fileName.value =
      formatEditorFileName(fileName);
  } catch (error) {
    console.error('[refreshFileName] 刷新文件名失败:', error);
  }
}
// ==================== 导航相关常量 ====================

/** 导航路径常量 */
const NAVIGATION_PATHS = {
  PROJECTS_LIST: '/projects',
  PROJECT_FILES: (projectId: string) => `/projects/${projectId}/files`,
  PROJECT_FOLDER: (projectId: string, parentId: string) =>
    `/projects/${projectId}/files/${parentId}`,
  // 私人空间路径
  PERSONAL_SPACE: '/personal-space',
  PERSONAL_SPACE_FOLDER: (parentId: string) => `/personal-space/${parentId}`,
  // 公开资源库路径
  LIBRARY_DRAWING: '/library/drawing',
  LIBRARY_BLOCK: '/library/block',
  LIBRARY_DRAWING_FOLDER: (parentId: string) => `/library/drawing/${parentId}`,
  LIBRARY_BLOCK_FOLDER: (parentId: string) => `/library/block/${parentId}`,
} as const;

// ==================== 导航辅助函数 ====================

/**
 * 执行导航
 * @param path 目标路径
 */
function navigateTo(path: string): void {
  if (navigateFunction) {
    navigateFunction(path);
  } else {
    // 如果 navigateFunction 不存在，使用 window.location.href 进行导航
    window.location.href = path;
  }
}

function navigateToProjectsList(): void {
  navigateTo(NAVIGATION_PATHS.PROJECTS_LIST);
}

function calculateReturnPath(
  parentId: string | null | undefined,
  projectId: string | null | undefined,
  personalSpaceId: string | null | undefined,
  libraryKey: 'drawing' | 'block' | null | undefined
): string {
  // 公开资源库模式（优先判断）
  if (libraryKey === 'drawing') {
    if (parentId) {
      return NAVIGATION_PATHS.LIBRARY_DRAWING_FOLDER(parentId);
    }
    return NAVIGATION_PATHS.LIBRARY_DRAWING;
  }
  if (libraryKey === 'block') {
    if (parentId) {
      return NAVIGATION_PATHS.LIBRARY_BLOCK_FOLDER(parentId);
    }
    return NAVIGATION_PATHS.LIBRARY_BLOCK;
  }

  // 判断是否为私人空间模式：projectId 等于 personalSpaceId
  const isPersonalSpace =
    projectId && personalSpaceId && projectId === personalSpaceId;

  if (isPersonalSpace) {
    // 私人空间模式
    if (parentId && parentId !== personalSpaceId) {
      // 返回到私人空间的子文件夹
      return NAVIGATION_PATHS.PERSONAL_SPACE_FOLDER(parentId);
    }
    // 返回到私人空间根目录
    return NAVIGATION_PATHS.PERSONAL_SPACE;
  }

  // 项目模式
  if (parentId && projectId) {
    return NAVIGATION_PATHS.PROJECT_FOLDER(projectId, parentId);
  } else if (parentId) {
    return NAVIGATION_PATHS.PROJECT_FILES(parentId);
  } else if (projectId) {
    return NAVIGATION_PATHS.PROJECT_FILES(projectId);
  }
  return NAVIGATION_PATHS.PROJECTS_LIST;
}

/**
 * 返回到上一页面（云图管理/项目文件列表）
 * 1. 隐藏编辑器
 * 2. 检查未保存更改（用户取消则恢复显示）
 * 3. 根据当前文件信息计算返回路径并导航
 */
const checkToReturnToPreviousPage = async () => {
  // 先隐藏编辑器
  mxcadManager.showMxCAD(false);

  // 检查是否有未保存的更改
  const canProceed = await checkAndConfirmUnsavedChanges();
  if (!canProceed) {
    // 用户取消了操作，重新显示编辑器
    mxcadManager.showMxCAD(true);
    return;
  }

  // 禁用离开确认对话框（正在主动离开页面，避免 beforeunload 二次弹窗）
  isLeavingPageRef.current = true;

  // 根据当前文件信息计算返回路径并导航
  try {
    if (!currentFileInfo) {
      navigateToProjectsList();
    } else {
      const targetPath = calculateReturnPath(
        currentFileInfo.parentId,
        currentFileInfo.projectId,
        currentFileInfo.personalSpaceId,
        currentFileInfo.libraryKey
      );
      navigateTo(targetPath);
    }
  } catch (error) {
    handleError(error, 'mxcadManager: checkToReturnToPreviousPage');
    navigateToProjectsList();
  }
};

/**
 * 返回到云图管理（直接调用，不依赖命令注册）
 * 1. 隐藏编辑器
 * 2. 检查未保存更改，根据当前文件信息计算返回路径并导航
 */
export const returnToCloudMapManagement = () => {
  mxcadManager.showMxCAD(false);

  checkToReturnToPreviousPage();
};

// 获取或创建文件选择器（复用 useMxCadUploadNative 的逻辑）
const getFilePicker = (): HTMLInputElement => {
  let picker = document.getElementById(
    FILE_UPLOAD_CONFIG.FILE_PICKER_ID
  ) as HTMLInputElement;
  if (!picker) {
    picker = document.createElement('input');
    picker.id = FILE_UPLOAD_CONFIG.FILE_PICKER_ID;
    picker.type = 'file';
    picker.accept = FILE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS;
    picker.style.display = 'none';
    document.body.appendChild(picker);
  }
  return picker;
};


/**
 * 获取上传目标节点 ID
 * 根据当前打开的文件所属空间决定上传目标：
 * - 未打开任何文件 → 上传到私人空间根目录
 * - 当前文件属于私人空间 → 上传到父目录（或根目录）
 * - 当前文件属于项目 → 上传到私人空间根目录
 * @throws {Error} 如果无法获取私人空间
 */
async function getUploadTargetNodeId(): Promise<string> {
  // 1. 获取私人空间
  const personalSpaceResponse = await fileSystemControllerGetPersonalSpace();
  const personalSpace = personalSpaceResponse.data;

  if (!personalSpace?.id) {
    throw new Error('无法获取私人空间，请联系管理员');
  }

  // 2. 判断当前是否打开了文件
  const currentProjectId = currentFileInfo?.projectId;

  if (!currentProjectId) {
    // 未打开任何文件 → 上传到私人空间根目录
    return personalSpace.id;
  }

  // 3. 判断当前文件是否属于私人空间
  if (currentProjectId === personalSpace.id) {
    // 当前文件属于私人空间 → 上传到父目录（或根目录）
    return currentFileInfo?.parentId || personalSpace.id;
  } else {
    // 当前文件属于项目 → 上传到私人空间根目录
    return personalSpace.id;
  }
}

/**
 * 获取项目 ID
 * @param uploadTargetNodeId 上传目标节点 ID
 * @param fileInfo 文件信息
 * @returns 项目 ID
 */
async function getProjectId(
  uploadTargetNodeId: string,
  fileInfo: { parentId?: string },
  newNodeId: string
): Promise<string> {
  let projectId = uploadTargetNodeId;

  if (currentFileInfo?.projectId) {
    projectId = currentFileInfo.projectId;
  } else if (fileInfo.parentId) {
    try {
      const rootResponse = await fileSystemControllerGetRootNode({ path: { nodeId: newNodeId } });
      if (rootResponse.data?.id) {
        projectId = rootResponse.data.id;
      }
    } catch (error) {
      handleError(error, 'mxcadManager: getProjectId');
    }
  }

  return projectId;
}

/**
 * 等待文件转换完成（轮询检查）
 * @param nodeId 节点 ID
 * @param maxAttempts 最大尝试次数
 * @param intervalMs 检查间隔（毫秒）
 * @returns 文件信息，如果超时返回 null
 */
export async function waitForFileReady(
  nodeId: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<{
  fileHash: string;
  path: string;
  name: string;
  parentId: string;
} | null> {
  setLoadingProgress(0);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fileInfoResponse = await fileSystemControllerGetNode({ path: { nodeId } });
    const fileInfo = fileInfoResponse.data;

    if (!fileInfo) return null;

    if (fileInfo.fileHash && fileInfo.path) {
      return {
        fileHash: fileInfo.fileHash,
        path: fileInfo.path,
        name: fileInfo.name,
        parentId: fileInfo.parentId || '',
      };
    }

    if (attempt < maxAttempts) {
      setLoadingMessage(`文件转换中，请稍候... (${attempt}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}

/**
 * 打开已上传的文件
 * @param newNodeId 节点 ID
 * @param uploadTargetNodeId 上传目标节点 ID
 */
export async function openUploadedFile(
  newNodeId: string,
  uploadTargetNodeId: string
): Promise<void> {
  exitCollaborationIfNeeded();
  setLoadingMessage(DEFAULT_MESSAGES.OPENING_FILE);

  // 等待文件转换完成
  const fileInfo = await waitForFileReady(newNodeId);

  if (!fileInfo) {
    hideGlobalLoading();
    throw new Error('文件转换未完成，请稍后在文件列表中查看');
  }

  const projectId = await getProjectId(uploadTargetNodeId, fileInfo, newNodeId);

  setCurrentFileInfo({
    fileId: newNodeId,
    parentId: fileInfo.parentId || uploadTargetNodeId,
    projectId,
    name: fileInfo.name,
    personalSpaceId: cachedPersonalSpaceId,
  });

  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  await mxcadManager.openFile(mxcadFileUrl);

  // 派发文件打开事件，通知 URL 更新
  window.dispatchEvent(
    new CustomEvent('mxcad-file-opened', {
      detail: {
        fileId: newNodeId,
        parentId: fileInfo.parentId || uploadTargetNodeId,
        projectId,
        fileName: fileInfo.name,
      },
    })
  );
}

/**
 * 打开图纸库文件（公共资源库）
 * 支持检查当前文档修改状态后打开
 * @param nodeId 图纸库节点 ID
 * @param fileName 文件名
 * @param nodePath 节点路径（格式：YYYYMM/nodeId/fileHash.dwg.mxweb）
 * @param updatedAt 文件更新时间戳（用于缓存破坏）
 * @returns Promise<void>
 */
export async function openLibraryDrawing(
  nodeId: string,
  fileName?: string,
  nodePath?: string,
  updatedAt?: string
): Promise<void> {
  try {
    exitCollaborationIfNeeded();

    // 1. 检查当前文档是否有未保存的修改
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      // 用户取消或保存失败，不继续打开新文件
      return;
    }

    // 2. 如果没有传入 fileName 和 nodePath，从 API 获取
    let finalFileName = fileName;
    let finalNodePath = nodePath;
    let finalUpdatedAt = updatedAt;

    if (!finalFileName || !finalNodePath) {
      const nodeResponse = await libraryControllerGetDrawingNode({ path: { nodeId } });
      const node = nodeResponse.data;
      if (!node) {
        throw new Error('无法获取图纸库文件信息');
      }
      finalFileName = finalFileName || node.name;
      finalNodePath = finalNodePath || node.path;
      finalUpdatedAt = finalUpdatedAt || node.updatedAt;
    }

    // 确保 finalNodePath 有值
    if (!finalNodePath) {
      throw new Error('无法获取文件路径');
    }

    // 确保 finalFileName 有值
    if (!finalFileName) {
      throw new Error('无法获取文件名');
    }

    // 3. 构建图纸库文件 URL（使用 node.path，与项目文件保持一致）
    // 添加缓存破坏时间戳参数
    let libraryFileUrl = `/api/v1/library/drawing/filesData/${finalNodePath}`;
    let cacheTimestamp: number | undefined;
    if (finalUpdatedAt) {
      cacheTimestamp = new Date(finalUpdatedAt).getTime();
      libraryFileUrl += `?t=${cacheTimestamp}`;
      setCacheTimestamp(cacheTimestamp);
    }

    // 4. 设置当前文件信息（图纸库文件没有 parentId/projectId）
    setCurrentFileInfo({
      fileId: nodeId,
      parentId: null,
      projectId: null,
      name: finalFileName,
      personalSpaceId: null,
      libraryKey: 'drawing',
      path: finalNodePath, // 保存完整路径，用于后续缓存更新
    });

    // 5. 打开文件
    await mxcadManager.openFile(libraryFileUrl);

    // 6. 派发文件打开事件
    window.dispatchEvent(
      new CustomEvent('mxcad-file-opened', {
        detail: {
          fileId: nodeId,
          parentId: null,
          projectId: null,
          fileUrl: libraryFileUrl,
          fileName: finalFileName,
          libraryKey: 'drawing',
        },
      })
    );

    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'mxcadManager: openDrawingLibraryFile');
    throw error;
  }
}

/**
 * 打开图块库文件
 */
export async function openLibraryBlock(
  nodeId: string,
  fileName?: string,
  nodePath?: string,
  updatedAt?: string
): Promise<void> {
  try {
    exitCollaborationIfNeeded();

    // 1. 检查当前文档是否有未保存的修改
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      return;
    }

    // 2. 如果没有传入 fileName 和 nodePath，从 API 获取
    let finalFileName = fileName;
    let finalNodePath = nodePath;
    let finalUpdatedAt = updatedAt;

    if (!finalFileName || !finalNodePath) {
      const nodeResponse = await libraryControllerGetBlockNode({ path: { nodeId } });
      const node = nodeResponse.data;
      if (!node) {
        throw new Error('无法获取图块库文件信息');
      }
      finalFileName = finalFileName || node.name;
      finalNodePath = finalNodePath || node.path;
      finalUpdatedAt = finalUpdatedAt || node.updatedAt;
    }

    // 确保 finalNodePath 有值
    if (!finalNodePath) {
      throw new Error('无法获取文件路径');
    }

    // 确保 finalFileName 有值
    if (!finalFileName) {
      throw new Error('无法获取文件名');
    }

    // 3. 构建图块库文件 URL
    let libraryFileUrl = `/api/v1/library/block/filesData/${finalNodePath}`;
    let cacheTimestamp: number | undefined;
    if (finalUpdatedAt) {
      cacheTimestamp = new Date(finalUpdatedAt).getTime();
      libraryFileUrl += `?t=${cacheTimestamp}`;
      setCacheTimestamp(cacheTimestamp);
    }

    // 4. 设置当前文件信息
    setCurrentFileInfo({
      fileId: nodeId,
      parentId: null,
      projectId: null,
      name: finalFileName,
      personalSpaceId: null,
      libraryKey: 'block',
      path: finalNodePath, // 保存完整路径，用于后续缓存更新
    });

    // 5. 打开文件
    await mxcadManager.openFile(libraryFileUrl);

    // 6. 派发文件打开事件
    window.dispatchEvent(
      new CustomEvent('mxcad-file-opened', {
        detail: {
          fileId: nodeId,
          parentId: null,
          projectId: null,
          fileUrl: libraryFileUrl,
          fileName: finalFileName,
          libraryKey: 'block',
        },
      })
    );

    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'mxcadManager: openBlockLibraryFile');
    throw error;
  }
}

/**
 * 判断文件是否为 mxweb 格式
 */
function isMxwebFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return lowerFilename.endsWith('.mxweb')
}

/**
 * 判断文件是否需要转换（dwg/dxf）
 */
function isCadFile(filename: string): boolean {
  const ext = filename.toLowerCase();
  return ext.endsWith('.dwg') || ext.endsWith('.dxf') || ext.endsWith('.mxweb')
}

/**
 * 直接打开本地 mxweb 文件
 * 通过计算文件 hash，将文件数据写入 IndexedDB，构造虚拟 URL 让 WASM 从 IndexedDB 读取
 * @param file mxweb 文件
 * @param noCache 是否无缓存打开（强制刷新，重新写入 IndexedDB）
 */
async function openLocalMxwebFile(file: File, noCache?: boolean): Promise<void> {
  try {
    showGlobalLoading('正在计算文件哈希...');

    // 1. 计算文件 hash
    const hash = await calculateFileHash(file);

    // 2. 构造缓存路径（同时作为 IndexedDB 的 key）
    const virtualUrl = `${StoragePathConstants.LOCAL_MXWEB_CACHE_PREFIX}/${hash}${StoragePathConstants.MXWEB_EXTENSION}`;

    // 3. 检查 IndexedDB 中是否已有缓存
    setLoadingMessage('正在检查本地缓存...');

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('emscripten_filesystem', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    let needsWrite = true;

    if (!noCache) {
      const existingData = await new Promise<unknown>((resolve, reject) => {
        const getRequest = db.transaction(['FILES'], 'readonly')
          .objectStore('FILES')
          .get(virtualUrl);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      });
      if (existingData) {
        needsWrite = false;
      }
    }

    // 4. 如果缓存不存在或是 noCache 模式，写入 IndexedDB
    if (needsWrite) {
      setLoadingMessage('正在缓存文件...');

      const arrayBuffer = await file.arrayBuffer();
      const transaction = db.transaction(['FILES'], 'readwrite');
      const objectStore = transaction.objectStore('FILES');

      await new Promise<void>((resolve, reject) => {
        const putRequest = objectStore.put(arrayBuffer, virtualUrl);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      });
    }

    db.close();

    // 5. 通过虚拟 URL 打开文件，WASM 会从 IndexedDB 中查找该 key
    // 在打开前先设置文件名，确保 openFileComplete → onOpen 读到正确名称
    setCurrentFileInfo({
      fileId: '',
      parentId: null,
      projectId: null,
      name: file.name,
      personalSpaceId: null,
    });

    setLoadingMessage('正在打开文件...');
    await mxcadManager.openFile(virtualUrl, noCache);

    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    const errorMessage =
      error instanceof Error ? error.message : '打开文件失败';
    globalShowToast(errorMessage, 'error');
  }
}

/**
 * 上传文件（未登录用户，匿名上传）
 * @param file 要上传的文件
 * @param noCache 是否无缓存打开（强制重新上传）
 */
export async function handlePublicUpload(file: File, noCache?: boolean): Promise<void> {
  try {
    showGlobalLoading('正在计算文件哈希...');
    const hash = await calculateFileHash(file);

    // 非 noCache 模式下检查缓存（包括匿名用户）
    if (!noCache) {
      setLoadingMessage('正在检查缓存...');
      const existData = await mxCadControllerCheckFileExist({
        body: {
          fileSize: file.size,
          fileHash: hash,
          filename: file.name,
          nodeId: '',
        },
      });

      if (existData.data?.exists) {
        // ⚡ 秒传成功！直接打开已存在的文件
        hideGlobalLoading();

        const event = new CustomEvent('public-file-uploaded', {
          detail: {
            fileHash: hash,
            fileName: file.name,
            noCache: noCache,
            callback: async () => {
              try {
                showGlobalLoading('正在打开文件...');
                const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
                const mxwebFilename = `${hash}${ext}.mxweb`;
                const fileUrl = `/api/v1/public-file/access/${mxwebFilename}`;

                // 先设置文件信息，再打开文件
                // 确保文件打开完成时 currentFileInfo 已存在
                setCurrentFileInfo({
                  fileId: '',
                  parentId: null,
                  projectId: null,
                  name: file.name,
                  personalSpaceId: null,
                });

                await mxcadManager.openFile(fileUrl, noCache);

                hideGlobalLoading();
              } catch (error) {
                hideGlobalLoading();
                const errorMessage = error instanceof Error ? error.message : '文件打开失败';
                globalShowToast(errorMessage, 'error');
              }
            },
          },
        });
        window.dispatchEvent(event);
        return;
      }
    }

    // 缓存未命中，继续上传
    setLoadingMessage('正在上传文件...');
    await uploadMxCadFile({
      file,
      hash,
      nodeId: '',
      forceUpload: true, // 公开上传始终启用强制上传模式，允许 nodeId 为空
      onProgress: (percentage: number) => {
        if (percentage === 100) {
          setLoadingMessage('图纸转换中...');
        } else {
          setLoadingMessage(`正在上传文件... ${percentage.toFixed(1)}%`);
        }
      },
    });

    // 发送自定义事件，通知 CADEditorDirect 检查外部参照
    // 并等待用户完成外部参照操作后再打开文件
    hideGlobalLoading();

    const event = new CustomEvent('public-file-uploaded', {
      detail: {
        fileHash: hash,
        fileName: file.name,
        noCache: noCache,
        callback: async () => {
          try {
            showGlobalLoading('正在打开文件...');
            // 扁平存储：{hash}.{ext}.mxweb（如 abc123.dwg.mxweb），通过 accessFileByHashPattern 端点访问
            const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
            const mxwebFilename = `${hash}${ext}.mxweb`;
            const fileUrl = `/api/v1/public-file/access/${mxwebFilename}`;

            // 先设置文件信息，再打开文件
            // 确保文件打开完成时 currentFileInfo 已存在
            setCurrentFileInfo({
              fileId: '',
              parentId: null,
              projectId: null,
              name: file.name,
              personalSpaceId: null,
            });

            await mxcadManager.openFile(fileUrl, noCache);

            hideGlobalLoading();
          } catch (error) {
            hideGlobalLoading();
            const errorMessage = error instanceof Error ? error.message : '文件打开失败';
            globalShowToast(errorMessage, 'error');
          }
        }
      }
    });
    window.dispatchEvent(event);
  } catch (error) {
    hideGlobalLoading();
    const errorMessage =
      error instanceof Error ? error.message : '文件上传失败';
    globalShowToast(errorMessage, 'error');
  }
}

// ==================== openFile 命令 ====================
const openFile = async (noCache?: boolean) => {
  try {
    // 直接弹出文件选择器，不需要预先获取 uploadTargetNodeId
    const picker = getFilePicker();
    picker.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        picker.value = '';
        return;
      }

      const selectedFile = files[0];
      if (selectedFile) {
        // 检查是否为 mxweb 文件 → 直接打开
        if (isMxwebFile(selectedFile.name)) {
          await openLocalMxwebFile(selectedFile);
          picker.value = '';
          return;
        }

        // 检查是否为 CAD 文件
        if (!isCadFile(selectedFile.name)) {
          globalShowToast(
            '不支持的文件格式，请选择 .dwg、.dxf、.mxweb',
            'error'
          );
          picker.value = '';
          return;
        }

        // CAD 编辑器统一使用公开上传服务
        // 原因：CAD 编辑器通过 uploads 目录访问文件，已登录用户也走此路径以统一缓存逻辑
        await handlePublicUpload(selectedFile, noCache);
        picker.value = '';
        return;
      }
      picker.value = '';
    };

    picker.click();
  } catch (error) {
    handleError(error, 'mxcadManager: openFile');
    globalShowToast(
      error instanceof Error ? error.message : '命令执行失败',
      'error'
    );
  }
}
/**
 * openFile 命令：上传文件并打开
 * - 已登录：上传到私人空间或项目
 * - 未登录：使用公开上传服务
 */
MxFun.addCommand('openFile', () => openFile());
MxFun.addCommand('openFile_noCache', () => openFile(true));


/**
 * Mx_NewFile 命令处理函数：新建文件
 * 1. 检查是否有未保存的修改
 * 2. 调用 mxcad.newFile() 清空画布
 * 3. 更新 URL 为 /cad-editor
 * 4. 重置文件信息状态
 * 注意：此命令在 mxcad-app 初始化完成后通过 setupInitializationListener 注册
 */
const handleNewFileCommand = async () => {
  try {
    exitCollaborationIfNeeded();

    // 1. 检查是否有未保存的修改
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      return;
    }

    // 2. 预先设置文件信息为新建文件，onOpen 回调会据此更新标题栏
    currentFileInfo = {
      fileId: '',
      parentId: null,
      projectId: null,
      name: 'new.dwg',
      personalSpaceId: null,
    };
    currentMxwebUrl = null;
    currentCacheTimestamp = undefined;
    resetDocumentModified();

    // 3. 调用 mxcad.openWebFile() 清空画布
    const mxcad = MxCpp.getCurrentMxCAD();
    if (mxcad) {
      mxcad.openWebFile(new URL('../../../public/empty.mxweb', import.meta.url).href, void 0, void 0, void 0, 1)
      const { initLayerList } = store.useLayer()
      const { initColorIndexList } = store.useColor()
      const { initLineTypeList } = store.useLineType()
      initLayerList()
      initColorIndexList()
      initLineTypeList()
    }

    // 4. 更新 URL 为 /cad-editor（不带 nodeId 和其他参数）
    if (navigateFunction) {
      navigateFunction('/cad-editor');
    } else {
      // 如果 navigateFunction 未设置，使用 history API
      window.history.replaceState(null, '', '/cad-editor');
    }

    // 5. 派发新建文件事件，通知 UI 更新
    window.dispatchEvent(
      new CustomEvent('mxcad-new-file', {
        detail: {
          fileId: null,
          parentId: null,
          projectId: null,
        },
      })
    );
    successOnce("已新建空白图纸")

  } catch (error) {
    console.error('新建文件失败:', error);
    globalShowToast(
      error instanceof Error ? error.message : '新建文件失败',
      'error'
    );
  }
};


async function triggerSaveAs() {
  const fileName = currentFileInfo?.name || 'untitled';

  if (!isAuthenticated() || isAccessTokenExpired()) {
    // 未登录或 token 已过期：取消后台 401 触发的登录跳转定时器，
    // 直接保存为 mxweb blob 并触发 mxcad-save-as 事件，
    // CADEditorDirect 中未登录用户的 mxcad-save-as 处理会弹出下载格式选择框（另存为到本地）
    cancelLoginRedirect();
    await showSaveAsDialog(null, fileName);
    return;
  }

  let personalSpaceId: string | null = null;
  try {
    personalSpaceId = await getPersonalSpaceId();
  } catch {
    // 获取私人空间 ID 失败，降级为 null
    globalShowToast('登录状态可能已过期，请保存到本地或重新登录', 'warning');
  }
  await showSaveAsDialog(personalSpaceId, fileName);
}

/**
 * exportFile 命令：另存为当前 CAD 文件
 */
MxFun.addCommand('exportFile', async () => {
  await triggerSaveAs();
});

/**
 * Mx_SaveAs 命令：导出为 MXWEB 并下载到本地
 */
MxFun.addCommand('Mx_SaveAsMxWeb', async () => {
  const fileName = currentFileInfo?.name || 'untitled';
  try {
    const saved = await saveCurrentDrawingToBlob(fileName);
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
    await saveAsFileDialog({
      blob: saved.blob,
      filename: `${nameWithoutExt}.mxweb`,
      types: [{
        description: 'MXWEB 文件',
        accept: { 'application/octet-stream': ['.mxweb'] },
      }],
    });
    hideGlobalLoading();
    globalShowToast('文件已保存到本地', 'success');
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'Mx_SaveAsMxWeb');
  }
});

/**
 * Mx_ExportPDF 命令：导出为 PDF（弹出 PDF 导出参数设置框）
 */
MxFun.addCommand('Mx_ExportPDF', async () => {
  const fileName = currentFileInfo?.name || 'untitled';
  try {
    const saved = await saveCurrentDrawingToBlob(fileName);
    window.dispatchEvent(new CustomEvent('mxcad-export-pdf', {
      detail: { fileName, blob: saved.blob },
    }));
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'Mx_ExportPDF');
  }
});

/**
 * Mx_ExportDWG 命令：导出为 DWG（弹出版本选择框）
 */
MxFun.addCommand('Mx_ExportDWG', async () => {
  const fileName = currentFileInfo?.name || 'untitled';
  try {
    const saved = await saveCurrentDrawingToBlob(fileName);
    window.dispatchEvent(new CustomEvent('mxcad-export-dwg', {
      detail: { fileName, blob: saved.blob, format: 'dwg' },
    }));
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'Mx_ExportDWG');
  }
});

/**
 * Mx_ExportDXF 命令：导出为 DXF（弹出版本选择框）
 */
MxFun.addCommand('Mx_ExportDXF', async () => {
  const fileName = currentFileInfo?.name || 'untitled';
  try {
    const saved = await saveCurrentDrawingToBlob(fileName);
    window.dispatchEvent(new CustomEvent('mxcad-export-dxf', {
      detail: { fileName, blob: saved.blob, format: 'dxf' },
    }));
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'Mx_ExportDXF');
  }
});

/**
 * Mx_SaveToCloud 命令：保存到云图（直接保存）
 */
MxFun.addCommand('Mx_SaveToCloud', () => {
  MxFun.sendStringToExecute('Mx_Save');
});

/**
 * Mx_SaveAsToCloud 命令：另存为到云图（选择位置保存）
 */
MxFun.addCommand('Mx_SaveAsToCloud', async () => {
  if (!isAuthenticated() || isAccessTokenExpired()) {
    cancelLoginRedirect();
    window.dispatchEvent(
      new CustomEvent('mxcad-save-required', {
        detail: { action: '保存文件' },
      })
    );
    return;
  }
  await triggerSaveAs();
});

/**
 * Mx_ShowSidebar 命令：显示图库侧边栏
 */
MxFun.addCommand('Mx_ShowSidebar', () => {
  window.dispatchEvent(
    new CustomEvent('mxcad-open-sidebar', {
      detail: { type: 'gallery' },
    })
  );
});

// ==================== Mx_ShowCollaborate 命令 ====================

/**
 * Mx_ShowCollaborate 命令：显示协同侧边栏
 */
MxFun.addCommand('Mx_ShowCollaborate', () => {
  window.dispatchEvent(
    new CustomEvent('mxcad-open-sidebar', {
      detail: { type: 'collaborate' },
    })
  );
});

document.addEventListener(
  'keydown',
  (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      e.stopImmediatePropagation();
      // 只有这里处理，其他同元素监听器被跳过
      MxFun.removeCommand('Mx_QSave'); //删除mxcad-app内部的保存命令
      MxFun.sendStringToExecute('Mx_Save');
    }
  },
  true
); // useCapture=true 捕获阶段处理
/**
 * Mx_Save 命令：保存当前 CAD 文件
 */
MxFun.addCommand('Mx_Save', async () => {
  try {
    // 检查登录状态（同时验证 JWT 是否过期）
    const { isAuthenticated } = await import('../../utils/authCheck');
    const { isAccessTokenExpired: tokenExpired } = await import('../../utils/tokenUtils');
    if (!isAuthenticated() || tokenExpired()) {
      // 未登录或 token 已过期，触发登录提示事件
      window.dispatchEvent(
        new CustomEvent('mxcad-save-required', {
          detail: { action: '保存文件' },
        })
      );
      return;
    }

    if (!currentFileInfo) {
      // 没有打开的文件（可能是空白画布新建的文件），弹出保存弹窗
      const { isAuthenticated: authCheck } = await import('../../utils/authCheck');
      const { isAccessTokenExpired: tokenExpiredCheck } = await import('../../utils/tokenUtils');
      if (!authCheck() || tokenExpiredCheck()) {
        window.dispatchEvent(
          new CustomEvent('mxcad-save-required', {
            detail: { action: '保存文件' },
          })
        );
        return;
      }
      let personalSpaceId: string | null = null;
      try {
        personalSpaceId = await getPersonalSpaceId();
      } catch {
        // 获取私人空间 ID 失败（如 token 过期），降级为 null
        globalShowToast('登录状态可能已过期，请保存到本地或重新登录', 'warning');
      }
      await showSaveAsDialog(personalSpaceId, 'untitled');
      return;
    }

    // 获取个人空间ID
    let personalSpaceId: string | null = null;
    try {
      personalSpaceId = await getPersonalSpaceId();
    } catch {
      // 获取私人空间 ID 失败（如 token 过期），降级为 null
      // 后续逻辑会跳过"我的图纸"判断，走另存为流程
    }

    // 判断是否是我的图纸（个人空间中的图纸）
    const isMyDrawing =
      personalSpaceId && currentFileInfo.parentId === personalSpaceId;

    // 判断是否是公共资源库文件（通过 currentFileInfo.libraryKey 判断）
    const isLibraryFile = !!currentFileInfo?.libraryKey;

    // 如果是我的图纸，直接保存
    if (isMyDrawing) {
      await saveToCurrentFile(personalSpaceId);
      return;
    }

    // 如果是公共资源库文件（需要判断用户是否有库管理权限）
    if (isLibraryFile) {
      // 检查用户是否有库管理权限
      // 检查 localStorage 中的用户权限
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const userData = JSON.parse(userStr);
          const userPermissions = userData?.role?.permissions || [];
          const permissionStrings = userPermissions.map(
            (p: string | { permission: string }) => (typeof p === 'string' ? p : p.permission)
          );

          const hasLibraryPermission =
            permissionStrings.includes('LIBRARY_DRAWING_MANAGE') ||
            permissionStrings.includes('LIBRARY_BLOCK_MANAGE');

          if (hasLibraryPermission) {
            await saveLibraryFile();
          } else {
            const fileName = currentFileInfo?.name || 'untitled';
            await showSaveAsDialog(personalSpaceId, fileName);
          }
        } catch (error) {
          handleError(error, 'mxcadManager: Mx_Save library permission check');
          const fileName = currentFileInfo?.name || 'untitled';
          await showSaveAsDialog(personalSpaceId, fileName);
        }
      } else {
        // 无用户数据，弹出另存为
        const fileName = currentFileInfo?.name || 'untitled';
        await showSaveAsDialog(personalSpaceId, fileName);
      }
      return;
    }

    // 如果是项目图纸，需要检查用户是否有保存权限
    if (currentFileInfo.projectId) {
      try {
        const response = await fileSystemControllerCheckProjectPermission({
          path: { projectId: currentFileInfo.projectId },
          query: { permission: 'CAD_SAVE' },
        });
        if (response.data?.hasPermission) {
          // 用户有该项目保存权限，直接保存
          await saveToCurrentFile(personalSpaceId);
          return;
        }
        // 没有权限，继续执行弹出另存为窗口
      } catch (error) {
        handleError(error, 'mxcadManager: Mx_Save project permission check');
        // 权限检查失败，继续执行弹出另存为窗口
      }
    }

    // 非我的图纸 或 没有项目保存权限，弹出另存为窗口
    const fileName = currentFileInfo?.name || 'untitled';
    await showSaveAsDialog(personalSpaceId, fileName);
  } catch (error) {
    handleError(error, 'mxcadManager: Mx_Save');
    hideGlobalLoading();
    const errorMessage =
      error instanceof Error ? error.message : '保存失败，请稍后重试';
    globalShowToast(errorMessage, 'error');
  }
});

/**
 * 保存到当前文件（原有逻辑）
 */
async function saveToCurrentFile(personalSpaceId: string | null) {
  const projectId = currentFileInfo?.projectId;
  if (projectId) {
    try {
      const response = await fileSystemControllerCheckProjectPermission({
        path: { projectId },
        query: { permission: 'CAD_SAVE' },
      });
      if (!response.data?.hasPermission) {
        globalShowToast('您没有保存图纸的权限', 'error');
        return;
      }
    } catch (error) {
      handleError(error, 'mxcadManager: saveToCurrentFile permission check');
      globalShowToast('权限检查失败，请稍后重试', 'error');
      return;
    }
  }

  if (!currentFileInfo) {
    globalShowToast('保存失败：文件信息丢失', 'error');
    return;
  }
  const { fileId, name, expectedTimestamp } = currentFileInfo;
  const commitMessage = await _showSaveConfirmDialog();
  if (commitMessage === null) {
    return;
  }

  showGlobalLoading('正在保存文件...');

  const savedFile = await new Promise<{
    blob: Blob;
    data: ArrayBuffer;
    filename: string;
  }>((resolve, reject) => {
    MxCpp.App.getCurrentMxCAD().saveFile(
      name,
      (data) => {
        try {
          let blob: Blob;
          const isSafari = /^((?!chrome|android).)*safari/i.test(
            navigator.userAgent
          );
          if (isSafari) {
            blob = new Blob([data.buffer], {
              type: 'application/octet-stream',
            });
          } else {
            blob = new Blob([data.buffer], {
              type: 'application/octet-binary',
            });
          }
          resolve({
            blob,
            data,
            filename: name,
          });
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

  setLoadingMessage('正在上传到服务器...');

  try {
    const filename = savedFile.filename.replace(/\.[^/.]+$/, '') + '.mxweb';
    const file = new File([savedFile.blob], filename, { type: savedFile.blob.type });
    const hash = await calculateFileHash(file);

    await uploadMxCadFile({ file, hash, nodeId: fileId, skipDb: true });

    const saveFormData = new FormData();
    saveFormData.append('hash', hash);
    if (commitMessage) saveFormData.append('commitMessage', commitMessage);
    if (expectedTimestamp) saveFormData.append('expectedTimestamp', expectedTimestamp);

    const token = localStorage.getItem('accessToken');
    const response = await fetch(`/api/v1/mxcad/savemxweb/${fileId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: saveFormData,
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ message: '上传失败，请稍后重试' }));
      throw new Error((errBody as { message?: string }).message || '上传失败，请稍后重试');
    }
  } catch (uploadError) {
    handleError(uploadError, 'mxcadManager: saveToCurrentFile upload');
    hideGlobalLoading();
    globalShowToast(
      uploadError instanceof Error ? uploadError.message : '上传失败，请稍后重试',
      'error',
    );
    return;
  }

  try {
    const fileInfoResponse = await fileSystemControllerGetNode({ path: { nodeId: fileId } });
    const fileInfo = fileInfoResponse.data;

    if (!fileInfo) return;

    // 保存成功后更新乐观锁时间戳
    if (fileInfo.updatedAt && currentFileInfo) {
      currentFileInfo = { ...currentFileInfo, updatedAt: fileInfo.updatedAt, expectedTimestamp: fileInfo.updatedAt };
    }

    if (fileInfo.path) {
      // 基础路径（不带 ?t=）
      const basePath = `/api/v1/mxcad/filesData/${fileInfo.path}`;

      // 获取最新的 updatedAt 时间戳
      const timestamp = fileInfo.updatedAt
        ? new Date(fileInfo.updatedAt).getTime()
        : Date.now();

      // 新的缓存路径（带 ?t= 参数）
      const newCachePath = `${basePath}?t=${timestamp}`;

      // 1. 清理旧的缓存（包括不带 ?t= 和带旧时间戳的）
      await clearFileCacheFromIndexedDB(basePath);

      // 2. 写入新的缓存
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('emscripten_filesystem', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const transaction = db.transaction(['FILES'], 'readwrite');
      const objectStore = transaction.objectStore('FILES');

      await new Promise<void>((resolve, reject) => {
        const request = objectStore.put(savedFile.data, newCachePath);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }
  } catch (cacheError) {
    handleError(cacheError, 'mxcadManager: updateLocalCache');
  }

  // 处理待上传图片
  await processPendingImages();

  resetDocumentModified();
  hideGlobalLoading();
  globalShowToast('文件保存成功', 'success');
}

/**
 * 保存公共资源库文件（图纸库/图块库）
 */
async function saveLibraryFile() {
  if (!currentFileInfo) {
    globalShowToast('保存失败：文件信息丢失', 'error');
    return;
  }
  let { fileId, name, libraryKey, path: nodePath, expectedTimestamp } = currentFileInfo;
  const commitMessage = ''; // Library files don't have user-facing commit messages

  if (!libraryKey) {
    globalShowToast('保存失败：未知的资源库类型', 'error');
    return;
  }

  // 如果缺少 nodePath，从 API 获取
  if (!nodePath) {
    try {
      const nodeResponse =
        libraryKey === 'drawing'
          ? await libraryControllerGetDrawingNode({ path: { nodeId: fileId } })
          : await libraryControllerGetBlockNode({ path: { nodeId: fileId } });
      const node = nodeResponse.data;
      if (node) {
        nodePath = node.path;

        if (nodePath && currentFileInfo) {
          currentFileInfo = { ...currentFileInfo, path: nodePath };
        }
      }
    } catch (error) {
      handleError(error, 'mxcadManager: saveLibraryFile getNodePath');
    }
  }

  if (!nodePath) {
    globalShowToast('保存失败：缺少文件路径信息', 'error');
    return;
  }

  showGlobalLoading('正在保存文件...');

  const savedFile = await new Promise<{
    blob: Blob;
    data: ArrayBuffer | Uint8Array;
    filename: string;
  }>((resolve, reject) => {
    MxCpp.App.getCurrentMxCAD().saveFile(
      name,
      (data) => {
        try {
          let blob: Blob;
          const isSafari = /^((?!chrome|android).)*safari/i.test(
            navigator.userAgent
          );
          if (isSafari) {
            blob = new Blob([data.buffer], {
              type: 'application/octet-stream',
            });
          } else {
            blob = new Blob([data.buffer], {
              type: 'application/octet-binary',
            });
          }
          resolve({
            blob,
            data,
            filename: name,
          });
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

  try {
    setLoadingMessage('正在上传到服务器...');

    const file = new File([savedFile.blob], `${libraryKey}.mxweb`, { type: savedFile.blob.type });
    const hash = await calculateFileHash(file);

    await uploadMxCadFile({ file, hash, nodeId: fileId, skipDb: true });

    const saveFormData = new FormData();
    saveFormData.append('hash', hash);
    saveFormData.append('commitMessage', commitMessage || '');
    if (expectedTimestamp) saveFormData.append('expectedTimestamp', expectedTimestamp);

    const token = localStorage.getItem('accessToken');
    const response = await fetch(`/api/v1/mxcad/savemxweb/${fileId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: saveFormData,
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ message: '保存失败' }));
      throw new Error((errBody as { message?: string }).message || '保存失败');
    }

    // 更新本地缓存 - 使用 node.path 构建正确的 URL
    const basePath = libraryKey === 'drawing'
      ? `/api/v1/library/drawing/filesData/${nodePath}`
      : `/api/v1/library/block/filesData/${nodePath}`;

    // 获取最新的 updatedAt 时间戳
    const updatedAt = await getNodeUpdatedAt(fileId, libraryKey);
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    const newCachePath = `${basePath}?t=${timestamp}`;

    // 1. 清理旧的缓存（包括不带 ?t= 和带旧时间戳的）
    await clearFileCacheFromIndexedDB(basePath);

    // 2. 写入新的缓存
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('emscripten_filesystem', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const transaction = db.transaction(['FILES'], 'readwrite');
    const objectStore = transaction.objectStore('FILES');

    // 确保存入的是 ArrayBuffer 而不是 Uint8Array
    const arrayBufferData =
      savedFile.data instanceof Uint8Array
        ? savedFile.data.buffer
        : savedFile.data;

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.put(arrayBufferData, newCachePath);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // 处理待上传图片
    await processPendingImages();

    resetDocumentModified();
    hideGlobalLoading();
    globalShowToast('文件保存成功', 'success');
  } catch (error) {
    handleError(error, 'mxcadManager: saveLibraryFile');
    hideGlobalLoading();
    globalShowToast(
      error instanceof Error ? error.message : '保存失败，请稍后重试',
      'error'
    );
  }
}

/**
 * 获取节点的 updatedAt 时间戳
 */
async function getNodeUpdatedAt(
  nodeId: string,
  libraryKey: string
): Promise<string | null> {
  try {
    const response =
      libraryKey === 'drawing'
        ? await libraryControllerGetDrawingNode({ path: { nodeId: nodeId } })
        : await libraryControllerGetBlockNode({ path: { nodeId: nodeId } });

    const node = response.data;
    return node?.updatedAt || null;
  } catch (error) {
    handleError(error, 'mxcadManager: getNodeUpdatedAt');
    return null;
  }
}

/**
 * 将当前 CAD 图纸保存为 mxweb Blob
 */
async function saveCurrentDrawingToBlob(fileName: string): Promise<{
  blob: Blob;
  data: ArrayBuffer;
  filename: string;
}> {
  const name = fileName || 'untitled';

  showGlobalLoading('正在保存文件...');

  const savedFile = await new Promise<{
    blob: Blob;
    data: ArrayBuffer;
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
            type: isSafari ? 'application/octet-stream' : 'application/octet-binary',
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



/**
 * 显示保存弹窗（Save As）
 */
async function showSaveAsDialog(
  personalSpaceId: string | null,
  fileName: string
) {
  const name = fileName || 'untitled';
  const savedFile = await saveCurrentDrawingToBlob(name);

  // 触发保存弹窗事件
  window.dispatchEvent(
    new CustomEvent('mxcad-save-as', {
      detail: {
        currentFileName: name,
        mxwebBlob: savedFile.blob,
        personalSpaceId,
      },
    })
  );
}

/**
 * MxCAD 容器管理器
 * 负责创建和管理永不销毁的全局容器
 */
class MxCADContainerManager {
  private static instance: MxCADContainerManager;
  private globalContainer: HTMLElement | null = null;

  private constructor() {
    this.createGlobalContainer();
  }

  static getInstance(): MxCADContainerManager {
    if (!MxCADContainerManager.instance) {
      MxCADContainerManager.instance = new MxCADContainerManager();
    }
    return MxCADContainerManager.instance;
  }

  private createGlobalContainer(): void {
    let container = document.getElementById(CSS_CLASSES.GLOBAL_CONTAINER);

    if (!container) {
      container = document.createElement('div');
      container.id = CSS_CLASSES.GLOBAL_CONTAINER;
      // 初始状态：隐藏，使用 visibility + z-index 方案保护 WebGL 上下文
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 300px;
        right: 0;
        bottom: 0;
        visibility: hidden;
        z-index: -1; /* Z_LAYERS.CAD_EDITOR hidden */
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    this.globalContainer = container;
  }

  adjustContainerPosition(sidebarWidth: number = 300): void {
    if (this.globalContainer) {
      this.globalContainer.style.left = `${sidebarWidth}px`;
    }
  }

  getContainer(): HTMLElement {
    if (!this.globalContainer) {
      throw new Error('全局容器未创建');
    }
    return this.globalContainer;
  }

  showContainer(show: boolean): void {
    if (this.globalContainer) {
      // 使用 visibility + z-index 方案，保护 WebGL 上下文不被销毁
      // visibility: hidden 保持元素在渲染树中，WebGL 上下文不会丢失
      // z-index 只在隐藏时设置为 -1，显示时设置为 9998
      // CADEditorDirect 容器 z-index: 9999，侧边栏在其中
      // MxCAD 容器 z-index: 9998，在 CADEditorDirect 之下，但编辑器内容区域透明
      // pointer-events 禁用交互
      if (show) {
        this.globalContainer.style.visibility = 'visible';
        this.globalContainer.style.zIndex = String(Z_LAYERS.CAD_EDITOR);
        this.globalContainer.style.pointerEvents = 'auto';
      } else {
        this.globalContainer.style.visibility = 'hidden';
        this.globalContainer.style.zIndex = '-1';
        this.globalContainer.style.pointerEvents = 'none';
      }
    }
  }

  clearContainer(): void {
    // 永远不要清空全局容器，保持 mxcadView 绑定的 DOM 元素
  }
}

/**
 * MxCAD 实例管理器
 * 负责管理 MxCADView 实例的生命周期
 */
class MxCADInstanceManager {
  private mxcadView: MxCADView | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(
    initialFileUrl?: string,
    fileName?: string
  ): Promise<MxCADView> {
    if (fileName) {
      currentFileInfo = {
        fileId: '',
        parentId: null,
        projectId: null,
        name: fileName,
        personalSpaceId: null,
      };
    }

    if (this.mxcadView && this.isInitialized) {
      if (initialFileUrl) {
        await this.openFile(initialFileUrl);
      }
      return this.mxcadView;
    }

    if (this.initPromise) {
      await this.initPromise;
      if (initialFileUrl) {
        await this.openFile(initialFileUrl);
      }
      if (!this.mxcadView) {
        throw new Error('MxCADView 初始化失败，实例为空');
      }
      return this.mxcadView;
    }

    this.initPromise = this.createInstance(initialFileUrl);
    await this.initPromise;
    this.initPromise = null;

    if (!this.mxcadView) {
      throw new Error('MxCADView 初始化失败，实例为空');
    }
    return this.mxcadView;
  }

  /**
   * 获取图框截图并生成缩略图
   */
  private async generateThumbnail(): Promise<string | undefined> {
    try {
      const mxcad = MxCpp.getCurrentMxCAD();
      mxcad.setAttribute({ ShowCoordinate: false });

      const { minPt, maxPt } = mxcad
        .getDatabase()
        .currentSpace.getBoundingBox();

      const w = Math.abs(minPt.x - maxPt.x);
      const h = Math.abs(minPt.y - maxPt.y);

      if (
        w < THUMBNAIL_CONFIG.MIN_DRAWING_SIZE ||
        h < THUMBNAIL_CONFIG.MIN_DRAWING_SIZE
      ) {
        return undefined;
      }

      const scale = Math.min(
        THUMBNAIL_CONFIG.TARGET_SIZE / w,
        THUMBNAIL_CONFIG.TARGET_SIZE / h
      );
      const centerX = (minPt.x + maxPt.x) / 2;
      const centerY = (minPt.y + maxPt.y) / 2;

      const newMinPt = new McGePoint3d({
        x: centerX - THUMBNAIL_CONFIG.TARGET_SIZE / 2 / scale,
        y: centerY - THUMBNAIL_CONFIG.TARGET_SIZE / 2 / scale,
      });

      const newMaxPt = new McGePoint3d({
        x: centerX + THUMBNAIL_CONFIG.TARGET_SIZE / 2 / scale,
        y: centerY + THUMBNAIL_CONFIG.TARGET_SIZE / 2 / scale,
      });

      return new Promise<string | undefined>((resolve, reject) => {
        mxcad.mxdraw.createCanvasImageData(
          (imageData: string) => {
            mxcad.setAttribute({ ShowCoordinate: true });
            resolve(imageData);
          },
          {
            width: THUMBNAIL_CONFIG.TARGET_SIZE,
            height: THUMBNAIL_CONFIG.TARGET_SIZE,
            range_pt1: newMinPt,
            range_pt2: newMaxPt,
          }
        );
      });
    } catch (error) {
      console.error('生成缩略图失败', error);
      return undefined;
    }
  }

  /**
   * 上传缩略图
   */
  private async uploadThumbnail(
    nodeId: string,
    imageData: string
  ): Promise<boolean> {
    try {
      const blob = this.dataURLtoBlob(imageData);
      if (!blob) {
        console.error('转换为 Blob 失败');
        return false;
      }

      await thumbnailControllerUploadThumbnail({ path: { nodeId }, body: { file: blob } });
      return true;
    } catch (error) {
      handleError(error, 'mxcadManager: uploadThumbnail');
      return false;
    }
  }

  /**
   * 将 DataURL 转换为 Blob
   */
  private dataURLtoBlob(dataURL: string): Blob | void {
    const arr = dataURL.split(',');
    const item = arr[0];
    const item1 = arr[1];
    if (!item1) return;
    const mime = item?.match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(item1);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * 设置文件打开完成事件监听器
   */
  private setupFileOpenListener(): void {
    const onOpen = async () => {
      window.dispatchEvent(
        new CustomEvent('mxcad-file-open-complete', {
          detail: {
            fileId: currentFileInfo?.fileId,
            fileName: currentFileInfo?.name,
          },
        })
      );

      // 文件打开完成后，重置修改状态
      resetDocumentModified();

      // 如果 currentFileInfo 为空，尝试从 MxCAD 获取文件名
      if (!currentFileInfo) {
        try {
          const mxcad = MxCpp.getCurrentMxCAD();
          const mxFileName = mxcad?.getCurrentFileName?.();
          if (mxFileName) {
            // 保留 store 中已有的 fileId（例如分享链接 URL 指定的 drawingId）
            const store = useCADEditorStore.getState();
            setCurrentFileInfo({
              fileId: store.currentFileId || '',
              parentId: null,
              projectId: null,
              name: mxFileName,
              personalSpaceId: null,
            });
          }
        } catch (error) {
          console.error('[setupFileOpenListener] 获取 MxCAD 文件名失败', error);
        }
      }

      if (currentFileInfo) {
        // 文件可能从空白模板切换到真实文件，更新 currentFileInfo.name
        // 仅当 currentFileInfo.name 未设置或为模板名称时才覆盖，避免覆盖分享/API 已设置的正确文件名
        try {
          const mxcad = MxCpp.getCurrentMxCAD();
          const mxFileName = mxcad?.getCurrentFileName?.();
          if (mxFileName && mxFileName !== 'empty_template.mxweb' && mxFileName !== 'empty.mxweb') {
            const currentName = currentFileInfo.name || '';
            if (!currentName || currentName === 'empty_template.mxweb' || currentName === 'empty.mxweb') {
              currentFileInfo.name = mxFileName;
            }
          }
        } catch {}
        useCADEditorStore.getState().setCurrentFileName(currentFileInfo.name);
        globalThis.MxPluginContext.useFileName().fileName.value =
          formatEditorFileName(currentFileInfo.name);

        try {
          // 检查用户是否已登录，未登录则不生成和上传缩略图
          if (!isAuthenticated()) {
            return;
          }

          // 优先使用 currentFileInfo.fileId；为空时从 mxweb URL 提取 nodeId
          let fileId = currentFileInfo.fileId;
          if (!fileId && currentMxwebUrl) {
            // URL 格式: /api/v1/mxcad/filesData/YYYYMM/{nodeId}.{ext}.mxweb
            // 从路径中提取 nodeId
            const match = currentMxwebUrl.match(/\/([a-z0-9]+)\.[^.]+\.mxweb/i);
            if (match) {
              fileId = match[1] ?? '';
            }
          }

          if (!fileId) {
            return;
          }

          const thumbnailResult = await thumbnailControllerCheckThumbnail({ path: { nodeId: fileId } });

          if (!thumbnailResult?.data?.exists) {
            const imageData = await this.generateThumbnail();
            if (imageData) {
              await this.uploadThumbnail(fileId, imageData);
            }
          }
        } catch (error) {
          handleError(error, 'mxcadManager: setupFileOpenListener thumbnail');
        }

        // 清理旧版本缓存（如果有缓存时间戳）
        if (currentCacheTimestamp && currentFileInfo && currentMxwebUrl) {
          try {
            const urlWithoutTimestamp = currentMxwebUrl.replace(/\?t=\d+$/, '');
            // 支持项目文件和图纸库文件的缓存清理
            const mxcadPathMatch = urlWithoutTimestamp.match(
              /\api\/mxcad\/filesData\/(.*)/
            );
            const libraryPathMatch = urlWithoutTimestamp.match(
              /\api\/library\/drawing\/filesData\/(.*)/
            );
            const filePath = mxcadPathMatch?.[1] || libraryPathMatch?.[1];
            if (filePath) {
              await clearOldMxwebCache(filePath, currentCacheTimestamp);
            }
          } catch (error) {
            handleError(error, 'mxcadManager: clearOldCache');
          }
        }
      }
    };

    this.mxcadView?.mxcad.on('openFileComplete', onOpen);
  }

  /**
   * 构建视图选项
   * @param openFile 初始文件 URL
   * @returns 视图选项对象
   */
  private buildViewOptions(openFile?: string) {
    const containerManager = MxCADContainerManager.getInstance();
    const token = localStorage.getItem('accessToken');

    // 构建外部参照文件解析函数
    const resolveExtReferenceUrl = (fileName: string) => {
      // 从当前打开的文件 URL 中提取 hash
      if (openFile && openFile.includes('/public-file/access/')) {
        const parts = openFile.split('/');
        const hashIndex = parts.indexOf('access') + 1;
        if (hashIndex < parts.length) {
          const hash = parts[hashIndex];
          // 构建外部参照文件的访问 URL
          if (hash) {
            return `/api/v1/public-file/access/${hash}/${fileName}`;
          }
        }
      }
      return fileName;
    };

    return {
      rootContainer: containerManager.getContainer(),
      ...(openFile && { openFile }),
      ...(token && { requestHeaders: { Authorization: `Bearer ${token}` } }),
      // 添加外部参照文件解析函数
      extReferenceUrlResolver: resolveExtReferenceUrl,
    };
  }

  /**
   * 监听 MxCAD 应用创建完成事件
   */
  private setupInitializationListener(): void {
    MxFun.on('mxcadApplicationCreatedMxCADObject', () => {
      this.isInitialized = true;
      // 应用创建完成后重新设置文件打开完成监听（此时 this.mxcadView.mxcad 可用）
      this.setupFileOpenListener();
      // 设置文档修改事件监听
      this.setupDocumentModifyListener();
      // 延迟注册自定义命令，确保在 mxcad-app 完成所有初始化后覆盖默认命令
      setTimeout(() => {
        MxFun.removeCommand('Mx_NewFile');
        MxFun.addCommand('Mx_NewFile', handleNewFileCommand);
      }, 2000);
    });
  }

  /**
   * 监听文档修改事件
   * MxCAD SDK 在文档被修改时会触发 'databaseModify' 事件
   */
  private setupDocumentModifyListener(): void {
    try {
      const mxcad = MxCpp.getCurrentMxCAD();
      if (mxcad) {
        // 监听数据库修改事件
        mxcad.on('databaseModify', () => {
          setDocumentModified(true);
        });
      }
    } catch (error) {
      // 静默处理：MxCAD 可能尚未初始化
    }
  }

  /**
   * 创建新 MxCADView 实例
   * @param openFile 初始文件 URL
   */
  private async createInstance(openFile?: string): Promise<void> {
    try {
      if (openFile) {
        currentMxwebUrl = openFile;
      }

      const viewOptions = this.buildViewOptions(openFile);
      this.mxcadView = new MxCADView(viewOptions);

      this.setupFileOpenListener();
      this.setupInitializationListener();

      this.mxcadView.create();
    } catch (error) {
      console.error('MxCADView 实例创建失败', error);
      this.mxcadView = null;
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * 重新初始化 CAD 视图并打开文件
   * 用于空白初始化的 CAD 需要打开文件时（如协同分享的 auto-create）
   * 先重置再初始化，避免 "running open" 状态冲突
   */
  async reopenWithUrl(fileUrl: string): Promise<void> {
    this.reset();
    await this.initialize(fileUrl);
  }

  async openFile(fileUrl: string, noCache?: boolean): Promise<void> {
    if (!this.mxcadView || !this.isInitialized) {
      throw new Error('MxCADView 实例未初始化');
    }

    currentMxwebUrl = fileUrl;

    const currentFileName = this.getCurrentFileName();
    const targetFileName = fileUrl.split('/').pop();

    // 使用精确匹配避免历史版本文件名误匹配
    if (
      currentFileName &&
      targetFileName &&
      currentFileName === targetFileName
    ) {
      return Promise.resolve();
    }

    if (!this.mxcadView?.mxcad) {
      throw new Error('mxcad 对象不可用');
    }

    // 等待文件真正打开完成（监听 openFileComplete 事件）
    return new Promise<void>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('文件打开超时'));
      }, 60000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.mxcadView?.mxcad?.off('openFileComplete', onOpen);
      };

      const onOpen = () => {
        cleanup();
        resolve();
      };

      try {
        this.mxcadView?.mxcad?.on('openFileComplete', onOpen);
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      const view = this.mxcadView;
      const mxcad = view?.mxcad;
      if (!mxcad) {
        cleanup();
        reject(new Error('mxcad 对象不可用'));
        return;
      }

      const token = localStorage.getItem('accessToken');
      for (
        let attempt = 0;
        attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
        attempt++
      ) {
        try {
          mxcad.openWebFile(
            fileUrl,
            undefined,
            true,
            token
              ? { requestHeaders: { Authorization: `Bearer ${token}` } }
              : undefined,
            noCache ? FetchAttributes.EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | FetchAttributes.EMSCRIPTEN_FETCH_PERSIST_FILE | FetchAttributes.EMSCRIPTEN_FETCH_REPLACE : 0
          );
          break;
        } catch (error) {
          const err = error as Error;
          if (
            err.message?.includes('mxdrawObject') &&
            attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS)
            );
            continue;
          }
          cleanup();
          reject(error);
          return;
        }
      }
    });
  }

  getCurrentView(): MxCADView | null {
    return this.mxcadView;
  }

  getCurrentFileName(): string | null {
    if (!this.mxcadView?.mxcad) {
      return null;
    }

    try {
      return this.mxcadView.mxcad.getCurrentFileName?.() || null;
    } catch (error) {
      // 静默：无法获取当前文件名
      return null;
    }
  }

  isFileOpen(targetFileName: string): boolean {
    const currentFileName = this.getCurrentFileName();
    if (!currentFileName || !targetFileName) {
      return false;
    }
    return currentFileName.includes(targetFileName);
  }

  /**
   * 重新加载当前文件
   * 用于需要强制刷新文件状态的场景（如加入协同后）
   * @returns 是否成功重新加载
   */
  async reloadCurrentFile(): Promise<boolean> {
    if (!currentMxwebUrl || !this.mxcadView?.mxcad) {
      return false;
    }

    showGlobalLoading('正在加载图纸...');

    // 等待文件打开完成（与 openFile 同样的模式）
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        hideGlobalLoading();
        resolve(false);
      }, 60000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.mxcadView?.mxcad?.off('openFileComplete', onOpen);
      };

      const onOpen = () => {
        cleanup();
        hideGlobalLoading();
        resolve(true);
      };

      try {
        this.mxcadView?.mxcad?.on('openFileComplete', onOpen);
      } catch (error) {
        cleanup();
        hideGlobalLoading();
        resolve(false);
        return;
      }

      const doOpen = async () => {
        try {
          const token = localStorage.getItem('accessToken');
          const url = currentMxwebUrl!;

          for (
            let attempt = 0;
            attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
            attempt++
          ) {
            try {
              this.mxcadView!.mxcad!.openWebFile(
                url,
                undefined,
                true,
                token
                  ? { requestHeaders: { Authorization: `Bearer ${token}` } }
                  : undefined,
                0
              );
              return; // 等待 openFileComplete
            } catch (error) {
              const err = error as Error;
              if (
                err.message?.includes('mxdrawObject') &&
                attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1
              ) {
                await new Promise((resolve) =>
                  setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS)
                );
                continue;
              }
              cleanup();
              hideGlobalLoading();
              resolve(false);
              return;
            }
          }
          cleanup();
          hideGlobalLoading();
          resolve(false);
        } catch (error) {
          cleanup();
          hideGlobalLoading();
          console.error('重新加载文件失败:', error);
          resolve(false);
        }
      };

      doOpen();
    });
  }

  isCreated(): boolean {
    return this.mxcadView !== null;
  }

  isReady(): boolean {
    return this.isInitialized && this.mxcadView !== null;
  }

  reset(): void {
    // 静默：重置 MxCADView 实例
    this.mxcadView = null;
    this.isInitialized = false;
    this.initPromise = null;

    const containerManager = MxCADContainerManager.getInstance();
    containerManager.clearContainer();
  }
}

/**
 * MxCAD 全局管理器
 * 统一的入口点，协调各个子管理器
 */
export class MxCADManager {
  private static instance: MxCADManager;
  private containerManager: MxCADContainerManager;
  private instanceManager: MxCADInstanceManager;

  private constructor() {
    this.containerManager = MxCADContainerManager.getInstance();
    this.instanceManager = new MxCADInstanceManager();
  }

  static getInstance(): MxCADManager {
    if (!MxCADManager.instance) {
      MxCADManager.instance = new MxCADManager();
    }
    return MxCADManager.instance;
  }

  async initializeMxCADView(
    initialFileUrl?: string,
    fileName?: string
  ): Promise<MxCADView> {
    return this.instanceManager.initialize(initialFileUrl, fileName);
  }

  showMxCAD(show: boolean = true): void {
    this.containerManager.showContainer(show);
  }

  getCurrentView(): MxCADView | null {
    return this.instanceManager.getCurrentView();
  }

  async openFile(fileUrl: string, noCache?: boolean): Promise<void> {
    exitCollaborationIfNeeded();
    return this.instanceManager.openFile(fileUrl, noCache);
  }

  isCreated(): boolean {
    return this.instanceManager.isCreated();
  }

  isReady(): boolean {
    return this.instanceManager.isReady();
  }

  getCurrentFileName(): string | null {
    return this.instanceManager.getCurrentFileName();
  }

  isFileOpen(targetFileName: string): boolean {
    return this.instanceManager.isFileOpen(targetFileName);
  }

  /**
   * 重新加载当前文件
   * 用于需要强制刷新文件状态的场景（如加入协同后）
   * @returns 是否成功重新加载
   */
  async reloadCurrentFile(): Promise<boolean> {
    return this.instanceManager.reloadCurrentFile();
  }

  reset(): void {
    this.instanceManager.reset();
  }

  /**
   * 重新初始化 CAD 视图并打开文件
   * 用于空白初始化的 CAD 需要打开文件时（如协同分享的 auto-create）
   */
  async reopenWithUrl(fileUrl: string): Promise<void> {
    return this.instanceManager.reopenWithUrl(fileUrl);
  }

  /**
   * 获取当前打开的文件信息
   * @returns 当前文件信息，如果没有打开的文件则返回 null
   */
  getCurrentFileInfo(): {
    fileId: string;
    parentId: string | null | undefined;
    projectId: string | null | undefined;
    name: string;
    personalSpaceId?: string | null;
    libraryKey?: 'drawing' | 'block';
  } | null {
    return currentFileInfo;
  }

  /**
   * 调整CAD编辑器容器位置，为侧边栏留出空间
   * @param sidebarWidth 侧边栏宽度
   */
  adjustContainerPosition(sidebarWidth: number = 300): void {
    this.containerManager.adjustContainerPosition(sidebarWidth);
  }
}

// 导出单例实例
export const mxcadManager = MxCADManager.getInstance();


/**
 * Mx_InsertImageWithUpload 命令：插入图片并记录待上传信息
 * 
 * 流程：
 * 1. 调用内置 _InsertImage 命令
 * 2. 在回调中获取插入图片的 url、fileName 和 entity
 * 3. 记录到待上传列表，等待保存时处理
 */
MxFun.addCommand('Mx_InsertImageWithUpload', () => {

  // 调用内置 _InsertImage 命令，并在回调中记录图片信息
  MxFun.sendStringToExecute('_InsertImage', async (data: { url: string; fileName: string; entity: unknown }) => {
    if (!data) {
      return;
    }

    const { url, fileName, entity } = data;

    const isDuplicate = pendingImages.some(img => img.fileName === fileName);
    if (isDuplicate) {
      return;
    }

    pendingImages.push({
      url,
      fileName,
      entity
    });

    globalShowToast('图片已插入，将在保存时自动上传', 'success');
  });
});

/**
 * 处理待上传图片
 * 在保存文件时调用
 */
export async function processPendingImages(): Promise<void> {
  const currentInfo = mxcadManager.getCurrentFileInfo();

  if (!currentInfo?.fileId || pendingImages.length === 0) {
    return;
  }

  // 过滤掉已删除的图片
  const validImages = pendingImages.filter(img => {
    try {
      if (img.entity && typeof img.entity === 'object' && 'isErased' in img.entity) {
        return !(img.entity as { isErased(): boolean }).isErased();
      }
      return true;
    } catch {
      return true;
    }
  });

  if (validImages.length === 0) {
    // 清空待上传列表
    pendingImages = [];
    return;
  }

  // 下载并上传图片
  for (const img of validImages) {
    try {
      // 下载图片数据
      const response = await fetch(img.url);
      if (!response.ok) {
        throw new Error(`下载图片失败: ${response.status}`);
      }
      const blob = await response.blob();
      const file = new File([blob], img.fileName, { type: blob.type });

      // 上传到外部参照目录（使用 SDK）
      await mxCadControllerUploadExtReferenceImage({
        body: {
          file,
          nodeId: currentInfo.fileId,
          ext_ref_file: img.fileName,
        },
      });
    } catch (error) {
      handleError(error, 'mxcadManager: processPendingImages');
    }
  }

  // 清空待上传列表
  pendingImages = [];
}


/**
 * 获取私人空间 ID
 * 从本地存储或 API 获取用户的私人空间 ID
 */
async function getPersonalSpaceId(): Promise<string | null> {
  try {
    // 安全修复：不再使用 localStorage 缓存，避免跨用户数据泄露
    // 直接从 API 获取当前用户的私人空间 ID
    const response = await fileSystemControllerGetPersonalSpace();
    const personalSpaceId = response.data?.id || null;

    return personalSpaceId;
  } catch (error) {
    handleError(error, 'mxcadManager: getPersonalSpaceId');
    return null;
  }
}

/**
 * 清理旧的 mxweb 缓存（Cache API）
 * @param filePath 文件路径
 * @param currentTimestamp 当前时间戳
 */
async function clearOldMxwebCache(
  filePath: string,
  currentTimestamp: number
): Promise<void> {
  try {
    const cache = await caches.open('mxcad-mxweb-cache');
    const keys = await cache.keys();

    for (const request of keys) {
      const url = new URL(request.url);
      // 检查是否为同一文件的旧版本缓存
      if (
        url.pathname.includes(filePath) &&
        url.searchParams.has('t') &&
        parseInt(url.searchParams.get('t') || '0') < currentTimestamp
      ) {
        await cache.delete(request);
      }
    }
  } catch (error) {
    handleError(error, 'mxcadManager: clearOldMxwebCache');
  }
}

/**
 * 清理指定文件路径的 IndexedDB 缓存
 * 删除该文件的所有缓存版本（包括不带 ?t= 和带 ?t= 参数的 key）
 * @param basePath 不带 ?t= 参数的基础路径
 *                 例如：/api/mxcad/filesData/202401/xxx/yyy.mxweb
 */
async function clearFileCacheFromIndexedDB(basePath: string): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('emscripten_filesystem', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const transaction = db.transaction(['FILES'], 'readwrite');
    const objectStore = transaction.objectStore('FILES');

    // 获取所有 key
    const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = objectStore.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    let deletedCount = 0;

    // 删除匹配的 key
    for (const key of allKeys) {
      if (typeof key === 'string') {
        // 删除基础路径（不带 ?t=）
        if (key === basePath) {
          objectStore.delete(key);
          deletedCount++;
        }
        // 删除带 ?t= 参数的 key
        else if (key.startsWith(basePath + '?t=')) {
          objectStore.delete(key);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      // Cache cleared successfully
    }
  } catch (error) {
    handleError(error, 'mxcadManager: clearFileCacheFromIndexedDB');
  }
}
