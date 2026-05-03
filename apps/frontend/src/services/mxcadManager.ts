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

import { MxCADView } from 'mxcad-app';

import { mxcadApi } from './mxcadApi';
import { filesApi } from './filesApi';
import { projectsApi } from './projectsApi';
import { publicFileApi, API_BASE_URL } from './publicFileApi';
import { MxFun } from 'mxdraw';
import { FetchAttributes, McGePoint3d, MxCpp } from 'mxcad';
import { calculateFileHash } from '../utils/hashUtils';
import { uploadMxCadFile } from '../utils/mxcadUploadUtils';
import { UrlHelper } from '@/utils/mxcadUtils';
import { StoragePathConstants } from '@/constants/storage.constants';
import { globalShowToast } from '../contexts/NotificationContext';
import { isAuthenticated } from '../utils/authCheck';
  import { showGlobalLoading, hideGlobalLoading, setLoadingMessage } from '../utils/loadingUtils';

// ==================== 辅助函数 ====================

/**
 * 生成 CAD 编辑器标题显示的文件名
 * 根据用户登录状态添加前缀
 * @param fileName 原始文件名
 * @returns 格式化后的文件名（未登录时添加 [未登录] 前缀，empty_template.mxweb 不显示文件名）
 */
function formatEditorFileName(fileName: string): string {
  const isLoggedIn = isAuthenticated();
  const loginPrefix = isLoggedIn ? '' : '[未登录]';

  // empty_template.mxweb 文件不显示文件名
  if (fileName === 'empty_template.mxweb') {
    return loginPrefix;
  }

  return `${loginPrefix} - ${fileName}`;
}

// ==================== 配置常量 ====================

/**
 * CSS 类名配置
 */
const CSS_CLASSES = {
  GLOBAL_CONTAINER: 'mxcad-global-container',
  LOADING_OVERLAY: 'mxcad-loading-overlay',
  LOADING_SPINNER: 'mxcad-loading-spinner',
  LOADING_MESSAGE: 'mxcad-loading-message',
};

/**
 * 默认消息文本
 */
const DEFAULT_MESSAGES = {
  LOADING: '正在加载...',
  CALCULATING_HASH: '正在计算文件哈希...',
  UPLOADING: '正在上传',
  OPENING_FILE: '正在打开文件...',
};

/**
 * 文件上传配置
 */
const FILE_UPLOAD_CONFIG = {
  FILE_PICKER_ID: 'mxcad-file-picker',
  ALLOWED_EXTENSIONS: '.dwg,.dxf,.dwt,.mxweb,.mxwbe',
};

/**
 * 文件重试配置
 */
const FILE_OPEN_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

/**
 * 缩略图配置
 */
const THUMBNAIL_CONFIG = {
  MIN_DRAWING_SIZE: 100,
  TARGET_SIZE: 200,
};

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
  updatedAt?: string; // 乐观锁时间戳
} | null = null;

// 私人空间 ID 缓存（用于判断文件是否属于私人空间）
let cachedPersonalSpaceId: string | null = null;

// 文档修改状态跟踪
let documentModified = false;

// 待上传的图片列表
interface PendingImage {
  url: string;
  fileName: string;
  entity: any; // MxCAD 实体对象
  file?: File; // 下载的文件对象
}

let pendingImages: PendingImage[] = [];

/**
 * 检查文档是否有未保存的修改
 * 尝试从 MxCAD SDK 获取修改状态，如果不可用则使用本地跟踪状态
 */
