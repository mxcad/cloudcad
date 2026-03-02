import { MxCADView } from 'mxcad-app';
import { logger as Logger, UrlHelper } from '../utils/mxcadUtils';
import { mxcadApi, filesApi } from './index';
import { MxFun } from 'mxdraw';
import { McGePoint3d, MxCpp } from 'mxcad';
import { calculateFileHash } from '../utils/hashUtils';
import { uploadMxCadFile, MxCadUploadError } from '../utils/mxcadUploadUtils';

// ==================== 类型定义 ====================

interface ViewOptions {
  rootContainer: HTMLElement;
  openFile?: string;
}

interface FileInfo {
  parentId?: string;
  projectId?: string;
}

// ==================== 常量定义 ====================

/** 文件上传配置 */
const FILE_UPLOAD_CONFIG = {
  /** 允许的文件扩展名 */
  ALLOWED_EXTENSIONS: '.dwg,.dxf',
  /** 文件选择器 ID */
  FILE_PICKER_ID: 'mxcad-command-file-picker',
} as const;

/** 缩略图配置 */
const THUMBNAIL_CONFIG = {
  /** 目标缩略图尺寸（正方形边长，单位：像素） */
  TARGET_SIZE: 100,
  /** 最小图纸尺寸（单位：图纸单位） */
  MIN_DRAWING_SIZE: 1,
} as const;

/** 文件打开重试配置 */
const FILE_OPEN_RETRY_CONFIG = {
  /** 最大重试次数 */
  MAX_RETRIES: 5,
  /** 重试延迟时间（单位：毫秒） */
  RETRY_DELAY_MS: 300,
} as const;

/** CSS 类名常量 */
const CSS_CLASSES = {
  /** 全局容器 */
  GLOBAL_CONTAINER: 'mxcad-global-container',
  /** 加载遮罩层 */
  LOADING_OVERLAY: 'mxcad-loading-overlay',
  /** 加载动画 */
  LOADING_SPINNER: 'mxcad-loading-spinner',
  /** 加载消息 */
  LOADING_MESSAGE: 'mxcad-loading-message',
} as const;

/** 默认消息 */
const DEFAULT_MESSAGES = {
  LOADING: '正在处理...',
  UPLOADING: '正在上传文件...',
  CALCULATING_HASH: '正在计算文件哈希...',
  OPENING_FILE: '正在打开文件...',
} as const;

// ==================== 全局状态 ====================

// 当前打开的文件信息（用于返回逻辑）
let currentFileInfo: {
  fileId: string;
  parentId: string | null;
  projectId: string | null;
  name: string;
} | null = null;

// 当前打开的 mxweb 文件 URL（用于重新加载）
let currentMxwebUrl: string | null = null;

// 是否处于只读模式（历史版本访问）
let isBrowseMode = false;

// React Router navigate 函数（由 CADEditorDirect 组件设置）
let navigateFunction: ((path: string) => void) | null = null;

/**
 * 设置当前文件信息（由 CADEditorDirect 组件调用）
 */
export function setCurrentFileInfo(fileInfo: {
  fileId: string;
  parentId: string | null;
  projectId: string | null;
  name: string;
}) {
  currentFileInfo = fileInfo;
  Logger.info('设置当前文件信息', fileInfo);
}

/**
 * 设置 navigate 函数（由 CADEditorDirect 组件调用）
 */
export function setNavigateFunction(navigate: (path: string) => void) {
  navigateFunction = navigate;
  Logger.info('设置 navigate 函数');
}

/**
 * 清除当前文件信息和 navigate 函数
 */
export function clearCurrentFileInfo() {
  currentFileInfo = null;
  navigateFunction = null;
  Logger.info('清除当前文件信息');
}

// ==================== 导航相关常量 ====================

/** 导航路径常量 */
const NAVIGATION_PATHS = {
  PROJECTS_LIST: '/projects',
  PROJECT_FILES: (projectId: string) => `/projects/${projectId}/files`,
  PROJECT_FOLDER: (projectId: string, parentId: string) =>
    `/projects/${projectId}/files/${parentId}`,
} as const;

