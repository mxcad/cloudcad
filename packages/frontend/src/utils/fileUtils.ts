///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
  const cadExtensions = ['.dwg', '.dxf'];
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
  const cadExtensions = ['.dwg', '.dxf'];
  if (cadExtensions.includes(extension)) {
    return `${API_BASE_URL}/file-system/nodes/${node.id}/thumbnail`;
  }

  // 图片文件返回原图下载链接
  return `${API_BASE_URL}/file-system/nodes/${node.id}/download`;
};