export function isDocumentModified(): boolean {
  try {
    const mxcad = MxCpp.getCurrentMxCAD();
    // MxCAD SDK 可能提供 isModified 属性
    if (
      mxcad &&
      typeof (mxcad as unknown as { isModified?: boolean }).isModified ===
        'boolean'
    ) {
      return (mxcad as unknown as { isModified: boolean }).isModified;
    }
  } catch {
    // 静默处理：SDK 不支持 isModified 属性
  }
  // 回退到本地跟踪状态
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
 * 显示未保存更改确认对话框
 * @returns Promise<'save' | 'discard' | 'cancel'> 用户选择：保存、放弃更改、取消
 */
export function showUnsavedChangesDialog(): Promise<
  'save' | 'discard' | 'cancel'
> {
  return new Promise((resolve) => {
    const dialogId = 'mxcad-unsaved-changes-dialog';
    let dialog = document.getElementById(dialogId) as HTMLElement;

    if (dialog) {
      document.body.removeChild(dialog);
    }

    // 获取当前主题
    const currentTheme =
      document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';

    dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-overlay, ${isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(15, 23, 42, 0.5)'});
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      <div style="
        background: var(--bg-elevated, ${isDark ? '#2a2f35' : '#ffffff'});
        border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
        border-radius: 12px;
        box-shadow: var(--shadow-lg, 0 10px 15px ${isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'});
        width: 90%;
        max-width: 420px;
        overflow: hidden;
      ">
        <div style="
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        ">
          <div style="
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: ${isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7'};
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
          ">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
          </div>
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: var(--text-primary, ${isDark ? '#f0f4f8' : '#0f172a'});">
            未保存的更改
          </h3>
          <p style="margin: 0; font-size: 14px; color: var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'});">
            当前图纸有未保存的更改，是否保存？
          </p>
        </div>
        <div style="
          padding: 16px 20px;
          background: var(--bg-secondary, ${isDark ? '#1a1d21' : '#f8fafc'});
          border-top: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
          display: flex;
          justify-content: center;
          gap: 12px;
        ">
          <button id="mxcad-unsaved-cancel" style="
            padding: 10px 20px;
            border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
            border-radius: 8px;
            background: transparent;
            color: var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'});
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='var(--bg-tertiary, ${isDark ? '#22262b' : '#f1f5f9'})'; this.style.color='var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'})'" onmouseout="this.style.background='transparent'; this.style.color='var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'})'">
            取消
          </button>
          <button id="mxcad-unsaved-discard" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: var(--error, #ef4444);
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'});
          " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='var(--shadow-md, 0 4px 6px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)'})'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'})'">
            不保存
          </button>
          <button id="mxcad-unsaved-save" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, var(--primary-600, ${isDark ? '#a5b4fc' : '#4f46e5'}), var(--primary-500, ${isDark ? '#818cf8' : '#6366f1'}));
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'});
          " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='var(--shadow-md, 0 4px 6px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)'})${isDark ? ', 0 0 20px rgba(99, 102, 241, 0.3)' : ''}'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'})'">
            保存
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#mxcad-unsaved-cancel');
    const discardBtn = dialog.querySelector('#mxcad-unsaved-discard');
    const saveBtn = dialog.querySelector('#mxcad-unsaved-save');

    const cleanup = () => {
      if (dialog && dialog.parentNode) {
        dialog.parentNode.removeChild(dialog);
      }
    };

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve('cancel');
    });

    discardBtn?.addEventListener('click', () => {
      cleanup();
      resolve('discard');
    });

    saveBtn?.addEventListener('click', () => {
      cleanup();
      resolve('save');
    });

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        cleanup();
        resolve('cancel');
      }
    });

    // ESC 键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeyDown);
        cleanup();
        resolve('cancel');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
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
      console.error('保存失败:', error);
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
  path?: string; // 节点完整路径(如: 202604/cmnsaru53000d4sufzcg9wjlg.dwg.mxweb)
  fromPlatform?: boolean; // 是否从平台跳转进入
  updatedAt?: string; // 乐观锁时间戳
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

// ==================== return-to-cloud-map-management 命令 ====================

/**
 * 返回到云图管理命令
 */
MxFun.addCommand('return-to-cloud-map-management', () => {
  mxcadManager.showMxCAD(false);

  // 如果是从平台跳转进入的，并且当前窗口是由其他窗口打开的，直接关闭当前标签页
  if (currentFileInfo?.fromPlatform && window.opener) {
    window.close();
    return;
  }

  if (!currentFileInfo) {
    navigateToProjectsList();
    return;
  }

  const { parentId, projectId, personalSpaceId, libraryKey } = currentFileInfo;
  const targetPath = calculateReturnPath(
    parentId,
    projectId,
    personalSpaceId,
    libraryKey
  );
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

// ==================== 重复文件确认弹框 ====================

/**
 * 显示重复文件确认弹框
 * @param filename 文件名
 * @returns Promise<'open' | 'upload' | null> 用户选择：打开已有文件、继续上传、或取消
 */
const showDuplicateFileDialog = (
  filename: string
): Promise<'open' | 'upload' | null> => {
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

    // 获取当前主题
    const currentTheme =
      document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';

    dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-overlay, ${isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(15, 23, 42, 0.5)'});
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      <div style="
        background: var(--bg-elevated, ${isDark ? '#2a2f35' : '#ffffff'});
        border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
        border-radius: 12px;
        box-shadow: var(--shadow-lg, 0 10px 15px ${isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'});
        width: 90%;
        max-width: 450px;
        overflow: hidden;
      ">
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--text-primary, ${isDark ? '#f0f4f8' : '#0f172a'});">保存文件</h3>
          <button id="mxcad-save-dialog-close" style="
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: var(--text-muted, ${isDark ? '#5a6a7a' : '#94a3b8'});
            transition: color 0.2s ease;
          " onmouseover="this.style.color='var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'})'" onmouseout="this.style.color='var(--text-muted, ${isDark ? '#5a6a7a' : '#94a3b8'})'">
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
            color: var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'});
            margin-bottom: 8px;
          ">
            修改说明（可选）
          </label>
          <textarea id="mxcad-save-dialog-input" placeholder="请输入本次修改的内容说明..." style="
            width: 100%;
            height: 100px;
            padding: 12px;
            background: var(--bg-secondary, ${isDark ? '#1a1d21' : '#ffffff'});
            border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
            border-radius: 8px;
            font-size: 14px;
            color: var(--text-primary, ${isDark ? '#f0f4f8' : '#0f172a'});
            resize: vertical;
            box-sizing: border-box;
            font-family: inherit;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
          " onfocus="this.style.borderColor='var(--primary-500, ${isDark ? '#818cf8' : '#6366f1'})'; this.style.boxShadow='0 0 0 3px rgba(99, 102, 241, 0.2)'" onblur="this.style.borderColor='var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'})'; this.style.boxShadow='none'"></textarea>
          <p style="
            margin: 8px 0 0 0;
            font-size: 12px;
            color: var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'});
          ">
            此说明将记录在版本历史中，方便后续查看修改内容。
          </p>
        </div>
        <div style="
          padding: 16px 20px;
          background: var(--bg-secondary, ${isDark ? '#1a1d21' : '#f8fafc'});
          border-top: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        ">
          <button id="mxcad-save-dialog-cancel" style="
            padding: 10px 20px;
            border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
            border-radius: 8px;
            background: transparent;
            color: var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'});
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='var(--bg-tertiary, ${isDark ? '#22262b' : '#f1f5f9'})'; this.style.color='var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'})'" onmouseout="this.style.background='transparent'; this.style.color='var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'})'">
            取消
          </button>
          <button id="mxcad-save-dialog-confirm" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, var(--primary-600, ${isDark ? '#a5b4fc' : '#4f46e5'}), var(--primary-500, ${isDark ? '#818cf8' : '#6366f1'}));
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'});
          " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='var(--shadow-md, 0 4px 6px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)'})${isDark ? ', 0 0 20px rgba(99, 102, 241, 0.3)' : ''}'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'})'">
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
  fileInfo: { parentId?: string },
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
  setLoadingMessage(DEFAULT_MESSAGES.CALCULATING_HASH);
  const hash = await calculateFileHash(file);

  setLoadingMessage(DEFAULT_MESSAGES.UPLOADING);
  const uploadResult = await uploadMxCadFile({
    file,
    hash,
    nodeId: uploadTargetNodeId,
    onProgress: (percentage) => {
      setLoadingMessage(
        `${DEFAULT_MESSAGES.UPLOADING} ${percentage.toFixed(1)}%`
      );
    },
  });

  return uploadResult.nodeId;
}

/**
 * 等待文件转换完成（轮询检查）
 * @param nodeId 节点 ID
 * @param maxAttempts 最大尝试次数
 * @param intervalMs 检查间隔（毫秒）
 * @returns 文件信息，如果超时返回 null
 */
async function waitForFileReady(
  nodeId: string,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<{
  fileHash: string;
  path: string;
  name: string;
  parentId: string;
} | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fileInfoResponse = await filesApi.get(nodeId);
    const fileInfo = fileInfoResponse.data;

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
      const { libraryApi } = await import('./libraryApi');
      const nodeResponse = await libraryApi.getDrawingNode(nodeId);
      const node = nodeResponse.data as any;
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
    let libraryFileUrl = `/api/library/drawing/filesData/${finalNodePath}`;
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
    console.error('打开图纸库文件失败:', error);
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
    console.log(`
========================================
[前端日志] 打开图块库文件
- nodeId: ${nodeId}
- fileName: ${fileName}
- nodePath: ${nodePath}
- updatedAt: ${updatedAt}
- 调用时间: ${new Date().toISOString()}
- 调用堆栈:
${new Error().stack}
========================================
    `);

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
      const { libraryApi } = await import('./libraryApi');
      const nodeResponse = await libraryApi.getBlockNode(nodeId);
      const node = nodeResponse.data as any;
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
    let libraryFileUrl = `/api/library/block/filesData/${finalNodePath}`;
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
    console.error('打开图块库文件失败:', error);
    throw error;
  }
}

/**
 * 判断文件是否为 mxweb 格式
 */
function isMxwebFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return lowerFilename.endsWith('.mxweb') || lowerFilename.endsWith('.mxwbe');
}

/**
 * 判断文件是否需要转换（dwg/dxf）
 */
function isCadFile(filename: string): boolean {
  const ext = filename.toLowerCase();
  return ext.endsWith('.dwg') || ext.endsWith('.dxf') || ext.endsWith('.mxweb') || ext.endsWith('.mxwbe');
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
    setLoadingMessage('正在打开文件...');
    await mxcadManager.openFile(virtualUrl, noCache);

    // 设置当前文件名（用于侧边栏显示）
    setCurrentFileInfo({
      fileId: '',
      parentId: null,
      projectId: null,
      name: file.name,
      personalSpaceId: null,
    });

    hideGlobalLoading();
    globalShowToast('文件已打开', 'success');
  } catch (error) {
    hideGlobalLoading();
    const errorMessage =
      error instanceof Error ? error.message : '打开文件失败';
    globalShowToast(errorMessage, 'error');
  }
}

/**
 * 使用公开上传服务上传文件（未登录用户）
 * @param file 要上传的文件
 * @param noCache 是否无缓存打开（跳过秒传检查，强制重新上传）
 */
async function handlePublicUpload(file: File, noCache?: boolean): Promise<void> {
  try {
    showGlobalLoading('正在计算文件哈希...');
    const hash = await calculateFileHash(file);
    
    // 记录是否真正上传了文件（不是秒传）
    let isFileUploaded = false;

    // 无缓存模式：跳过秒传检查，直接上传
    if (noCache) {
      setLoadingMessage('正在上传文件...');
      await publicFileApi.uploadFile(
        file,
        5 * 1024 * 1024, // 5MB 分片
        (percentage) => {
          setLoadingMessage(`正在上传文件... ${percentage.toFixed(1)}%`);
        },
        true // 强制上传，跳过秒传
      );
      isFileUploaded = true;
    } else {
      // 1. 检查秒传
      setLoadingMessage('检查文件是否存在...');
      const checkResult = await publicFileApi.checkFile({
        filename: file.name,
        fileHash: hash,
      });

      if (!checkResult.exist) {
        // 2. 分片上传
        setLoadingMessage('正在上传文件...');
        await publicFileApi.uploadFile(
          file,
          5 * 1024 * 1024, // 5MB 分片
          (percentage) => {
            setLoadingMessage(`正在上传文件... ${percentage.toFixed(1)}%`);
          }
        );
        isFileUploaded = true;
      }
    }

    // 3. 只有在真正上传了文件（不是秒传）时，才检查外部参照
    if (isFileUploaded) {
      // 隐藏loading，避免覆盖外部参照弹框
      hideGlobalLoading();
      
      // 发送自定义事件，通知 CADEditorDirect 检查外部参照
      // 并等待用户完成外部参照操作后再打开文件
      const event = new CustomEvent('public-file-uploaded', {
        detail: { 
          fileHash: hash,
          fileName: file.name,
          noCache: noCache,
          callback: async () => {
            try {
              // 用户完成外部参照操作后，打开文件
              showGlobalLoading('正在打开文件...');
              const fileUrl = publicFileApi.getFileAccessUrl(hash);

              // 打开文件
              await mxcadManager.openFile(fileUrl, noCache);

              // 设置当前文件名（用于侧边栏显示）
              setCurrentFileInfo({
                fileId: '',
                parentId: null,
                projectId: null,
                name: file.name,
                personalSpaceId: null,
              });

              hideGlobalLoading();
              globalShowToast('文件已打开', 'success');
            } catch (error) {
              hideGlobalLoading();
              const errorMessage = error instanceof Error ? error.message : '文件打开失败';
              globalShowToast(errorMessage, 'error');
            }
          }
        }
      });
      window.dispatchEvent(event);
      
      // 注意：这里不再直接打开文件，而是通过事件回调来打开
      // 文件打开操作会在用户完成外部参照操作后执行
    } else {
      // 如果是秒传，直接打开文件
      setLoadingMessage('正在打开文件...');
      const fileUrl = publicFileApi.getFileAccessUrl(hash);

      // 打开文件
      await mxcadManager.openFile(fileUrl, noCache);

      // 设置当前文件名（用于侧边栏显示）
      setCurrentFileInfo({
        fileId: '',
        parentId: null,
        projectId: null,
        name: file.name,
        personalSpaceId: null,
      });

      hideGlobalLoading();
      globalShowToast('文件已打开', 'success');
    }
      } catch (error) {
        hideGlobalLoading();
        const errorMessage =
          error instanceof Error ? error.message : '文件上传失败';
        globalShowToast(errorMessage, 'error');
      }
    }

/**
 * 处理文件选择后的上传和打开流程（已登录用户）
 * @param file 选择的文件
 * @param uploadTargetNodeId 上传目标节点 ID
 */
async function handleFileSelection(
  file: File,
  uploadTargetNodeId: string
): Promise<void> {
  try {
    // 已登录用户上传逻辑
    showGlobalLoading(DEFAULT_MESSAGES.CALCULATING_HASH);
    const hash = await calculateFileHash(file);

    // 检查目录中是否存在重复文件
    const duplicateCheck = await mxcadApi.checkDuplicateFile({
      fileHash: hash,
      filename: file.name,
      nodeId: uploadTargetNodeId,
    });

    if (duplicateCheck.isDuplicate && duplicateCheck.existingNodeId) {
      // 隐藏加载动画
      hideGlobalLoading();

      // 显示确认对话框
      const userChoice = await showDuplicateFileDialog(file.name);

      if (userChoice === 'open') {
        // 用户选择打开已有文件
        showGlobalLoading(DEFAULT_MESSAGES.OPENING_FILE);
        await openUploadedFile(
          duplicateCheck.existingNodeId,
          uploadTargetNodeId
        );
        hideGlobalLoading();
        return;
      } else if (userChoice === null) {
        // 用户取消
        return;
      }
      // userChoice === 'upload' 继续上传流程
    }

    // 继续上传流程
    showGlobalLoading(DEFAULT_MESSAGES.UPLOADING);
    const uploadResult = await uploadMxCadFile({
      file,
      hash,
      nodeId: uploadTargetNodeId,
      onProgress: (percentage) => {
        setLoadingMessage(
          `${DEFAULT_MESSAGES.UPLOADING} ${percentage.toFixed(1)}%`
        );
      },
    });

    await openUploadedFile(uploadResult.nodeId, uploadTargetNodeId);
    
    // 检查外部参照
    try {
      // 动态导入外部参照检查相关模块
      const { useExternalReferenceUpload } = await import('../hooks/useExternalReferenceUpload');
      
      // 创建临时的外部参照上传实例
      const externalReferenceUpload = useExternalReferenceUpload({
        nodeId: uploadResult.nodeId,
        onSuccess: () => {
          // 外部参照上传成功后重新加载文件
          mxcadManager.reloadCurrentFile().catch(err => {
            console.error('重新加载文件失败:', err);
          });
        },
        onError: (error) => {
          console.error('外部参照检查失败:', error);
        },
        onSkip: () => {
          // 跳过外部参照上传
        },
      });
      
      // 检查缺失的外部参照
      // shouldRetry = true，因为上传后需要等待后端生成 preloading.json
      // forceOpen = false，上传后如果没有外部参照不弹框
      await externalReferenceUpload.checkMissingReferences(uploadResult.nodeId, true, false);
    } catch (error) {
      console.error('外部参照检查初始化失败:', error);
    }
    
    hideGlobalLoading();
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
            '不支持的文件格式，请选择 .dwg、.dxf、.mxweb 或 .mxwbe 文件',
            'error'
          );
          picker.value = '';
          return;
        }

        // 检查登录状态
        if (!isAuthenticated()) {
          // 未登录 → 使用公开上传服务
          await handlePublicUpload(selectedFile, noCache);
          picker.value = '';
          return;
        }

        // 已登录 → 获取上传目标并上传
        try {
          const uploadTargetNodeId = await getUploadTargetNodeId();
          await handleFileSelection(selectedFile, uploadTargetNodeId);
        } catch (error) {
          console.error('获取上传目标失败', 'mxcadManager', error);
          globalShowToast(
            error instanceof Error ? error.message : '获取上传目标失败',
            'error'
          );
        }
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
}
/**
 * openFile 命令：上传文件并打开
 * - 已登录：上传到私人空间或项目
 * - 未登录：使用公开上传服务
 */
