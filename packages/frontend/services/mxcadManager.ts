import { MxCADView } from 'mxcad-app';
import { logger as Logger, UrlHelper } from '../utils/mxcadUtils';
import { mxcadApi } from './mxcadApi';
import { filesApi } from './filesApi';
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

// ==================== IndexedDB 缓存管理工具 ====================

/**
 * 清理 mxweb 文件的旧版本 IndexedDB 缓存
 * @param filePath 文件路径（如: 202602/xxx/xxx.dwg.mxweb）
 * @param keepTimestamp 要保留的缓存版本时间戳
 */
async function clearOldMxwebCache(
  filePath: string,
  keepTimestamp: number
): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('emscripten_filesystem', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const transaction = db.transaction(['FILES'], 'readwrite');
    const objectStore = transaction.objectStore('FILES');

    const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = objectStore.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as IDBValidKey[]);
    });

    let deletedCount = 0;
    for (const key of allKeys) {
      const keyStr = String(key);

      if (
        keyStr.includes(filePath) &&
        keyStr.includes('?t=') &&
        !keyStr.includes(`?t=${keepTimestamp}`)
      ) {
        await new Promise<void>((resolve, reject) => {
          const request = objectStore.delete(key);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      Logger.info(`清理 ${deletedCount} 个旧版本缓存`, { filePath, keepTimestamp });
    }
  } catch (error) {
    Logger.warn('清理旧缓存失败', { filePath, keepTimestamp, error });
  }
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

// 当前文件的缓存时间戳（用于清理旧缓存）
let currentCacheTimestamp: number | undefined = undefined;

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
    navigateFunction(path);
  }
}

function navigateToProjectsList(): void {
  navigateTo(NAVIGATION_PATHS.PROJECTS_LIST);
}

function calculateReturnPath(
  parentId: string | null,
  projectId: string | null
): string {
  if (parentId && projectId) {
    return NAVIGATION_PATHS.PROJECT_FOLDER(projectId, parentId);
  } else if (parentId) {
    return NAVIGATION_PATHS.PROJECT_FILES(parentId);
  } else if (projectId) {
    return NAVIGATION_PATHS.PROJECT_FILES(projectId);
  }
  return NAVIGATION_PATHS.PROJECTS_LIST;
}

// ==================== return-to-cloud-map-management 命令 ====================

/**
 * 返回到云图管理命令
 */
MxFun.addCommand('return-to-cloud-map-management', () => {
  mxcadManager.showMxCAD(false);

  if (!currentFileInfo) {
    navigateToProjectsList();
    return;
  }

  const { parentId, projectId } = currentFileInfo;
  const targetPath = calculateReturnPath(parentId, projectId);
  navigateTo(targetPath);
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

  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  await mxcadManager.openFile(mxcadFileUrl);

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
    showLoadingOverlay(DEFAULT_MESSAGES.UPLOADING);
    const newNodeId = await uploadAndProcessFile(file, uploadTargetNodeId);
    await openUploadedFile(newNodeId, uploadTargetNodeId);
    hideLoadingOverlay();
  } catch (error) {
    hideLoadingOverlay();
    const errorMessage = error instanceof Error ? error.message : '文件上传失败';
    alert(errorMessage);
  }
}

// ==================== openFile 命令 ====================

/**
 * openFile 命令：上传文件并打开
 */
