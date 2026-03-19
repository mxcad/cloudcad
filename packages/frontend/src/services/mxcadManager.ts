///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

﻿import { MxCADView } from 'mxcad-app';

import { mxcadApi } from './mxcadApi';
import { filesApi } from './filesApi';
import { projectsApi } from './projectsApi';
import { MxFun } from 'mxdraw';
import { McGePoint3d, MxCpp } from 'mxcad';
import { calculateFileHash } from '../utils/hashUtils';
import { uploadMxCadFile } from '../utils/mxcadUploadUtils';
import { UrlHelper } from '@/utils/mxcadUtils';
import { globalShowToast } from '../contexts/NotificationContext';

// ==================== 类型定义 ====================


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
      console.info(`清理 ${deletedCount} 个旧版本缓存`, 'mxcadManager', {
        filePath,
        keepTimestamp,
      });
    }
  } catch (error) {
    console.warn('清理旧缓存失败', 'mxcadManager', {
      filePath,
      keepTimestamp,
      error,
    });
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
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  personalSpaceId?: string | null; // 私人空间 ID，用于判断是否为私人空间模式
} | null = null;

// 私人空间 ID 缓存（用于判断文件是否属于私人空间）
let cachedPersonalSpaceId: string | null = null;

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
  // 私人空间路径
  PERSONAL_SPACE: '/personal-space',
  PERSONAL_SPACE_FOLDER: (parentId: string) => `/personal-space/${parentId}`,
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
  parentId: string | null | undefined,
  projectId: string | null | undefined,
  personalSpaceId: string | null | undefined
): string {
  // 判断是否为私人空间模式：projectId 等于 personalSpaceId
  const isPersonalSpace = projectId && personalSpaceId && projectId === personalSpaceId;

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

  const { parentId, projectId, personalSpaceId } = currentFileInfo;
  const targetPath = calculateReturnPath(parentId, projectId, personalSpaceId);
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

// ==================== 重复文件确认弹框 ====================

/**
 * 显示重复文件确认弹框
 * @param filename 文件名
 * @returns Promise<'open' | 'upload' | null> 用户选择：打开已有文件、继续上传、或取消
 */
const showDuplicateFileDialog = (filename: string): Promise<'open' | 'upload' | null> => {
  return new Promise((resolve) => {
    const dialogId = 'mxcad-duplicate-file-dialog';
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
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">发现相同文件</h3>
          <button id="mxcad-duplicate-dialog-close" style="
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
          <div style="
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 16px;
          ">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: #fef3c7;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <div>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;">
                当前目录中已存在相同的文件：
              </p>
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1f2937; word-break: break-all;">
                ${filename}
              </p>
            </div>
          </div>
          <p style="margin: 0; font-size: 13px; color: #6b7280;">
            您可以选择直接打开已存在的文件，或上传新文件。
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
          <button id="mxcad-duplicate-dialog-cancel" style="
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
          <button id="mxcad-duplicate-dialog-upload" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: #6b7280;
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            上传新文件
          </button>
          <button id="mxcad-duplicate-dialog-open" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: #4f46e5;
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            打开已有文件
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const closeBtn = dialog.querySelector('#mxcad-duplicate-dialog-close');
    const cancelBtn = dialog.querySelector('#mxcad-duplicate-dialog-cancel');
    const uploadBtn = dialog.querySelector('#mxcad-duplicate-dialog-upload');
    const openBtn = dialog.querySelector('#mxcad-duplicate-dialog-open');

    const cleanup = () => {
      document.body.removeChild(dialog);
    };

    closeBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    uploadBtn?.addEventListener('click', () => {
      cleanup();
      resolve('upload');
    });

    openBtn?.addEventListener('click', () => {
      cleanup();
      resolve('open');
    });

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        cleanup();
        resolve(null);
      }
    });
  });
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
 * 根据当前打开的文件所属空间决定上传目标：
 * - 未打开任何文件 → 上传到私人空间根目录
 * - 当前文件属于私人空间 → 上传到父目录（或根目录）
 * - 当前文件属于项目 → 上传到私人空间根目录
 * @throws {Error} 如果无法获取私人空间
 */
