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

import { FileSystemNode } from '../types/filesystem';
import { API_BASE_URL } from '../config/apiConfig';

export const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return '-';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileIcon = (node: FileSystemNode) => {
  if (node.isFolder) {
    return '📁';
  }

  const extension = node.extension?.toLowerCase() || '';

  switch (extension) {
    case '.dwg':
      return '📐';
    case '.dxf':
      return '📏';
    case '.pdf':
      return '📄';
    case '.png':
    case '.jpg':
    case '.jpeg':
      return '🖼️';
    default:
      return '📄';
  }
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * 格式化相对时间（如"2小时前"、"昨天"）
 */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return '刚刚';
  } else if (diffMin < 60) {
    return `${diffMin}分钟前`;
  } else if (diffHour < 24) {
    return `${diffHour}小时前`;
  } else if (diffDay === 1) {
    return '昨天';
  } else if (diffDay < 7) {
    return `${diffDay}天前`;
  } else if (diffDay < 30) {
    return `${Math.floor(diffDay / 7)}周前`;
  } else if (diffDay < 365) {
    return `${Math.floor(diffDay / 30)}个月前`;
  } else {
    return `${Math.floor(diffDay / 365)}年前`;
  }
};

export const isCadFile = (extension: string | null | undefined): boolean => {
  if (!extension) return false;
  const cadExtensions = ['.dwg', '.dxf'];
  return cadExtensions.includes(extension.toLowerCase());
};

export const isImageFile = (extension: string | null | undefined): boolean => {
  if (!extension) return false;
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
  return imageExtensions.includes(extension.toLowerCase());
};

export const isPdfFile = (extension: string | null | undefined): boolean => {
  if (!extension) return false;
  return extension.toLowerCase() === '.pdf';
};

/**
 * 获取图片文件的缩略图URL
 * 使用后端代理方式，通过 Session 认证访问
 * 浏览器会自动携带 Cookie，无需手动添加请求头
 */
export const getThumbnailUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  // 判断是否是图片文件
  const extension = node.extension?.toLowerCase() || '';
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
  if (!imageExtensions.includes(extension)) {
    return '';
  }

  // 使用后端代理 URL（通过 Session 认证）
  return `${API_BASE_URL}/file-system/nodes/${node.id}/thumbnail`;
};

/**
 * 获取 CAD 文件的缩略图 URL
 * 使用 nodeId 访问缩略图接口：/api/file-system/nodes/{nodeId}/thumbnail
 * 注意：此接口返回图片流，支持所有类型文件（CAD 和图片）
 */
export const getCadThumbnailUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  const extension = node.extension?.toLowerCase() || '';
  const cadExtensions = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];
  if (!cadExtensions.includes(extension)) {
    return '';
  }

  return `${API_BASE_URL}/file-system/nodes/${node.id}/thumbnail`;
};

/**
 * 获取原图/预览 URL
 * CAD 文件返回缩略图路径（用于预览）
 * 图片文件返回原图下载链接
 */
export const getOriginalFileUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  // CAD 文件使用缩略图路径预览
  const extension = node.extension?.toLowerCase() || '';
  const cadExtensions = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];
  if (cadExtensions.includes(extension)) {
    return `${API_BASE_URL}/file-system/nodes/${node.id}/thumbnail`;
  }

  // 图片文件返回原图下载链接
  return `${API_BASE_URL}/file-system/nodes/${node.id}/download`;
};

// ========== 文件类型检查 ==========

/** 图纸文件扩展名 */
export const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];

/** 图块文件扩展名 */
export const BLOCK_EXTENSIONS = ['.dwg', '.dxf', '.dwt', '.blk'];

/**
 * 检查是否为图纸文件
 * @param fileName 文件名
 * @returns 是否为图纸文件
 */
export function isDrawingFile(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = fileName.toLowerCase().slice(lastDot);
  return DRAWING_EXTENSIONS.includes(ext);
}

/**
 * 检查是否为图块文件
 * @param fileName 文件名
 * @returns 是否为图块文件
 */
export function isBlockFile(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = fileName.toLowerCase().slice(lastDot);
  return BLOCK_EXTENSIONS.includes(ext);
}

/**
 * 检查是否为 CAD 文件（基于文件名）
 * @param fileName 文件名
 * @returns 是否为 CAD 文件
 */
export function isCadFileByName(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = fileName.toLowerCase().slice(lastDot);
  return DRAWING_EXTENSIONS.includes(ext);
}

// ========== 文件名处理 ==========

/**
 * 清理文件名，移除不安全字符
 * @param name 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * 验证文件夹名称是否合法
 * @param name 文件夹名称
 * @returns 验证结果
 */
export function validateFolderName(
  name: string
): { valid: boolean; error?: string } {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return { valid: false, error: '名称不能为空' };
  }

  if (trimmedName.length > 255) {
    return { valid: false, error: '名称长度不能超过 255 个字符' };
  }

  const illegalChars = /[<>:"|?*/\\]/;
  if (illegalChars.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符：< > : " | ? * / \\' };
  }

  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/u.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符' };
  }

  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(trimmedName)) {
    return { valid: false, error: '该名称为系统保留名称' };
  }

  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return { valid: false, error: '名称不能以点开头或结尾' };
  }

  return { valid: true };
}