MxFun.addCommand('openFile', ()=> openFile());
MxFun.addCommand('openFile_noCache', ()=> openFile(true));

// ==================== Mx_NewFile 命令 ====================

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
    // 1. 检查是否有未保存的修改
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) {
      return;
    }

    // 2. 调用 mxcad.newFile() 清空画布
    const mxcad = MxCpp.getCurrentMxCAD();
    if (mxcad) {
      mxcad.newFile();
    }

    // 3. 重置文件信息状态
    currentFileInfo = null;
    currentMxwebUrl = null;
    currentCacheTimestamp = undefined;
    resetDocumentModified();

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

    // 6. 清空文件名显示
    globalThis.MxPluginContext.useFileName().fileName.value =
      formatEditorFileName('');

    globalShowToast('已新建空白图纸', 'success');
  } catch (error) {
    console.error('新建文件失败:', error);
    globalShowToast(
      error instanceof Error ? error.message : '新建文件失败',
      'error'
    );
  }
};

// ==================== exportFile 命令 ====================

async function triggerSaveAs() {
  if (!isAuthenticated()) {
    window.dispatchEvent(
      new CustomEvent('mxcad-save-required', {
        detail: { action: '保存文件' },
      })
    );
    return;
  }

  const personalSpaceId = await getPersonalSpaceId();
  const fileName = currentFileInfo?.name || 'untitled';
  await showSaveAsDialog(personalSpaceId, fileName);
}