MxFun.addCommand('openFile', async () => {
  try {
    const uploadTargetNodeId = getUploadTargetNodeId();

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
  if (!currentFileInfo) {
    alert('无法获取当前文件信息，请重新打开文件');
    return;
  }

  const event = new CustomEvent('mxcad-export-file', {
    detail: {
      fileId: currentFileInfo.fileId,
      fileName: currentFileInfo.name,
    },
  });

  window.dispatchEvent(event);
});

// ==================== Mx_ShowSidebar 命令 ====================

/**
 * Mx_ShowSidebar 命令：显示图库侧边栏
 */
MxFun.addCommand('Mx_ShowSidebar', () => {
  window.dispatchEvent(new CustomEvent('mxcad-open-sidebar', {
    detail: { type: 'gallery' },
  }));
});

// ==================== Mx_ShowCollaborate 命令 ====================

/**
 * Mx_ShowCollaborate 命令：显示协同侧边栏
 */
MxFun.addCommand('Mx_ShowCollaborate', () => {
  window.dispatchEvent(new CustomEvent('mxcad-open-sidebar', {
    detail: { type: 'collaborate' },
  }));
});

// ==================== Mx_Save 命令 ====================

/**
 * Mx_Save 命令：保存当前 CAD 文件
 */
MxFun.addCommand('Mx_Save', async () => {
  try {
    if (isBrowseMode) {
      alert('当前处于只读模式（历史版本访问），无法保存文件！');
      return;
    }

    const projectId = currentFileInfo?.projectId;
    if (projectId) {
      try {
        const { useProjectPermission } =
          await import('../hooks/useProjectPermission');
        const { checkPermission } = useProjectPermission();
        const canSave = await checkPermission(projectId, 'CAD_SAVE');
        if (!canSave) {
          alert('您没有保存图纸的权限');
          return;
        }
      } catch (error) {
        Logger.error('权限检查失败', error);
      }
    }

    if (!currentFileInfo) {
      alert('无法获取当前文件信息，请重新打开文件');
      return;
    }

    const { fileId, name } = currentFileInfo;
    const commitMessage = await showSaveConfirmDialog();
    if (commitMessage === null) {
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

    updateLoadingMessage('正在上传到服务器...');
    await mxcadApi.saveMxwebFile(
      savedFile.blob,
      fileId,
      (percentage) => {
        updateLoadingMessage(`正在上传到服务器... ${percentage.toFixed(1)}%`);
      },
      commitMessage
    );

    // 更新本地缓存
    try {
      const fileInfoResponse = await filesApi.get(fileId);
      const fileInfo = fileInfoResponse.data;

      if (fileInfo.path) {
        const cachePath = `/mxcad/filesData/${fileInfo.path}`;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('emscripten_filesystem', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });

        const transaction = db.transaction(['FILES'], 'readwrite');
        const objectStore = transaction.objectStore('FILES');

        await new Promise<void>((resolve, reject) => {
          const request = objectStore.put(savedFile.data.buffer, cachePath);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      }
    } catch (cacheError) {
      Logger.warn('更新本地缓存失败', cacheError);
    }

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
      this.globalContainer.style.display = show ? 'block' : 'none';
      this.globalContainer.style.pointerEvents = show ? 'auto' : 'none';
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
      return this.mxcadView!;
    }

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

      if (w < THUMBNAIL_CONFIG.MIN_DRAWING_SIZE || h < THUMBNAIL_CONFIG.MIN_DRAWING_SIZE) {
        return undefined;
      }

      const scale = Math.min(THUMBNAIL_CONFIG.TARGET_SIZE / w, THUMBNAIL_CONFIG.TARGET_SIZE / h);
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

          if (!thumbnailResult.data?.exists) {
            const imageData = await this.generateThumbnail();
            if (imageData) {
              await this.uploadThumbnail(fileId, imageData);
            }
          }
        } catch (error) {
          Logger.error('缩略图处理失败', error);
        }

        // 清理旧版本缓存（如果有缓存时间戳）
        if (currentCacheTimestamp && currentFileInfo && currentMxwebUrl) {
          try {
            const urlWithoutTimestamp = currentMxwebUrl.replace(/\?t=\d+$/, '');
            const pathMatch = urlWithoutTimestamp.match(/\/mxcad\/filesData\/(.*)/);
            if (pathMatch?.[1]) {
              await clearOldMxwebCache(pathMatch[1], currentCacheTimestamp);
            }
          } catch (error) {
            Logger.warn('清理旧缓存失败', error);
          }
        }
      }

      this.mxcadView?.mxcad.setBrowse(isBrowseMode);
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
    return {
      rootContainer: containerManager.getContainer(),
      ...(openFile && { openFile }),
    };
  }

  /**
   * 监听 MxCAD 应用创建完成事件
   */
  private setupInitializationListener(): void {
    MxFun.on('mxcadApplicationCreatedMxCADObject', () => {
      this.isInitialized = true;
    });
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

      this.mxcadView.create();
      this.setupFileOpenListener();
      this.setupInitializationListener();
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
      currentMxwebUrl = fileUrl;

      const currentFileName = this.getCurrentFileName();
      const targetFileName = fileUrl.split('/').pop();

      // 使用精确匹配避免历史版本文件名误匹配
      if (currentFileName && targetFileName && currentFileName === targetFileName) {
        return;
      }

      if (!this.mxcadView?.mxcad) {
        throw new Error('mxcad 对象不可用');
      }

      const token = localStorage.getItem('accessToken');

      for (let attempt = 0; attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
          this.mxcadView.mxcad.openWebFile(
            fileUrl,
            undefined,
            true,
            token ? { requestHeaders: { Authorization: `Bearer ${token}` } } : undefined,
            0
          );
          return;
        } catch (error) {
          const err = error as Error;
          if (err.message?.includes('mxdrawObject') && attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS));
            continue;
          }
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
    if (!currentMxwebUrl || !this.mxcadView?.mxcad) {
      return false;
    }

    try {
      const token = localStorage.getItem('accessToken');

      for (let attempt = 0; attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
          this.mxcadView.mxcad.openWebFile(
            currentMxwebUrl,
            undefined,
            true,
            token ? { requestHeaders: { Authorization: `Bearer ${token}` } } : undefined,
            0
          );
          return true;
        } catch (error) {
          const err = error as Error;
          if (err.message?.includes('mxdrawObject') && attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS));
            continue;
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
