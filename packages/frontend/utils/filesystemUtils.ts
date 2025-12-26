/**
 * 文件系统状态相关的工具函数
 */

/**
 * 获取状态显示文本
 */
export function getStatusText(status?: string): string {
  switch (status) {
    case 'ACTIVE':
      return '活跃';
    case 'ARCHIVED':
      return '已归档';
    case 'DELETED':
      return '已删除';
    default:
      return '未知';
  }
}

/**
 * 获取状态样式类名
 */
export function getStatusStyle(status?: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'ARCHIVED':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'DELETED':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/**
 * 格式化日期显示
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default {
  getStatusText,
  getStatusStyle,
  formatDate,
  formatFileSize,
};
