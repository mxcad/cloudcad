///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/** 每页显示数量 */
export const PAGE_SIZE = 20;

/** 图纸文件扩展名 */
export const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];

/** API base URL for constructing thumbnail URLs */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/** 检查是否为图纸文件 */
export function isDrawingFile(name: string): boolean {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = name.toLowerCase().slice(lastDot);
  return DRAWING_EXTENSIONS.includes(ext);
}
