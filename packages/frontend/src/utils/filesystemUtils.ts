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

/**
 * 文件系统状态相关的工具函数
 */

import { formatDate, formatFileSize } from './fileUtils';

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

// 重新导出，保持向后兼容
export { formatDate, formatFileSize };

export default {
  getStatusText,
  getStatusStyle,
  formatDate,
  formatFileSize,
};