// ==================== 导航辅助函数 ====================

/**
 * 执行导航
 * @param path 目标路径
 */
function navigateTo(path: string): void {
  if (navigateFunction) {
    Logger.info(`导航到: ${path}`);
    navigateFunction(path);
  } else {
    console.warn('navigate 函数未设置，无法返回');
  }
}

/**
 * 导航到项目列表
 */
function navigateToProjectsList(): void {
  Logger.warn('返回项目列表');
  navigateTo(NAVIGATION_PATHS.PROJECTS_LIST);
}

/**
 * 计算返回路径
 * @param parentId 父文件夹 ID
 * @param projectId 项目 ID
 * @returns 返回路径
 */
function calculateReturnPath(
  parentId: string | null,
  projectId: string | null
): string {
  if (parentId && projectId) {
    const path = NAVIGATION_PATHS.PROJECT_FOLDER(projectId, parentId);
    Logger.info(`路径A - 有 parentId 和 projectId: ${path}`);
    return path;
  } else if (parentId) {
    const path = NAVIGATION_PATHS.PROJECT_FILES(parentId);
    Logger.info(`路径B - 有 parentId 无 projectId: ${path}`);
    return path;
  } else if (projectId) {
    const path = NAVIGATION_PATHS.PROJECT_FILES(projectId);
    Logger.info(`路径C - 无 parentId 有 projectId: ${path}`);
    return path;
  }

  Logger.warn('无法确定返回路径，返回项目列表');
  return NAVIGATION_PATHS.PROJECTS_LIST;
}

// ==================== return-to-cloud-map-management 命令 ====================

/**
 * 返回到云图管理命令
 */
MxFun.addCommand('return-to-cloud-map-management', () => {
  Logger.info('========== 执行返回命令 ==========');
  Logger.info('currentFileInfo:', JSON.stringify(currentFileInfo, null, 2));

  // 隐藏 CAD 编辑器
  mxcadManager.showMxCAD(false);

  if (!currentFileInfo) {
    navigateToProjectsList();
    return;
  }

  const { fileId, parentId, projectId } = currentFileInfo;
  Logger.info(
    `解析结果: fileId=${fileId}, parentId=${parentId}, projectId=${projectId}`
  );

  const targetPath = calculateReturnPath(parentId, projectId);
  navigateTo(targetPath);

  Logger.info('========== 返回命令执行完毕 ==========');
});

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

