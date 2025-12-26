import { FileSystemNode } from '../types/filesystem';

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
 * 对于本地存储的文件，直接返回文件路径
 * 对于MinIO存储的文件，返回预签名URL或代理路径
 */
export const getThumbnailUrl = (node: FileSystemNode): string => {
  if (!node.path) return '';

  // 判断是否是图片文件
  const extension = node.extension?.toLowerCase() || '';
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
  if (!imageExtensions.includes(extension)) {
    return '';
  }

  // 如果是mxweb文件（MxCAD转换后的格式），尝试获取对应的缩略图
  if (extension === '.mxweb') {
    // mxweb 文件通常有对应的 jpg 缩略图
    const basePath = node.path.replace('.mxweb', '');
    return `${basePath}2__mxole__.jpg`;
  }

  // 直接返回文件路径（前端会通过代理访问）
  return node.path;
};