async function getUploadTargetNodeId(): Promise<string> {
  // 1. 获取私人空间
  const personalSpaceResponse = await projectsApi.getPersonalSpace();
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
      console.error('获取根节点失败', 'mxcadManager', error);
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
      },
    })
  );
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
    showLoadingOverlay(DEFAULT_MESSAGES.CALCULATING_HASH);
    const hash = await calculateFileHash(file);

    // 检查目录中是否存在重复文件
    const duplicateCheck = await mxcadApi.checkDuplicateFile({
      fileHash: hash,
      filename: file.name,
      nodeId: uploadTargetNodeId,
    });

    if (duplicateCheck.isDuplicate && duplicateCheck.existingNodeId) {
      // 隐藏加载动画
      hideLoadingOverlay();

      // 显示确认对话框
      const userChoice = await showDuplicateFileDialog(file.name);

      if (userChoice === 'open') {
        // 用户选择打开已有文件
        showLoadingOverlay(DEFAULT_MESSAGES.OPENING_FILE);
        await openUploadedFile(duplicateCheck.existingNodeId, uploadTargetNodeId);
        hideLoadingOverlay();
        return;
      } else if (userChoice === null) {
        // 用户取消
        return;
      }
      // userChoice === 'upload' 继续上传流程
    }

    // 继续上传流程
    showLoadingOverlay(DEFAULT_MESSAGES.UPLOADING);
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

    await openUploadedFile(uploadResult.nodeId, uploadTargetNodeId);
    hideLoadingOverlay();
  } catch (error) {
    hideLoadingOverlay();
    const errorMessage =
      error instanceof Error ? error.message : '文件上传失败';
    globalShowToast(errorMessage, 'error');
  }
}

// ==================== openFile 命令 ====================

/**
 * openFile 命令：上传文件并打开
 */
MxFun.addCommand('openFile', async () => {
  try {
    const uploadTargetNodeId = await getUploadTargetNodeId();

    const picker = getFilePicker();
    picker.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        picker.value = '';
        return;
      }

      const selectedFile = files[0];
      if (selectedFile) {
        await handleFileSelection(selectedFile, uploadTargetNodeId);
      }
      picker.value = '';
    };

    picker.click();
  } catch (error) {
    console.error('openFile 命令初始化失败', 'mxcadManager', error);
    globalShowToast(
      error instanceof Error ? error.message : '命令执行失败',
      'error'
    );
  }
});

// ==================== exportFile 命令 ====================

/**
 * exportFile 命令：打开下载格式选择弹窗
 */