/**
 * exportFile 命令：另存为当前 CAD 文件
 */
MxFun.addCommand('exportFile', async () => {
  await triggerSaveAs();
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
    // 检查登录状态
    const { isAuthenticated } = await import('../utils/authCheck');
    if (!isAuthenticated()) {
      // 未登录，触发登录提示事件
      window.dispatchEvent(
        new CustomEvent('mxcad-save-required', {
          detail: { action: '保存文件' },
        })
      );
      return;
    }

    if (!currentFileInfo) {
      // 没有打开的文件（可能是空白画布新建的文件），弹出保存弹窗
      const { isAuthenticated } = await import('../utils/authCheck');
      if (!isAuthenticated()) {
        window.dispatchEvent(
          new CustomEvent('mxcad-save-required', {
            detail: { action: '保存文件' },
          })
        );
        return;
      }
      const personalSpaceId = await getPersonalSpaceId();
      await showSaveAsDialog(personalSpaceId, 'untitled');
      return;
    }

    // 获取个人空间ID
    const personalSpaceId = await getPersonalSpaceId();

    // 判断是否是我的图纸（个人空间中的图纸）
    const isMyDrawing =
      personalSpaceId && currentFileInfo.parentId === personalSpaceId;

    // 判断是否是公共资源库文件（通过 currentFileInfo.libraryKey 判断）
    const isLibraryFile = !!currentFileInfo?.libraryKey;

    console.log(
      '[Mx_Save] currentFileInfo:',
      currentFileInfo,
      'isLibraryFile:',
      isLibraryFile
    );

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
            (p: any) => (typeof p === 'string' ? p : p.permission)
          );

          const hasLibraryPermission =
            permissionStrings.includes('LIBRARY_DRAWING_MANAGE') ||
            permissionStrings.includes('LIBRARY_BLOCK_MANAGE');

          if (hasLibraryPermission) {
            // 有权限，直接保存
            console.log('[Mx_Save] 保存到图纸库');
            await saveLibraryFile();
          } else {
            // 无权限，弹出另存为对话框
            console.log('[Mx_Save] 用户无库管理权限，弹出另存为');
            const fileName = currentFileInfo?.name || 'untitled';
            await showSaveAsDialog(personalSpaceId, fileName);
          }
        } catch (error) {
          console.error('[Mx_Save] 检查权限失败:', error);
          // 出错时保守处理，弹出另存为
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
        const response = await projectsApi.checkPermission(
          currentFileInfo.projectId,
          'CAD_SAVE'
        );
        if (response.data.hasPermission) {
          // 用户有该项目保存权限，直接保存
          await saveToCurrentFile(personalSpaceId);
          return;
        }
        // 没有权限，继续执行弹出另存为窗口
      } catch (error) {
        console.error('权限检查失败', error);
        // 权限检查失败，继续执行弹出另存为窗口
      }
    }

    // 非我的图纸 或 没有项目保存权限，弹出另存为窗口
    const fileName = currentFileInfo?.name || 'untitled';
    await showSaveAsDialog(personalSpaceId, fileName);
  } catch (error) {
    console.error('保存文件失败', error);
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
      const response = await projectsApi.checkPermission(projectId, 'CAD_SAVE');
      if (!response.data.hasPermission) {
        globalShowToast('您没有保存图纸的权限', 'error');
        return;
      }
    } catch (error) {
      console.error('权限检查失败', error);
      globalShowToast('权限检查失败，请稍后重试', 'error');
      return;
    }
  }

  const { fileId, name } = currentFileInfo!;
  const commitMessage = await showSaveConfirmDialog();
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
  await mxcadApi.saveMxwebFile(
    savedFile.blob,
    fileId,
    (percentage) => {
      setLoadingMessage(`正在上传到服务器... ${percentage.toFixed(1)}%`);
    },
    commitMessage,
    currentFileInfo?.updatedAt
  );

  try {
    const fileInfoResponse = await filesApi.get(fileId);
    const fileInfo = fileInfoResponse.data;

    // 保存成功后更新乐观锁时间戳
    if (fileInfo.updatedAt && currentFileInfo) {
      currentFileInfo = { ...currentFileInfo, updatedAt: fileInfo.updatedAt };
    }

    if (fileInfo.path) {
      // 基础路径（不带 ?t=）
      const basePath = `/api/mxcad/filesData/${fileInfo.path}`;
      
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

      console.log(`[saveToCurrentFile] IndexedDB 缓存更新成功: ${newCachePath}`);
    }
  } catch (cacheError) {
    console.warn('更新本地缓存失败', cacheError);
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
  let { fileId, name, libraryKey, path: nodePath } = currentFileInfo!;

  if (!libraryKey) {
    globalShowToast('保存失败：未知的资源库类型', 'error');
    return;
  }

  // 如果缺少 nodePath，从 API 获取
  if (!nodePath) {
    console.log('[saveLibraryFile] 缺少 nodePath，从 API 获取...');
    try {
      const { libraryApi } = await import('../services/libraryApi');
      const nodeResponse =
        libraryKey === 'drawing'
          ? await libraryApi.getDrawingNode(fileId)
          : await libraryApi.getBlockNode(fileId);
      const node = nodeResponse.data as any;
      nodePath = node.path;
      
      // 更新 currentFileInfo 中的 path
      if (nodePath && currentFileInfo) {
        currentFileInfo = { ...currentFileInfo, path: nodePath };
      }
      
      console.log('[saveLibraryFile] 获取到的 nodePath:', nodePath);
    } catch (error) {
      console.error('[saveLibraryFile] 获取节点信息失败:', error);
    }
  }

  if (!nodePath) {
    console.warn('[saveLibraryFile] 无法获取 nodePath');
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
    const { libraryApi } = await import('../services/libraryApi');
    const isDrawing = libraryKey === 'drawing';

    setLoadingMessage('正在上传到服务器...');
    
    // 上传到服务器（使用专门的图书馆保存接口）
    if (isDrawing) {
      await libraryApi.saveDrawing(fileId, savedFile.blob);
    } else {
      await libraryApi.saveBlock(fileId, savedFile.blob);
    }

    // 更新本地缓存 - 使用 node.path 构建正确的 URL
    const basePath = isDrawing
      ? `/api/library/drawing/filesData/${nodePath}`
      : `/api/library/block/filesData/${nodePath}`;

    // 获取最新的 updatedAt 时间戳
    const updatedAt = await getNodeUpdatedAt(fileId, libraryKey);
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    const newCachePath = `${basePath}?t=${timestamp}`;

    console.log(`[saveLibraryFile] 更新 IndexedDB 缓存`);
    console.log(`  - fileId: ${fileId}`);
    console.log(`  - nodePath: ${nodePath}`);
    console.log(`  - basePath: ${basePath}`);
    console.log(`  - newCachePath: ${newCachePath}`);
    console.log(`  - 原始数据类型: ${savedFile.data.constructor.name}`);

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

    console.log(`  - 转换后数据类型: ${arrayBufferData.constructor.name}`);

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.put(arrayBufferData, newCachePath);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    console.log(`[saveLibraryFile] IndexedDB 缓存更新成功`);

    // 处理待上传图片
    await processPendingImages();

    resetDocumentModified();
    hideGlobalLoading();
    globalShowToast('文件保存成功', 'success');
  } catch (error) {
    console.error('保存公共资源库文件失败:', error);
    hideGlobalLoading();
    globalShowToast(
      error instanceof Error ? error.message : '保存失败，请稍后重试',
      'error'
    );
  }
}

