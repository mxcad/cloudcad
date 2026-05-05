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
 * mxcadThumbnail — 缩略图模块
 *
 * 提供缩略图生成、上传和检查功能。
 * generateThumbnail 需要 MxCAD SDK 运行时支持，在单元测试环境中不可用。
 */

import { mxCadControllerCheckThumbnail, mxCadControllerUploadThumbnail } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';

/**
 * 检查节点是否已有缩略图
 * @param nodeId 节点 ID
 * @returns 是否存在缩略图
 */
export async function checkThumbnail(nodeId: string): Promise<boolean> {
  try {
    const result = await mxCadControllerCheckThumbnail({ path: { nodeId } });
    return !!result?.data?.exists;
  } catch (error) {
    handleError(error, 'mxcadThumbnail: checkThumbnail');
    return false;
  }
}

/**
 * 上传缩略图到指定节点
 * @param nodeId 节点 ID
 * @param imageData 图像 DataURL
 * @returns 是否上传成功
 */
export async function uploadThumbnail(
  nodeId: string,
  imageData: string
): Promise<boolean> {
  try {
    const blob = dataURLtoBlob(imageData);
    if (!blob) {
      return false;
    }

    const formData = new FormData();
    formData.append('file', blob, 'thumbnail.png');

    await mxCadControllerUploadThumbnail({ path: { nodeId }, body: formData });
    return true;
  } catch (error) {
    handleError(error, 'mxcadThumbnail: uploadThumbnail');
    return false;
  }
}

/**
 * 将 DataURL 转换为 Blob
 * @param dataURL 图像 DataURL
 * @returns Blob 或 undefined（无效输入时）
 */
export function dataURLtoBlob(dataURL: string): Blob | undefined {
  const arr = dataURL.split(',');
  const mimePart = arr[0];
  const dataPart = arr[1];

  if (!dataPart) {
    return undefined;
  }

  const mime = mimePart?.match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(dataPart);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * 生成缩略图（需要 MxCAD SDK 运行时）
 *
 * 此函数依赖 MxCpp.getCurrentMxCAD() 和 McGePoint3d，
 * 在单元测试环境中不可用，仅在生产 Builder 中调用。
 *
 * @param targetSize 缩略图目标尺寸（默认 200）
 * @param minDrawingSize 最小图纸尺寸（默认 100）
 * @returns Promise<string | undefined> 图像 DataURL，或未生成时返回 undefined
 */
export async function generateThumbnail(
  targetSize: number = 200,
  minDrawingSize: number = 100
): Promise<string | undefined> {
  try {
    // 动态导入 mxcad 的运行时依赖，避免在单元测试中报错
    const { MxCpp, McGePoint3d } = await import('mxcad');

    const mxcad = MxCpp.getCurrentMxCAD();
    mxcad.setAttribute({ ShowCoordinate: false });

    const { minPt, maxPt } = mxcad.getDatabase().currentSpace.getBoundingBox();

    const w = Math.abs(minPt.x - maxPt.x);
    const h = Math.abs(minPt.y - maxPt.y);

    if (w < minDrawingSize || h < minDrawingSize) {
      return undefined;
    }

    const scale = Math.min(targetSize / w, targetSize / h);
    const centerX = (minPt.x + maxPt.x) / 2;
    const centerY = (minPt.y + maxPt.y) / 2;

    const newMinPt = new McGePoint3d({
      x: centerX - targetSize / 2 / scale,
      y: centerY - targetSize / 2 / scale,
    });

    const newMaxPt = new McGePoint3d({
      x: centerX + targetSize / 2 / scale,
      y: centerY + targetSize / 2 / scale,
    });

    return new Promise<string | undefined>((resolve, reject) => {
      mxcad.mxdraw.createCanvasImageData(
        (imageData: string) => {
          mxcad.setAttribute({ ShowCoordinate: true });
          resolve(imageData);
        },
        {
          width: targetSize,
          height: targetSize,
          range_pt1: newMinPt,
          range_pt2: newMaxPt,
        }
      );
    });
  } catch {
    // MxCAD SDK 不可用时（如单元测试环境），静默返回 undefined
    return undefined;
  }
}