MxFun.addCommand('exportFile', async () => {
  if (!currentFileInfo) {
    globalShowToast('无法获取当前文件信息，请重新打开文件', 'error');
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

// ==================== Mx_Save 命令 ====================

/**
 * Mx_Save 命令：保存当前 CAD 文件
 */
MxFun.addCommand('Mx_Save', async () => {
  try {
    const projectId = currentFileInfo?.projectId;
    if (projectId) {
      try {
        const { useProjectPermission } =
          await import('../hooks/useProjectPermission');
        const { checkPermission } = useProjectPermission();
        const canSave = await checkPermission(projectId, 'CAD_SAVE');
        if (!canSave) {
          globalShowToast('您没有保存图纸的权限', 'error');
          return;
        }
      } catch (error) {
        console.error('权限检查失败', error);
      }
    }

    if (!currentFileInfo) {
      globalShowToast('无法获取当前文件信息，请重新打开文件', 'error');
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
            console.error('保存文件失败', e);
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
        const cachePath = `/api/mxcad/filesData/${fileInfo.path}`;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('emscripten_filesystem', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });

        const transaction = db.transaction(['FILES'], 'readwrite');
        const objectStore = transaction.objectStore('FILES');

        await new Promise<void>((resolve, reject) => {
          const request = objectStore.put(savedFile.data, cachePath);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      }
    } catch (cacheError) {
      console.warn('更新本地缓存失败', cacheError);
    }

    hideLoadingOverlay();
    globalShowToast('文件保存成功', 'success');
  } catch (error) {
    console.error('保存文件失败', error);
    hideLoadingOverlay();
    const errorMessage =
      error instanceof Error ? error.message : '保存失败，请稍后重试';
    globalShowToast(errorMessage, 'error');
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
      // 初始状态：隐藏，使用 visibility + z-index 方案保护 WebGL 上下文
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 300px;
        right: 0;
        bottom: 0;
        visibility: hidden;
        z-index: -1;
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
      // z-index 控制层级，隐藏时放到最底层避免遮挡其他元素
      // pointer-events 禁用交互
      if (show) {
        this.globalContainer.style.visibility = 'visible';
        this.globalContainer.style.zIndex = '9999';
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

      const formData = new FormData();
      formData.append('file', blob, 'thumbnail.png');

      await mxcadApi.uploadThumbnail(nodeId, formData);
      return true;
    } catch (error) {
      console.error('缩略图上传失败', error);
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
      if (currentFileInfo) {
        globalThis.MxPluginContext.useFileName().fileName.value =
          ' - ' + currentFileInfo.name;

        try {
          const fileId = currentFileInfo.fileId;
          const thumbnailResult = await mxcadApi.checkThumbnail(fileId);

          if (!thumbnailResult?.exists) {
            const imageData = await this.generateThumbnail();
            if (imageData) {
              await this.uploadThumbnail(fileId, imageData);
            }
          }
        } catch (error) {
          console.error('缩略图处理失败', error);
        }

        // 清理旧版本缓存（如果有缓存时间戳）
        if (currentCacheTimestamp && currentFileInfo && currentMxwebUrl) {
          try {
            const urlWithoutTimestamp = currentMxwebUrl.replace(/\?t=\d+$/, '');
            const pathMatch = urlWithoutTimestamp.match(
              /\/api\/mxcad\/filesData\/(.*)/
            );
            if (pathMatch?.[1]) {
              await clearOldMxwebCache(pathMatch[1], currentCacheTimestamp);
            }
          } catch (error) {
            console.warn('清理旧缓存失败', error);
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

    return {
      rootContainer: containerManager.getContainer(),
      ...(openFile && { openFile }),
      ...(token && { requestHeaders: { Authorization: `Bearer ${token}` } })
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
      console.error('MxCADView 实例创建失败', error);
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
      if (
        currentFileName &&
        targetFileName &&
        currentFileName === targetFileName
      ) {
        return;
      }

      if (!this.mxcadView?.mxcad) {
        throw new Error('mxcad 对象不可用');
      }

      const token = localStorage.getItem('accessToken');
      for (
        let attempt = 0;
        attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
        attempt++
      ) {
        try {
          this.mxcadView.mxcad.openWebFile(
            fileUrl,
            undefined,
            true,
            token
              ? { requestHeaders: { Authorization: `Bearer ${token}` } }
              : undefined,
            0
          );
          return;
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
          throw error;
        }
      }
    } catch (error) {
      console.error('打开文件时发生错误', error);
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

      for (
        let attempt = 0;
        attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
        attempt++
      ) {
        try {
          this.mxcadView.mxcad.openWebFile(
            currentMxwebUrl,
            undefined,
            true,
            token
              ? { requestHeaders: { Authorization: `Bearer ${token}` } }
              : undefined,
            0
          );
          return true;
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
          throw error;
        }
      }
      return false;
    } catch (error) {
      console.error('重新加载文件失败:', error);
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

  /**
   * 获取当前打开的文件信息
   * @returns 当前文件信息，如果没有打开的文件则返回 null
   */
  getCurrentFileInfo(): {
    fileId: string;
    parentId: string | null | undefined;
    projectId: string | null | undefined;
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
