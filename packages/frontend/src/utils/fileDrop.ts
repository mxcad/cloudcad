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

import { CAD_EXTENSIONS } from './fileUtils';

/**
 * 文件拖拽公共工具
 *
 * 供 useFileDropUpload（上传队列）与 useFileDropToOpen（公开打开）复用，
 * 统一 CAD 文件过滤逻辑。
 */

/** 拖拽支持的 CAD 文件扩展名（与 fileUtils.CAD_EXTENSIONS 一致） */
export const ALLOWED_EXTENSIONS = CAD_EXTENSIONS;

/**
 * 过滤允许的 CAD 文件类型
 */
export function filterAllowedFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  });
}