// 显示等待动画
const showLoadingOverlay = (
  message: string = DEFAULT_MESSAGES.LOADING
): HTMLElement => {
  let overlay = document.getElementById(
    CSS_CLASSES.LOADING_OVERLAY
  ) as HTMLElement;

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = CSS_CLASSES.LOADING_OVERLAY;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    overlay.innerHTML = `
      <div class="${CSS_CLASSES.LOADING_SPINNER}" style="
        width: 50px;
        height: 50px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top: 4px solid #ffffff;
        border-radius: 50%;
        animation: mxcad-spin 1s linear infinite;
        margin-bottom: 20px;
      "></div>
      <div class="${CSS_CLASSES.LOADING_MESSAGE}" style="
        font-size: 16px;
        font-weight: 500;
      "></div>
      <style>
        @keyframes mxcad-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(overlay);
  }

  const messageEl = overlay.querySelector(
    `.${CSS_CLASSES.LOADING_MESSAGE}`
  ) as HTMLElement;
  if (messageEl) {
    messageEl.textContent = message;
  }

  overlay.style.display = 'flex';
  return overlay;
};

// 隐藏等待动画
const hideLoadingOverlay = (): void => {
  const overlay = document.getElementById(
    CSS_CLASSES.LOADING_OVERLAY
  ) as HTMLElement;
  if (overlay) {
    overlay.style.display = 'none';
  }
};

// 更新等待动画的消息
const updateLoadingMessage = (message: string): void => {
  const overlay = document.getElementById(
    CSS_CLASSES.LOADING_OVERLAY
  ) as HTMLElement;
  const messageEl = overlay?.querySelector(
    `.${CSS_CLASSES.LOADING_MESSAGE}`
  ) as HTMLElement;
  if (messageEl) {
    messageEl.textContent = message;
  }
};

// ==================== 保存确认弹框 ====================

/**
 * 显示保存确认弹框，获取用户输入的提交信息
 * @returns Promise<string | null> 用户输入的提交信息，取消返回 null
 */
const showSaveConfirmDialog = (): Promise<string | null> => {
  return new Promise((resolve) => {
    // 创建弹框容器
    const dialogId = 'mxcad-save-confirm-dialog';
    let dialog = document.getElementById(dialogId) as HTMLElement;

    if (dialog) {
      document.body.removeChild(dialog);
    }

    dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        width: 90%;
        max-width: 450px;
        overflow: hidden;
      ">
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">保存文件</h3>
          <button id="mxcad-save-dialog-close" style="
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: #9ca3af;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div style="padding: 20px;">
          <label style="
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: #374151;
            margin-bottom: 8px;
          ">
            修改说明（可选）
          </label>
          <textarea id="mxcad-save-dialog-input" placeholder="请输入本次修改的内容说明..." style="
            width: 100%;
            height: 100px;
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            resize: vertical;
            box-sizing: border-box;
            font-family: inherit;
          "></textarea>
          <p style="
            margin: 8px 0 0 0;
            font-size: 12px;
            color: #6b7280;
          ">
            此说明将记录在版本历史中，方便后续查看修改内容。
          </p>
        </div>
        <div style="
          padding: 16px 20px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        ">
          <button id="mxcad-save-dialog-cancel" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: #6b7280;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            取消
          </button>
          <button id="mxcad-save-dialog-confirm" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: #4f46e5;
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            保存
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const inputEl = dialog.querySelector(
      '#mxcad-save-dialog-input'
    ) as HTMLTextAreaElement;
    const closeBtn = dialog.querySelector(
      '#mxcad-save-dialog-close'
    ) as HTMLElement;
    const cancelBtn = dialog.querySelector(
      '#mxcad-save-dialog-cancel'
    ) as HTMLElement;
    const confirmBtn = dialog.querySelector(
      '#mxcad-save-dialog-confirm'
    ) as HTMLElement;

    const cleanup = () => {
      if (dialog && dialog.parentNode) {
        dialog.parentNode.removeChild(dialog);
      }
    };

    const handleConfirm = () => {
      const message = inputEl.value.trim();
      cleanup();
      resolve(message || '');
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    closeBtn.addEventListener('click', handleCancel);
    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        handleCancel();
      }
    });

    // ESC 键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeyDown);
        handleCancel();
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        document.removeEventListener('keydown', handleKeyDown);
        handleConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 自动聚焦输入框
    setTimeout(() => inputEl.focus(), 100);
  });
};

// ==================== openFile 命令辅助函数 ====================

/**
 * 获取上传目标节点 ID
 * @throws {Error} 如果无法确定上传目标位置
 */
function getUploadTargetNodeId(): string {
  const uploadTargetNodeId =
    currentFileInfo?.parentId || currentFileInfo?.projectId;
  if (!uploadTargetNodeId) {
    throw new Error('无法确定上传目标位置，请通过文件管理页面访问编辑器');
  }
  return uploadTargetNodeId;
}

/**
 * 获取项目 ID
 * @param uploadTargetNodeId 上传目标节点 ID
 * @param fileInfo 文件信息
 * @returns 项目 ID
 */
async function getProjectId(
  uploadTargetNodeId: string,
  fileInfo: FileInfo,
  newNodeId: string
): Promise<string> {
  let projectId = uploadTargetNodeId;

  if (currentFileInfo?.projectId) {
    projectId = currentFileInfo.projectId;
  } else if (fileInfo.parentId) {
    try {
      const rootResponse = await filesApi.getRoot(newNodeId);
      if (rootResponse.data?.id) {
        projectId = rootResponse.data.id;
      }
    } catch (error) {
      Logger.error('获取根节点失败', error);
    }
  }

  return projectId;
}

/**
 * 上传并处理文件
 * @param file 要上传的文件
 * @param uploadTargetNodeId 上传目标节点 ID
 * @returns 上传后的节点 ID
 */
async function uploadAndProcessFile(
  file: File,
  uploadTargetNodeId: string
): Promise<string> {
  updateLoadingMessage(DEFAULT_MESSAGES.CALCULATING_HASH);
  const hash = await calculateFileHash(file);

  updateLoadingMessage(DEFAULT_MESSAGES.UPLOADING);
  const uploadResult = await uploadMxCadFile({
    file,
    hash,
    nodeId: uploadTargetNodeId,
    onProgress: (percentage) => {
      updateLoadingMessage(
        `${DEFAULT_MESSAGES.UPLOADING} ${percentage.toFixed(1)}%`
      );
    },
  });

  return uploadResult.nodeId;
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
  updateLoadingMessage(DEFAULT_MESSAGES.OPENING_FILE);
  const fileInfoResponse = await filesApi.get(newNodeId);
  const fileInfo = fileInfoResponse.data;

  if (!fileInfo.fileHash || !fileInfo.path) {
    throw new Error('文件转换未完成，请稍后在文件列表中查看');
  }

  const projectId = await getProjectId(uploadTargetNodeId, fileInfo, newNodeId);

  setCurrentFileInfo({
    fileId: newNodeId,
    parentId: fileInfo.parentId || uploadTargetNodeId,
    projectId,
    name: fileInfo.name,
  });

  // 使用 UrlHelper 构建 MxCAD 文件 URL，自动处理路径格式
  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  Logger.info('构建的文件 URL:', mxcadFileUrl);
  await mxcadManager.openFile(mxcadFileUrl);

  // 注意：不在这里更新 URL，避免触发 clearCurrentFileInfo 导致文件信息被清空
  // URL 应该在调用 openUploadedFile 之前就已经由调用方（如 handleInsertFile）更新
}

/**
 * 处理文件选择后的上传和打开流程
 * @param file 选择的文件
 * @param uploadTargetNodeId 上传目标节点 ID
 */
async function handleFileSelection(
  file: File,
  uploadTargetNodeId: string
): Promise<void> {
  try {
    Logger.info('开始上传文件:', file.name);
    showLoadingOverlay(DEFAULT_MESSAGES.UPLOADING);

    const newNodeId = await uploadAndProcessFile(file, uploadTargetNodeId);
    Logger.info('文件上传成功，节点 ID:', newNodeId);

    await openUploadedFile(newNodeId, uploadTargetNodeId);

    Logger.success('openFile 命令执行完毕');
    hideLoadingOverlay();
  } catch (error) {
    Logger.error('openFile 命令执行失败', error);
    hideLoadingOverlay();
    const errorMessage =
      error instanceof MxCadUploadError
        ? error.message
        : error instanceof Error
          ? error.message
          : '文件上传失败';
    alert(errorMessage);
  }
}

// ==================== openFile 命令 ====================

/**
 * openFile 命令：上传文件并打开
 */
MxFun.addCommand('openFile', async () => {
  try {
    Logger.info('========== 执行 openFile 命令 ==========');

    const uploadTargetNodeId = getUploadTargetNodeId();
    Logger.info('上传目标节点 ID:', uploadTargetNodeId);

    const picker = getFilePicker();
    picker.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        picker.value = '';
        return;
      }

      await handleFileSelection(files[0], uploadTargetNodeId);
      picker.value = '';
    };

    picker.click();
  } catch (error) {
    Logger.error('openFile 命令初始化失败', error);
    alert(error instanceof Error ? error.message : '命令执行失败');
  }
});

// ==================== exportFile 命令 ====================

/**
 * exportFile 命令：打开下载格式选择弹窗
 */
MxFun.addCommand('exportFile', () => {
  Logger.info('========== 执行 exportFile 命令 ==========');

  if (!currentFileInfo) {
    Logger.error('当前文件信息为空，无法导出');
    alert('无法获取当前文件信息，请重新打开文件');
    return;
  }

  // 触发自定义事件，通知 React 组件打开下载格式弹窗
  const event = new CustomEvent('mxcad-export-file', {
    detail: {
      fileId: currentFileInfo.fileId,
      fileName: currentFileInfo.name,
    },
  });

  window.dispatchEvent(event);
  Logger.info('已触发导出事件', {
    fileId: currentFileInfo.fileId,
    fileName: currentFileInfo.name,
  });
});

// ==================== Mx_ShowSidebar 命令 ====================

/**
 * Mx_ShowSidebar 命令：显示图库侧边栏
 */
MxFun.addCommand('Mx_ShowSidebar', () => {
  Logger.info('========== 执行 Mx_ShowSidebar 命令 ==========');

  // 触发自定义事件，通知侧边栏管理器打开图库侧边栏
  const event = new CustomEvent('mxcad-open-sidebar', {
    detail: { type: 'gallery' },
  });
  window.dispatchEvent(event);
  Logger.info('已触发打开图库侧边栏事件');
});

// ==================== Mx_ShowCollaborate 命令 ====================

/**
 * Mx_ShowCollaborate 命令：显示协同侧边栏
 */
MxFun.addCommand('Mx_ShowCollaborate', () => {
  Logger.info('========== 执行 Mx_ShowCollaborate 命令 ==========');

  // 触发自定义事件，通知侧边栏管理器打开协同侧边栏
  const event = new CustomEvent('mxcad-open-sidebar', {
    detail: { type: 'collaborate' },
  });
  window.dispatchEvent(event);
  Logger.info('已触发打开协同侧边栏事件');
});

// ==================== Mx_Save 命令 ====================

/**
 * Mx_Save 命令：保存当前 CAD 文件
 */
MxFun.addCommand('Mx_Save', async () => {
  try {
    Logger.info('========== 执行 Mx_Save 命令 ==========');

    // 检查是否处于只读模式（历史版本访问）
    if (isBrowseMode) {
      Logger.warn('当前处于只读模式（历史版本），禁止保存文件');
      alert('当前处于只读模式（历史版本访问），无法保存文件！');
      return;
    }

    // 检查 CAD_SAVE 权限
    const projectId = currentFileInfo?.projectId;
    if (projectId) {
      try {
        const { useProjectPermission } =
          await import('../hooks/useProjectPermission');
        const { checkPermission } = useProjectPermission();
        const canSave = await checkPermission(projectId, 'CAD_SAVE');
        if (!canSave) {
          Logger.warn('用户没有 CAD_SAVE 权限');
          alert('您没有保存图纸的权限');
          return;
        }
      } catch (error) {
        Logger.error('权限检查失败', error);
      }
    }

    // 检查当前文件信息
    if (!currentFileInfo) {
      Logger.error('当前文件信息为空，无法保存');
      alert('无法获取当前文件信息，请重新打开文件');
      return;
    }

    const { fileId, name } = currentFileInfo;
    Logger.info(`准备保存文件: fileId=${fileId}, name=${name}`);

    // 显示保存确认弹框，获取提交信息
    const commitMessage = await showSaveConfirmDialog();
    if (commitMessage === null) {
      Logger.info('用户取消保存');
      return;
    }

    // 显示加载动画
    showLoadingOverlay('正在保存文件...');

    // 保存文件为 mxweb 格式
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
            Logger.error('保存文件失败', e);
          }
        },
        false, // isDownload
        false, // isShowSaveFileDialog
        undefined // compression
      );
    });

    Logger.info('文件保存到内存成功，开始上传到服务器');

    // 上传到服务器
    updateLoadingMessage('正在上传到服务器...');
    await mxcadApi.saveMxwebFile(
      savedFile.blob,
      fileId,
      (percentage) => {
        updateLoadingMessage(`正在上传到服务器... ${percentage.toFixed(1)}%`);
      },
      commitMessage
    );

    Logger.info('服务器上传成功，开始更新本地缓存');

    // 更新 indexedDB 中的缓存
    try {
      // 获取当前文件的 URL
      const fileInfoResponse = await apiService.get(
        `/file-system/nodes/${fileId}`
      );
      const fileInfo = fileInfoResponse.data;

      if (fileInfo.path) {
        // 构建缓存路径
        const cachePath = `/mxcad/filesData/${fileInfo.path}`;
        Logger.info(`缓存路径: ${cachePath}`);

        // 直接连接 indexedDB 更新缓存
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('emscripten_filesystem', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });

        const transaction = db.transaction(['FILES'], 'readwrite');
        const objectStore = transaction.objectStore('FILES');

        // 直接存储 ArrayBuffer
        await new Promise<void>((resolve, reject) => {
          const request = objectStore.put(savedFile.data.buffer, cachePath);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });

        Logger.success(`indexedDB 缓存更新成功: ${cachePath}`);
      }
    } catch (cacheError) {
      Logger.error('更新 indexedDB 缓存失败，但不影响保存结果', cacheError);
      // 缓存更新失败不影响主流程，继续显示保存成功
    }

    Logger.success('文件保存成功');
    hideLoadingOverlay();
    alert('文件保存成功');
  } catch (error) {
    Logger.error('保存文件失败', error);
    hideLoadingOverlay();
    const errorMessage =
      error instanceof Error ? error.message : '保存失败，请稍后重试';
    alert(errorMessage);
  }
});
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
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 300px;
        right: 0;
        bottom: 0;
        pointer-events: none;
      `;
      document.body.appendChild(container);
      Logger.info('创建永不销毁的全局容器');
    }

    this.globalContainer = container;
  }

  /**
   * 调整容器位置，为侧边栏留出空间
   * @param sidebarWidth 侧边栏宽度
   */
  adjustContainerPosition(sidebarWidth: number = 300): void {
    if (this.globalContainer) {
      this.globalContainer.style.left = `${sidebarWidth}px`;
      Logger.info(`调整CAD编辑器容器位置，左边距: ${sidebarWidth}px`);
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
      this.globalContainer.style.display = show ? 'block' : 'none';
      this.globalContainer.style.pointerEvents = show ? 'auto' : 'none';
      Logger.info(`${show ? '显示' : '隐藏'} MxCAD 容器`);
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

  async initialize(initialFileUrl?: string): Promise<MxCADView> {
    Logger.info('MxCADView 初始化开始', {
      initialFileUrl,
      hasExistingView: !!this.mxcadView,
      isInitialized: this.isInitialized,
    });

    // 如果实例已存在且已初始化，直接返回现有实例
    if (this.mxcadView && this.isInitialized) {
      Logger.info('复用现有 MxCADView 实例');

      // 如果传入了新文件URL，则使用 openWebFile 打开新文件
      if (initialFileUrl) {
        Logger.info('切换到新文件', { initialFileUrl });
        await this.openFile(initialFileUrl);
      }

      return this.mxcadView;
    }

    // 如果正在初始化中，等待完成
    if (this.initPromise) {
      Logger.info('等待初始化完成');
      await this.initPromise;

      // 等待初始化完成后，如果有文件URL则打开
      if (initialFileUrl) {
        Logger.info('初始化完成后切换到新文件', { initialFileUrl });
        await this.openFile(initialFileUrl);
      }

      return this.mxcadView!;
    }

    // 创建新实例（只执行一次）
    Logger.info('创建新实例', { initialFileUrl });
    this.initPromise = this.createInstance(initialFileUrl);
    await this.initPromise;
    this.initPromise = null;

    return this.mxcadView!;
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
        Logger.warn('图纸范围太小，无法生成缩略图');
        return undefined;
      }

      // 计算缩放比例（取宽高中较大的，确保图纸完整显示）
      const scale = Math.min(
        THUMBNAIL_CONFIG.TARGET_SIZE / w,
        THUMBNAIL_CONFIG.TARGET_SIZE / h
      );

      // 调整边界框以居中显示
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
      Logger.error('生成缩略图失败', error);
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
      const formData = new FormData();
      formData.append('file', blob, 'thumbnail.png');

      await mxcadApi.uploadThumbnail(nodeId, formData);
      Logger.success('缩略图上传成功');
      return true;
    } catch (error) {
      Logger.error('缩略图上传失败', error);
      return false;
    }
  }

  /**
   * 将 DataURL 转换为 Blob
   */
  private dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
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
      if (currentFileInfo) {
        globalThis.MxPluginContext.useFileName().fileName.value =
          ' - ' + currentFileInfo.name;

        try {
          const fileId = currentFileInfo.fileId;
          const thumbnailResult = await mxcadApi.checkThumbnail(fileId);

          if (!thumbnailResult.data.exists) {
            Logger.info('缩略图不存在，开始生成...');
            const imageData = await this.generateThumbnail();
            if (imageData) {
              Logger.info('缩略图生成成功，开始上传...');
              await this.uploadThumbnail(fileId, imageData);
            }
          }
        } catch (error) {
          Logger.error('缩略图处理失败', error);
        }
      }

      // 根据只读模式标志设置或取消只读模式
      if (isBrowseMode) {
        Logger.info('文件打开完成，设置只读模式');
        this.mxcadView?.mxcad.setBrowse(true);
      } else {
        Logger.info('文件打开完成，取消只读模式');
        this.mxcadView?.mxcad.setBrowse(false);
      }

      // 注意：不移除监听器，让监听器持续存在以支持多次打开文件
    };

    this.mxcadView?.mxcad.on('openFileComplete', onOpen);
  }

  /**
   * 构建视图选项
   * @param openFile 初始文件 URL
   * @returns 视图选项对象
   */
  private buildViewOptions(openFile?: string): ViewOptions {
    const containerManager = MxCADContainerManager.getInstance();
    const viewOptions: ViewOptions = {
      rootContainer: containerManager.getContainer(),
    };

    if (openFile) {
      viewOptions.openFile = openFile;
      Logger.info('第一次初始化，设置初始文件', { openFile });
    } else {
      Logger.info('第一次初始化，未设置初始文件');
    }

    return viewOptions;
  }

  /**
   * 监听 MxCAD 应用创建完成事件
   */
  private setupInitializationListener(): void {
    MxFun.on('mxcadApplicationCreatedMxCADObject', () => {
      this.isInitialized = true;
      Logger.success('MxCADView 实例初始化完成');
    });
  }

  /**
   * 创建新 MxCADView 实例
   * @param openFile 初始文件 URL
   */
  private async createInstance(openFile?: string): Promise<void> {
    try {
      Logger.info('创建新的 MxCADView 实例', { openFile });

      const viewOptions = this.buildViewOptions(openFile);
      this.mxcadView = new MxCADView(viewOptions);

      this.mxcadView.create();
      this.setupFileOpenListener();
      this.setupInitializationListener();

      Logger.info('MxCADView 实例创建完成，等待初始化事件');
    } catch (error) {
      Logger.error('MxCADView 实例创建失败', error);
      this.mxcadView = null;
      this.isInitialized = false;
      throw error;
    }
  }

  async openFile(fileUrl: string): Promise<void> {
    if (!this.mxcadView || !this.isInitialized) {
      throw new Error('MxCADView 实例未初始化');
    }
    try {
      // 始终记录当前 mxweb URL（即使是相同文件也需要记录）
      currentMxwebUrl = fileUrl;

      // 检查当前是否已有打开的文件
      const currentFileName = this.getCurrentFileName();
      const targetFileName = fileUrl.split('/').pop();

      // 如果目标文件已经打开，则跳过
      // 注意：使用精确匹配，因为历史版本文件名（xxx_v78.mxweb）和当前版本（xxx.mxweb）可能被 includes 误匹配
      if (
        currentFileName &&
        targetFileName &&
        currentFileName === targetFileName
      ) {
        Logger.info('目标文件已打开，跳过重复操作', {
          currentFileName,
          targetFileName,
        });
        return;
      }

      Logger.info('准备打开文件', { fileUrl, currentFileName, targetFileName });

      // 检查 mxcad 对象是否可用
      if (!this.mxcadView?.mxcad) {
        Logger.error('mxcad 对象不可用，无法打开文件');
        throw new Error('mxcad 对象不可用');
      }

      // 使用重试机制打开文件，防止 mxdrawObject 未初始化的问题
      for (
        let attempt = 0;
        attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
        attempt++
      ) {
        try {
          // 使用 openWebFile 方法打开文件
          // 这是 MxCADView 实例创建后打开文件的正确方式
          this.mxcadView.mxcad.openWebFile(fileUrl);

          Logger.success('使用 openWebFile 方法打开文件成功', { fileUrl });
          return;
        } catch (error) {
          const err = error as Error;
          if (err.message && err.message.includes('mxdrawObject')) {
            Logger.warn(
              `mxdrawObject 未准备好，重试 ${attempt + 1}/${FILE_OPEN_RETRY_CONFIG.MAX_RETRIES}`,
              error
            );

            if (attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS)
              );
              continue;
            }
          }

          // 如果不是 mxdrawObject 相关错误，或者是最后一次重试，抛出错误
          Logger.error('打开文件时发生错误', error);
          throw error;
        }
      }
    } catch (error) {
      Logger.error('打开文件时发生错误', error);
      throw error;
    }
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
    if (!currentMxwebUrl) {
      Logger.warn('没有记录的 mxweb URL，无法重新加载');
      return false;
    }

    try {
      Logger.info('重新加载当前文件:', currentMxwebUrl);

      // 直接使用 openWebFile 打开，跳过重复文件检查
      if (!this.mxcadView?.mxcad) {
        Logger.error('mxcad 对象不可用，无法重新加载文件');
        return false;
      }

      // 使用重试机制打开文件
      for (
        let attempt = 0;
        attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
        attempt++
      ) {
        try {
          this.mxcadView.mxcad.openWebFile(currentMxwebUrl);
          Logger.success('重新加载文件成功:', currentMxwebUrl);
          return true;
        } catch (error) {
          const err = error as Error;
          if (err.message && err.message.includes('mxdrawObject')) {
            Logger.warn(
              `mxdrawObject 未准备好，重试 ${attempt + 1}/${FILE_OPEN_RETRY_CONFIG.MAX_RETRIES}`,
              error
            );
            if (attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS)
              );
              continue;
            }
          }
          throw error;
        }
      }
      return false;
    } catch (error) {
      Logger.error('重新加载文件失败:', error);
      return false;
    }
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

  async initializeMxCADView(initialFileUrl?: string): Promise<MxCADView> {
    return this.instanceManager.initialize(initialFileUrl);
  }

  showMxCAD(show: boolean = true): void {
    this.containerManager.showContainer(show);
  }

  getCurrentView(): MxCADView | null {
    return this.instanceManager.getCurrentView();
  }

  async openFile(fileUrl: string): Promise<void> {
    return this.instanceManager.openFile(fileUrl);
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

  setBrowse(is: boolean) {
    isBrowseMode = is;
    Logger.info(`设置只读模式标志: ${is}`);
    // 实际的 setBrowse 调用会在文件打开完成事件 (openFileComplete) 中执行
  }

  /**
   * 获取当前打开的文件信息
   * @returns 当前文件信息，如果没有打开的文件则返回 null
   */
  getCurrentFileInfo(): {
    fileId: string;
    parentId: string | null;
    projectId: string | null;
    name: string;
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