/**
 * 创建上传表单数据
 */
function createUploadFormData(blob: Blob, nodeId: string, filename: string): FormData {
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('nodeId', nodeId);
  formData.append('hash', `${Date.now()}_${Math.random().toString(36).substring(7)}`);
  formData.append('name', filename);
  formData.append('size', String(blob.size));
  formData.append('chunk', '0');
  formData.append('chunks', '1');
  return formData;
}

/**
 * 获取节点的 updatedAt 时间戳
 */
async function getNodeUpdatedAt(
  nodeId: string,
  libraryKey: string
): Promise<string | null> {
  try {
    const { libraryApi } = await import('../services/libraryApi');
    const response =
      libraryKey === 'drawing'
        ? await libraryApi.getDrawingNode(nodeId)
        : await libraryApi.getBlockNode(nodeId);
    
    const node = response.data as any;
    return node?.updatedAt || null;
  } catch (error) {
    console.warn('[getNodeUpdatedAt] 获取失败:', error);
    return null;
  }
}

/**
 * 显示保存弹窗（Save As）
 */
async function showSaveAsDialog(
  personalSpaceId: string | null,
  fileName: string
) {
  const name = fileName || 'untitled';

  // 先保存为 mxweb 格式
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

  // 触发保存弹窗事件
  hideGlobalLoading();
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
      // z-index 只在隐藏时设置为 -1，显示时设置为 9998
      // CADEditorDirect 容器 z-index: 9999，侧边栏在其中
      // MxCAD 容器 z-index: 9998，在 CADEditorDirect 之下，但编辑器内容区域透明
      // pointer-events 禁用交互
      if (show) {
        this.globalContainer.style.visibility = 'visible';
        this.globalContainer.style.zIndex = '9998';
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
    // 缓存文件名，用于文件打开完成后设置标题
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
      // 文件打开完成后，重置修改状态
      resetDocumentModified();

      // 如果 currentFileInfo 为空，尝试从 MxCAD 获取文件名
      if (!currentFileInfo) {
        try {
          const mxcad = MxCpp.getCurrentMxCAD();
          const mxFileName = mxcad?.getCurrentFileName?.();
          if (mxFileName) {
            currentFileInfo = {
              fileId: '',
              parentId: null,
              projectId: null,
              name: mxFileName,
              personalSpaceId: null,
            };
          }
        } catch (error) {
          console.error('[setupFileOpenListener] 获取 MxCAD 文件名失败', error);
        }
      }

      if (currentFileInfo) {
        globalThis.MxPluginContext.useFileName().fileName.value =
          formatEditorFileName(currentFileInfo.name);

        try {
          // 检查用户是否已登录，未登录则不生成和上传缩略图
          const token = localStorage.getItem('accessToken');
          const user = localStorage.getItem('user');
          const isLoggedIn = !!(token && user);

          if (!isLoggedIn) {
            console.log('[缩略图] 用户未登录，跳过缩略图生成和上传');
            return;
          }

          const fileId = currentFileInfo.fileId;

          // 跳过无效的 fileId，避免 404 错误
          if (!fileId) {
            console.log('[缩略图] fileId 为空，跳过缩略图处理');
            return;
          }

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
    
    // 构建外部参照文件解析函数
    const resolveExtReferenceUrl = (fileName: string) => {
      // 从当前打开的文件 URL 中提取 hash
      if (openFile && openFile.includes('/public-file/access/')) {
        const parts = openFile.split('/');
        const hashIndex = parts.indexOf('access') + 1;
        if (hashIndex < parts.length) {
          const hash = parts[hashIndex];
          // 构建外部参照文件的访问 URL
          return `${API_BASE_URL}/public-file/access/${hash}/${fileName}`;
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
      // 应用创建完成后，设置文档修改事件监听
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

      // 在 create() 之前设置监听器，确保不会错过 openFileComplete 事件
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

      const token = localStorage.getItem('accessToken');
      for (
        let attempt = 0;
        attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
        attempt++
      ) {
        try {
          this.mxcadView!.mxcad!.openWebFile(
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
   * 获取当前打开的文件信息
   * @returns 当前文件信息，如果没有打开的文件则返回 null
   */
  getCurrentFileInfo(): {
    fileId: string;
    parentId: string | null | undefined;
    projectId: string | null | undefined;
    name: string;
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

// ==================== Mx_InsertImageWithUpload 命令 ====================

/**
 * Mx_InsertImageWithUpload 命令：插入图片并记录待上传信息
 * 
 * 流程：
 * 1. 调用内置 _InsertImage 命令
 * 2. 在回调中获取插入图片的 url、fileName 和 entity
 * 3. 记录到待上传列表，等待保存时处理
 */
MxFun.addCommand('Mx_InsertImageWithUpload', () => {
  // 获取当前打开的图纸信息
  const currentInfo = mxcadManager.getCurrentFileInfo();
  
  if (!currentInfo?.fileId) {
    console.error('[Mx_InsertImageWithUpload] 当前没有打开的图纸文件');
    globalShowToast('请先打开图纸后再插入图片', 'warning');
    return;
  }

  // 调用内置 _InsertImage 命令，并在回调中记录图片信息
  MxFun.sendStringToExecute('_InsertImage', async (data: any) => {
    if (!data) {
      console.error('[Mx_InsertImageWithUpload] 插入图片失败，未收到数据');
      return;
    }

    const { url, fileName, entity } = data;
    console.log('[Mx_InsertImageWithUpload] 图片插入成功:', { url, fileName });

    // 检查是否重复
    const isDuplicate = pendingImages.some(img => img.fileName === fileName);
    if (isDuplicate) {
      console.log('[Mx_InsertImageWithUpload] 图片已存在，跳过重复记录:', fileName);
      return;
    }

    // 记录到待上传列表
    pendingImages.push({
      url,
      fileName,
      entity
    });

    console.log('[Mx_InsertImageWithUpload] 图片已添加到待上传列表:', fileName);
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

  console.log('[processPendingImages] 开始处理待上传图片，数量:', pendingImages.length);

  // 过滤掉已删除的图片
  const validImages = pendingImages.filter(img => {
    try {
      return !img.entity.isErased();
    } catch {
      return true; // 出错时默认保留
    }
  });

  console.log('[processPendingImages] 过滤后有效图片数量:', validImages.length);

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

      // 上传到外部参照目录（带 updatePreloading=true 更新 preloading.json）
      await mxcadApi.uploadExtReferenceImage(
        file,
        currentInfo.fileId,
        img.fileName,
        true  // 更新 preloading.json
      );

      console.log('[processPendingImages] 图片上传成功:', img.fileName);
    } catch (error) {
      console.error('[processPendingImages] 上传失败:', img.fileName, error);
    }
  }

  // 清空待上传列表
  pendingImages = [];
  console.log('[processPendingImages] 待上传图片处理完成');
}

// ==================== 辅助函数 ====================

/**
 * 获取私人空间 ID
 * 从本地存储或 API 获取用户的私人空间 ID
 */
async function getPersonalSpaceId(): Promise<string | null> {
  try {
    // 安全修复：不再使用 localStorage 缓存，避免跨用户数据泄露
    // 直接从 API 获取当前用户的私人空间 ID
    const response = await projectsApi.getPersonalSpace();
    const personalSpaceId = response.data?.id || null;

    return personalSpaceId;
  } catch (error) {
    console.error('获取私人空间 ID 失败', error);
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
        console.log('已清理旧版本缓存:', filePath);
      }
    }
  } catch (error) {
    console.warn('清理旧缓存失败:', error);
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
      console.log(`[clearFileCacheFromIndexedDB] 已清理 ${deletedCount} 个旧缓存: ${basePath}`);
    }
  } catch (error) {
    console.warn('[clearFileCacheFromIndexedDB] 清理缓存失败:', error);
  }
}
