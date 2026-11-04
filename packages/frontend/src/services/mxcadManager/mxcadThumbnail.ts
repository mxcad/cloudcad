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

import {
  thumbnailControllerCheckThumbnail,
  thumbnailControllerUploadThumbnail,
} from '@/api-sdk';

import { handleError } from '@/utils/errorHandler';
import { McGePoint3d } from 'mxdraw';
import type { McObject } from 'mxcad';
import { isRectSurroundedByBorder, type RectBox } from '@cloudcad/platform';

/**
 * 检查节点是否已有缩略图
 * @param nodeId 节点 ID
 * @returns 是否存在缩略图
 */
export async function checkThumbnail(nodeId: string): Promise<boolean> {
  try {
    const result = await thumbnailControllerCheckThumbnail({
      path: { nodeId },
    });
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

    // 后端缩略图接口只接受 jpg（按 mimetype 校验）：与移动端一致，
    // 用 File 显式声明 jpeg 类型，避免 Blob 无文件名导致的误判
    const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });

    const result = await thumbnailControllerUploadThumbnail({
      throwOnError: true,
      path: { nodeId },
      body: {
        file,
      },
    });
    // SDK 默认不抛错：失败时错误在 result.error。不检查会返回 true
    // （语义错误），缩略图静默缺失
    return true;
  } catch (error) {
    console.error(`[uploadThumbnail] 缩略图上传失败: ${nodeId}`, error);
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

/** 缩略图区域（CAD 坐标包围盒），由交互式框选或调用方指定 */
export interface ThumbnailRegion {
  minPt: { x: number; y: number };
  maxPt: { x: number; y: number };
}

/** 分享图片（海报）图纸图渲染长边尺寸（BMP 高清，宽约 1000px，远高于 200px 缩略图） */
export const POSTER_RENDER_SIZE = 1000;

/**
 * 计算渲染范围与输出画布尺寸（generateThumbnail / generatePosterImage 共用）。
 *
 * @param minPt 包围盒最小角
 * @param maxPt 包围盒最大角
 * @param targetSize 长边目标尺寸
 * @param contain true=正方形画布 + 正方形范围（整图 contain，不裁切，两侧留白）；
 *   false=按包围盒真实宽高比、长边 = targetSize（范围填满画布，按比例裁剪）
 */
function computeRenderRange(
  minPt: { x: number; y: number },
  maxPt: { x: number; y: number },
  targetSize: number,
  contain: boolean
): {
  outWidth: number;
  outHeight: number;
  newMinPt: { x: number; y: number };
  newMaxPt: { x: number; y: number };
} {
  const w = Math.abs(minPt.x - maxPt.x);
  const h = Math.abs(minPt.y - maxPt.y);
  if (contain) {
    const scale = Math.min(targetSize / w, targetSize / h);
    const centerX = (minPt.x + maxPt.x) / 2;
    const centerY = (minPt.y + maxPt.y) / 2;
    return {
      outWidth: targetSize,
      outHeight: targetSize,
      newMinPt: {
        x: centerX - targetSize / 2 / scale,
        y: centerY - targetSize / 2 / scale,
      },
      newMaxPt: {
        x: centerX + targetSize / 2 / scale,
        y: centerY + targetSize / 2 / scale,
      },
    };
  }
  const aspect = w > 0 && h > 0 ? w / h : 1;
  let outWidth = targetSize;
  let outHeight = targetSize;
  if (aspect >= 1) {
    outHeight = Math.max(1, Math.round(targetSize / aspect));
  } else {
    outWidth = Math.max(1, Math.round(targetSize * aspect));
  }
  return {
    outWidth,
    outHeight,
    newMinPt: { x: minPt.x, y: minPt.y },
    newMaxPt: { x: maxPt.x, y: maxPt.y },
  };
}

/**
 * 生成缩略图（需要 MxCAD SDK 运行时）
 *
 * 此函数依赖 MxCpp.getCurrentMxCAD() 和 McGePoint3d，
 * 在单元测试环境中不可用，仅在生产 Builder 中调用。
 *
 * @param isUseViewCADCoord 是否使用getViewCADCoord返回当前视区的显示范围,cad坐标 作为包围盒范围
 * @param targetSize 缩略图长边目标尺寸（默认 200）
 * @param minDrawingSize 最小图纸尺寸（默认 100）
 * @param region 指定生成区域（CAD 坐标包围盒）。传入时只截取该区域，输出宽高按区域
 *   宽高比（长边 = targetSize）；不传则沿用整图包围盒（现有行为）。
 * @returns Promise<string | undefined> 图像 DataURL，或未生成时返回 undefined
 */
export async function generateThumbnail(
  isUseViewCADCoord = false,
  targetSize: number = 200,
  minDrawingSize: number = 100,
  region?: ThumbnailRegion | null
): Promise<string | undefined> {
  try {
    // 动态导入 mxcad 的运行时依赖，避免在单元测试中报错
    const { MxCpp, McGePoint3d } = await import('mxcad');

    const mxcad = MxCpp.getCurrentMxCAD();
    mxcad.setAttribute({ ShowCoordinate: false });
    let maxPt!: McGePoint3d;
    let minPt!: McGePoint3d;
    if (region) {
      // 指定区域：直接使用，归一化保证 minPt <= maxPt
      minPt = new McGePoint3d(
        Math.min(region.minPt.x, region.maxPt.x),
        Math.min(region.minPt.y, region.maxPt.y)
      );
      maxPt = new McGePoint3d(
        Math.max(region.minPt.x, region.maxPt.x),
        Math.max(region.minPt.y, region.maxPt.y)
      );
    } else if (isUseViewCADCoord) {
      const box = mxcad.getViewCADCoord();
      minPt = box.pt1;
      maxPt = box.pt3;
    } else {
      const box = mxcad.getDatabase().currentSpace.getBoundingBox();
      minPt = box.minPt;
      maxPt = box.maxPt;
    }

    // 指定区域：按区域宽高比长边 = targetSize 填满（裁切）；整图包围盒：正方形 contain（不裁切）
    const { outWidth, outHeight, newMinPt, newMaxPt } = computeRenderRange(
      minPt,
      maxPt,
      targetSize,
      !region
    );

    return new Promise<string | undefined>((resolve, reject) => {
      mxcad.mxdraw.createCanvasImageData(
        (imageData: string) => {
          mxcad.setAttribute({ ShowCoordinate: true });
          resolve(imageData);
          setTimeout(() => {
            requestAnimationFrame(() => {
              mxcad.mxdraw.updateCanvasSize();
            });
          }, 50);
        },
        {
          width: outWidth,
          height: outHeight,
          range_pt1: new McGePoint3d(newMinPt.x, newMinPt.y),
          range_pt2: new McGePoint3d(newMaxPt.x, newMaxPt.y),
        }
      );
    });
  } catch (err) {
    console.error('[generateThumbnail] 缩略图生成失败:', err);
    return undefined;
  }
}

/**
 * 交互式框选缩略图区域（方案 A：图纸上拖矩形，MxCADUtility.getCorner 原生橡皮筋）。
 *
 * 返回归一化包围盒（minPt/maxPt），用户按 Esc 取消时返回 null。调用方据此可
 * 传入 generateThumbnail 的 region 参数截取该区域。
 */
export async function pickThumbnailRegion(
  prompt?: string
): Promise<ThumbnailRegion | null> {
  const { MxCADUtility, McGePoint3d } = await import('mxcad');
  const corners = await MxCADUtility.getCorner(
    prompt ?? '指定缩略图区域，请框选矩形范围'
  );
  if (!corners) return null;
  // getCorner 返回矩形四角（pt4左上/pt2右上/pt1左下/pt3右下），取全部四角求包围盒
  const xs = [corners.pt1.x, corners.pt2.x, corners.pt3.x, corners.pt4.x];
  const ys = [corners.pt1.y, corners.pt2.y, corners.pt3.y, corners.pt4.y];
  return {
    minPt: new McGePoint3d(Math.min(...xs), Math.min(...ys)),
    maxPt: new McGePoint3d(Math.max(...xs), Math.max(...ys)),
  };
}

/**
 * 视口 zoom 到指定区域（CAD 世界坐标包围盒）。
 *
 * 分享二维码 URL 携带 region 参数时，图纸打开完成后调用：把视口缩放到
 * 分享者框选的区域（对应海报图纸图的截取范围）。失败静默（zoom 是增强体验，
 * 不阻塞图纸展示）。
 */
export async function zoomToRegion(region: ThumbnailRegion): Promise<void> {
  try {
    const { MxCpp, McGePoint3d } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD();
    if (!mxcad) return;
    mxcad.zoomW(
      new McGePoint3d(region.minPt.x, region.minPt.y),
      new McGePoint3d(region.maxPt.x, region.maxPt.y)
    );
  } catch (err) {
    console.error('[zoomToRegion] zoom 到分享区域失败:', err);
  }
}

/** 分享图片（海报）生成结果。 */
export interface PosterImageResult {
  /** 图纸图 DataURL（BMP 编码），生成失败为 null */
  dataUrl: string | null;
  /** 框选区域是否与图纸直角方形边框重合（海报据此省略圆角描边） */
  hasBorder: boolean;
}

/**
 * 屏幕像素长度对应的 CAD 世界坐标长度。
 *
 * 用 mxcad 原生长度换算 `mxcad.mxdraw.viewCoordLong2Cad(px)`（视区长度→CAD 长度，
 * 非坐标换算——勿改用 screenCoord2World，那是坐标不是长度）。容差随当前视图缩放
 * 自适应：同一 6px 视觉误差，在放大视图下换算的 CAD 长度小、缩小视图下大——与
 * 「框选时 6px 附近」的直观语义一致。返回 0 表示换算失败（调用方按 0 计，由 3% 长边兜底）。
 */
function screenPxToCadLength(mxcad: McObject, px: number): number {
  try {
    const len = mxcad.mxdraw.viewCoordLong2Cad(px);
    return Number.isFinite(len) && len > 0 ? len : 0;
  } catch (e) {
    console.error('[detectRegionBorder] 6px→CAD 换算失败:', e);
    return 0;
  }
}

/**
 * 检测框选区域是否与图纸上的直角方形边框重合。
 *
 * 用户框选时若刚好把图纸的矩形边框（图框/表格外框/房间轮廓等）框进去，截图
 * 边缘天然是直角边，海报上再叠加圆角描边反而多余；其余情况（任意框选）保留
 * 圆角描边。纯判据（四边共线 + 可见长度）收敛在 @cloudcad/platform 的
 * `isRectSurroundedByBorder`，本函数只负责从引擎遍历实体取包围盒，并把共线容差
 * = max(屏幕 6px 视觉误差换算的 CAD 长度, 区域长边 3%) 传入。**须在框选结束瞬间
 * 调用**（viewCoordLong2Cad 读当前实时视图缩放，出图 zoomW 后失真）。
 * 检测失败（无引擎/异常）恒返回 false（保守：保留圆角描边）。
 */
export async function detectRegionBorder(
  region: ThumbnailRegion
): Promise<boolean> {
  try {
    const { MxCpp } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD();
    if (!mxcad) return false;
    const boxes: RectBox[] = [];
    const ids = mxcad.getDatabase().currentSpace.getAllEntityId();
    for (const id of ids) {
      try {
        const ent = id.getMcDbEntity();
        if (!ent) continue;
        const box = ent.getBoundingBox();
        if (!box?.ret) continue;
        boxes.push({
          minPt: { x: box.minPt.x, y: box.minPt.y },
          maxPt: { x: box.maxPt.x, y: box.maxPt.y },
        });
      } catch {
        // 单个实体异常（已删除/特殊类型）不拖垮整体检测，跳过
        continue;
      }
    }
    const w = Math.abs(region.minPt.x - region.maxPt.x);
    const h = Math.abs(region.minPt.y - region.maxPt.y);
    // 容差：屏幕 6px 视觉误差换算的 CAD 长度（随当前视图缩放自适应）与
    // 区域长边 3% 取较大值。视图放大时 6px 换算较大者主导（跟手）；视图缩小
    // 时 6px 换算很小，由 3% 长边兜底，避免过严导致边框识别漏检。换算失败按 0 计。
    const tol = Math.max(
      screenPxToCadLength(mxcad, 6),
      Math.max(w, h) * 0.03
    );
    return isRectSurroundedByBorder(region, boxes, tol);
  } catch (err) {
    console.error('[detectRegionBorder] 检测框选区域边框失败:', err);
    return false;
  }
}

/**
 * 生成分享图片（海报）用的高清图纸图（BMP 编码，长边 = POSTER_RENDER_SIZE）。
 *
 * 与 generateThumbnail（200px 缩略图，用于文件列表/上传）不同，海报图纸图用引擎
 * 矢量渲染的高分辨率 BMP，清晰度远高于屏幕像素截图（用户参考 Mx_ScreenToBmp：
 * type "image/bmp" + 宽 1000）。有 region 时只截取该区域（按真实宽高比填满），
 * 无 region 时截取整图包围盒（按真实宽高比）。截图前设黑色背景 + 隐藏坐标轴
 * （与黑色海报背景统一，CAD 深色显示），完成/取消后恢复原背景与坐标轴。
 *
 * @param hasBorder 框选区域是否与图纸直角方形边框重合（决定海报是否省略圆角描边）。
 *   **必须由调用方在「框选结束瞬间」算好传入**——viewCoordLong2Cad 读的是当前实时
 *   视图缩放，本函数内部 createCanvasImageData 会把视口 zoomW 到 region 改变缩放，
 *   此时再 detectRegionBorder 就失真了。未传入（undefined，向后兼容）且 region 存在
 *   时才在此兜底检测（此时序已不准，调用方应显式传入）。
 *   无 region（默认整图框）时恒 hasBorder=true（整图框天然不描边），不走算法。
 */
export async function generatePosterImage(
  region?: ThumbnailRegion | null,
  hasBorder?: boolean
): Promise<PosterImageResult | null> {
  try {
    const { MxCpp, McGePoint3d, MxCanvas2Image } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD();
    mxcad.setAttribute({ ShowCoordinate: false });

    let minPt: McGePoint3d;
    let maxPt: McGePoint3d;
    if (region) {
      minPt = new McGePoint3d(
        Math.min(region.minPt.x, region.maxPt.x),
        Math.min(region.minPt.y, region.maxPt.y)
      );
      maxPt = new McGePoint3d(
        Math.max(region.minPt.x, region.maxPt.x),
        Math.max(region.minPt.y, region.maxPt.y)
      );
    } else {
      const box = mxcad.getDatabase().currentSpace.getBoundingBox();
      minPt = box.minPt;
      maxPt = box.maxPt;
    }

    const { outWidth, outHeight, newMinPt, newMaxPt } = computeRenderRange(
      minPt,
      maxPt,
      POSTER_RENDER_SIZE,
      false
    );

    // 截图区域是否需要描边：
    // - 无 region（默认整图框）：整图框天然不需要描边，恒 hasBorder=true（不描边），不走算法。
    // - 有 region（用户框选）：按四边算法 detectRegionBorder 判定，框住图纸直角方形边框则
    //   省略圆角描边（截图边缘天然直角）。hasBorder 由调用方在框选结束瞬间算好传入
    //   （viewCoordLong2Cad 实时，出图 zoomW 后再算会失真）；未传入才在此兜底检测（此时仍是
    //   createCanvasImageData 之前，视图未被 zoomW，时序准确）。
    const border = region
      ? typeof hasBorder === 'boolean'
        ? hasBorder
        : await detectRegionBorder(region)
      : true;

    // 黑底截图（与黑色海报背景统一，CAD 深色显示），完成/取消后恢复原背景
    const bakViewColor = mxcad.getViewBackgroundColor();
    mxcad.setViewBackgroundColor(0, 0, 0);

    return await new Promise<PosterImageResult | null>((resolve) => {
      // type "image/bmp"：three.js 层的 createCanvasImageData 回调参数无效（见 mxdraw
      // esm 实现，bmp 分支回调 undefined），真正的图在 canvas 里——createCanvasImageData
      // 的副作用是把视口缩放到 range_pt1/range_pt2 + setSize(width,height) 并渲染，
      // 故回调里用 MxCanvas2Image 从 getCanvas() 转 BMP（参考 Mx_ScreenToBmp）。
      mxcad.mxdraw.createCanvasImageData(
        () => {
          mxcad.setAttribute({ ShowCoordinate: true });
          mxcad.setViewBackgroundColor(bakViewColor);
          let dataUrl: string | null = null;
          try {
            const canvas2image = new MxCanvas2Image(document);
            const img = canvas2image.convertToImage(
              mxcad.mxdraw.getCanvas(),
              undefined,
              undefined,
              'bmp'
            );
            dataUrl = img?.src ?? null;
          } catch (e) {
            console.error('[generatePosterImage] 转 BMP 失败:', e);
            dataUrl = null;
          }
          resolve(dataUrl ? { dataUrl, hasBorder: border } : null);
          setTimeout(() => {
            requestAnimationFrame(() => {
              mxcad.mxdraw.updateCanvasSize();
            });
          }, 50);
        },
        {
          type: 'image/bmp',
          width: outWidth,
          height: outHeight,
          range_pt1: new McGePoint3d(newMinPt.x, newMinPt.y).toVector3(),
          range_pt2: new McGePoint3d(newMaxPt.x, newMaxPt.y).toVector3(),
        }
      );
    });
  } catch (err) {
    console.error('[generatePosterImage] 分享图片生成失败:', err);
    return null;
  }
}
