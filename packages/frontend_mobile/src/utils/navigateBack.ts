/**
 * 移动端返回导航工具
 * 与 PC 端 mxcadManager/calculateReturnPath 逻辑对齐
 */

import { serverConfig } from '@/config/serverConfig';
import { isWechatBrowser } from './browserDetect';

/** PC 端云图路径常量（与 PC NAVIGATION_PATHS 对齐） */
const PC_PATHS = {
  PROJECTS_LIST: '/projects',
  PROJECT_FILES: (projectId: string) => `/projects/${projectId}/files`,
  PROJECT_FOLDER: (projectId: string, parentId: string) =>
    `/projects/${projectId}/files/${parentId}`,
  PERSONAL_SPACE: '/personal-space',
  PERSONAL_SPACE_FOLDER: (parentId: string) => `/personal-space/${parentId}`,
  LIBRARY_DRAWING: '/library/drawing',
  LIBRARY_BLOCK: '/library/block',
  LIBRARY_DRAWING_FOLDER: (parentId: string) => `/library/drawing/${parentId}`,
  LIBRARY_BLOCK_FOLDER: (parentId: string) => `/library/block/${parentId}`,
} as const;

/**
 * 获取 PC 端云图基础 URL
 */
function getPcBaseUrl(): string {
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  const desktopUrl = serverConfig?.desktopPageUrl || '';
  // 移除路径部分，只保留 origin
  return desktopUrl.replace(/\/[^/]*$/, '') || window.location.origin;
}

/**
 * 根据文件信息计算 PC 端返回路径（与 PC calculateReturnPath 对齐）
 */
function calculateReturnPath(
  parentId: string | null | undefined,
  projectId: string | null | undefined,
  personalSpaceId: string | null | undefined,
  libraryKey: 'drawing' | 'block' | null | undefined
): string {
  // 公开资源库模式（优先判断）
  if (libraryKey === 'drawing') {
    if (parentId) {
      return PC_PATHS.LIBRARY_DRAWING_FOLDER(parentId);
    }
    return PC_PATHS.LIBRARY_DRAWING;
  }
  if (libraryKey === 'block') {
    if (parentId) {
      return PC_PATHS.LIBRARY_BLOCK_FOLDER(parentId);
    }
    return PC_PATHS.LIBRARY_BLOCK;
  }

  // 判断是否为私人空间模式：projectId 等于 personalSpaceId
  const isPersonalSpace =
    projectId && personalSpaceId && projectId === personalSpaceId;

  if (isPersonalSpace) {
    if (parentId && parentId !== personalSpaceId) {
      return PC_PATHS.PERSONAL_SPACE_FOLDER(parentId);
    }
    return PC_PATHS.PERSONAL_SPACE;
  }

  // 项目模式
  if (parentId && projectId) {
    return PC_PATHS.PROJECT_FOLDER(projectId, parentId);
  } else if (parentId) {
    return PC_PATHS.PROJECT_FILES(parentId);
  } else if (projectId) {
    return PC_PATHS.PROJECT_FILES(projectId);
  }
  return PC_PATHS.PROJECTS_LIST;
}

export interface NavigateBackOptions {
  fileId: string | null;
  projectId: string | null;
  personalSpaceId: string | null;
  libraryKey: 'drawing' | 'block' | null;
  parentId?: string | null;
  backUrl?: string | null;
  initialFileId?: string | null;
}

/**
 * 执行返回导航
 *
 * 逻辑：
 * 1. 微信浏览器：使用 calculateReturnPath 计算路径，导航到 PC 云图（不判断标签页）
 * 2. 系统浏览器（有标签页）：
 *    - 如果有 backUrl 且文件未切换 → 尝试关闭标签页，导航到 backUrl 作为 fallback
 *    - 否则 → 使用 calculateReturnPath 计算路径，导航到 PC 云图
 */
export function navigateBack(options: NavigateBackOptions): void {
  const {
    fileId,
    projectId,
    personalSpaceId,
    libraryKey,
    parentId,
    backUrl,
    initialFileId,
  } = options;

  const pcBase = getPcBaseUrl();

  if (isWechatBrowser()) {
    // 微信浏览器：使用 calculateReturnPath 计算路径，不判断标签页
    const targetPath = calculateReturnPath(
      parentId,
      projectId,
      personalSpaceId,
      libraryKey
    );
    window.location.href = `${pcBase}${targetPath}`;
    return;
  }

  // 系统浏览器（有标签页）：判断是否可以直接关闭标签页
  if (backUrl && initialFileId && fileId === initialFileId) {
    // 文件未切换，尝试关闭标签页
    try {
      window.close();
    } catch {
      // window.close() 可能被浏览器阻止
    }
    // 无论关闭是否成功，都导航到来源页面（作为 fallback）
    window.location.href = backUrl;
    return;
  }

  // 文件已切换或无 backUrl，走正常路由跳转
  const targetPath = calculateReturnPath(
    parentId,
    projectId,
    personalSpaceId,
    libraryKey
  );
  window.location.href = `${pcBase}${targetPath}`;
}
