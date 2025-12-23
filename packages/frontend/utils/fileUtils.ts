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