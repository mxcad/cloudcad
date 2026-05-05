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
 * mxcadExtRef — 外部参照模块
 *
 * 提供外部参照图片上传、检查和 URL 解析功能。
 */

import { mxCadControllerUploadExtReferenceImage } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/contexts/NotificationContext';
import type { ExtRefUploadParams, ExtRefUploadResult } from './mxcadTypes';

export type { ExtRefUploadParams, ExtRefUploadResult } from './mxcadTypes';

/**
 * 上传外部参照图片到指定节点
 * @param params 上传参数
 * @returns 上传结果
 */
export async function uploadExtReferenceImage(
  params: ExtRefUploadParams
): Promise<ExtRefUploadResult> {
  try {
    const formData = new FormData();
    formData.append('file', params.file, params.fileName);

    const result = await mxCadControllerUploadExtReferenceImage({
      path: { nodeId: params.nodeId },
      body: formData,
    });

    return {
      success: true,
      nodeId: result.data?.nodeId,
    };
  } catch (error) {
    handleError(error, 'mxcadExtRef: uploadExtReferenceImage');
    const errorMessage =
      error instanceof Error ? error.message : '外部参照上传失败';
    globalShowToast(errorMessage, 'error');
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 从缺失参照路径列表中提取文件名
 * @param missingRefs 缺失的参照路径列表
 * @returns 去重后的文件名列表
 */
export function checkExtReferenceImages(missingRefs: string[]): string[] {
  const fileNames: string[] = [];

  for (const ref of missingRefs) {
    if (!ref || !ref.trim()) {
      continue;
    }

    // 提取路径中的文件名（支持 Windows 和 Unix 路径）
    const parts = ref.replace(/\\/g, '/').split('/');
    const fileName = parts[parts.length - 1];

    if (fileName && !fileNames.includes(fileName)) {
      fileNames.push(fileName);
    }
  }

  return fileNames;
}

/**
 * 解析外部参照文件的访问 URL
 * @param openFileUrl 当前打开的文件 URL
 * @param fileName 外部参照文件名（可选，默认返回原始 URL）
 * @returns 解析后的 URL
 */
export function resolveExtReferenceUrl(
  openFileUrl: string,
  fileName?: string
): string {
  // 从当前打开的文件 URL 中提取 hash
  if (openFileUrl.includes('/public-file/access/')) {
    const parts = openFileUrl.split('/');
    const hashIndex = parts.indexOf('access') + 1;
    if (hashIndex < parts.length && fileName) {
      const hash = parts[hashIndex];
      const { API_BASE_URL } = require('./publicFileApi');
      return `${API_BASE_URL}/public-file/access/${hash}/${fileName}`;
    }
  }

  // 如果无法解析，返回原始值
  return fileName || openFileUrl;
}
