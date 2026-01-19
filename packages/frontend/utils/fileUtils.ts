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
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
  return `${apiBaseUrl}/file-system/nodes/${node.id}/thumbnail`;
};

/**
 * 获取 CAD 文件的缩略图 URL
 * 缩略图路径格式：/api/mxcad/file/{fileHash}.jpg
 * 复用现有的 /mxcad/file/*path 接口
 */
export const getCadThumbnailUrl = (node: FileSystemNode): string => {
  if (!node.fileHash) return '';

  const extension = node.extension?.toLowerCase() || '';
  const cadExtensions = ['.dwg', '.dxf'];
  if (!cadExtensions.includes(extension)) {
    return '';
  }

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
  return `${apiBaseUrl}/mxcad/file/${node.fileHash}.jpg`;
};

/**
 * 获取原图/预览 URL
 * CAD 文件返回缩略图路径（用于预览）
 * 图片文件返回原图下载链接
 */
export const getOriginalFileUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  // CAD 文件使用缩略图路径预览
  const extension = node.extension?.toLowerCase() || '';
  const cadExtensions = ['.dwg', '.dxf'];
  if (cadExtensions.includes(extension) && node.fileHash) {
    return `${apiBaseUrl}/mxcad/file/${node.fileHash}.jpg`;
  }

  // 图片文件返回原图下载链接
  return `${apiBaseUrl}/file-system/nodes/${node.id}/download`;
};
