import { thumbnailControllerCheckThumbnail, thumbnailControllerUploadThumbnail } from '../api-sdk';
import { unwrap } from '../utils/apiError';
import { t } from '@/languages';
import { isRectSurroundedByBorder, type RectBox } from '@cloudcad/platform';

/** 缩略图边长（与 PC 端 mxcadThumbnail.generateThumbnail 默认值一致） */
const THUMBNAIL_SIZE = 200;

/** 缩略图截取区域（归一化包围盒，minPt <= maxPt）。对齐 PC 端 ThumbnailRegion。 */
export interface ThumbnailRegion {
  minPt: { x: number; y: number };
  maxPt: { x: number; y: number };
}

/**
 * mxcad 1.0.393 的 d.ts 未声明 McObject.getDatabase（运行时存在，见 mxcad.es.js 的 McObject 类体），
 * 这里按缩略图实际用到的 API 面补最小类型。
 */
interface ThumbnailCadApi {
  setAttribute(val: object): boolean;
  getDatabase(): {
    currentSpace: {
      getBoundingBox(): { minPt: { x: number; y: number }; maxPt: { x: number; y: number } };
      getAllEntityId(): Array<{
        getMcDbEntity(): {
          getBoundingBox(): {
            minPt: { x: number; y: number };
            maxPt: { x: number; y: number };
            ret: boolean;
          };
        } | null;
      }>;
    };
  };
  getViewBackgroundColor?(): number;
  setViewBackgroundColor?(red: number, green?: number, blue?: number): void;
  mxdraw: {
    createCanvasImageData(fun: (imageData: string) => void, param?: object): void;
    getCanvas(): HTMLCanvasElement;
    updateCanvasSize(): void;
    viewCoordLong2Cad(l: number): number;
  };
}

/** 等渲染空闲再生成（与 PC setupFileOpenListener 的调度一致，避免与首屏绘制抢主线程） */
function waitForRenderIdle(): Promise<void> {
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) {
    return new Promise((resolve) => {
      idleWindow.requestIdleCallback!(() => resolve(), { timeout: 5000 });
    });
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match || !match[2]) return null;
  const bytes = atob(match[2]);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  // 用真实 mime（createCanvasImageData 输出 image/bmp 时保留，供 createImageBitmap 正确解码）。
  // 上传路径不依赖此 type（uploadThumbnailBlobForNode 用 File 显式声明 image/jpeg）。
  return new Blob([buffer], { type: match[1] || 'image/png' });
}

/** renderFullDrawing 的渲染选项（generateThumbnail 200px 缩略图 / generatePosterImageBlob 高清 BMP 共用） */
interface RenderFullDrawingOptions {
  /** 输出图像类型（createCanvasImageData 的 type，如 "image/bmp"）。缺省用引擎默认 */
  type?: string;
  /** 长边目标尺寸（默认 THUMBNAIL_SIZE=200） */
  size?: number;
  /** 按包围盒真实宽高比填满画布（海报高清图）。缺省 false：有 region 填满 / 整图正方形 contain */
  aspectFill?: boolean;
  /** 截图前设黑色背景、完成后恢复（与黑色海报背景统一，CAD 深色显示） */
  blackBackground?: boolean;
}

/**
 * 渲染图纸位图（参考 PC mxcadThumbnail.generateThumbnail / generatePosterImage）。
 * - 有 region：按区域截取；aspectFill 时按区域真实宽高比（长边 = size）填满画布
 * - 无 region：aspectFill 时按整图包围盒真实宽高比（长边 = size）填满；
 *   否则按包围盒等比缩放到 size×size（contain，不裁切），整张图
 *   直接截当前视口只会拍到用户正在看的那一小块，包围盒才是整张图。
 */
async function renderFullDrawing(
  region?: ThumbnailRegion | null,
  options: RenderFullDrawingOptions = {},
): Promise<Blob | null> {
  try {
    const { MxCpp, McGePoint3d, MxCanvas2Image } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD() as unknown as ThumbnailCadApi;
    if (!mxcad) return null;

    const size = options.size ?? THUMBNAIL_SIZE;
    // 坐标轴会出现在图元里，出图前先隐藏
    mxcad.setAttribute({ ShowCoordinate: false });

    let minPt: { x: number; y: number };
    let maxPt: { x: number; y: number };
    if (region) {
      // 指定区域：归一化保证 minPt <= maxPt
      minPt = {
        x: Math.min(region.minPt.x, region.maxPt.x),
        y: Math.min(region.minPt.y, region.maxPt.y),
      };
      maxPt = {
        x: Math.max(region.minPt.x, region.maxPt.x),
        y: Math.max(region.minPt.y, region.maxPt.y),
      };
    } else {
      const box = mxcad.getDatabase().currentSpace.getBoundingBox();
      minPt = box.minPt;
      maxPt = box.maxPt;
    }

    const width = Math.abs(minPt.x - maxPt.x);
    const height = Math.abs(minPt.y - maxPt.y);
    // 空白图纸（包围盒退化）无法算比例尺，交给截屏回退
    if (!(width > 0) || !(height > 0)) return null;

    let outWidth = size;
    let outHeight = size;
    let rangePt1: { x: number; y: number };
    let rangePt2: { x: number; y: number };

    if (region || options.aspectFill) {
      // 指定区域 / 海报高清图：输出宽高按包围盒真实宽高比（长边 = size），范围填满画布（按比例）
      const aspect = width / height;
      if (aspect >= 1) {
        outWidth = size;
        outHeight = Math.max(1, Math.round(size / aspect));
      } else {
        outHeight = size;
        outWidth = Math.max(1, Math.round(size * aspect));
      }
      rangePt1 = minPt;
      rangePt2 = maxPt;
    } else {
      // 整图包围盒：正方形画布 + 正方形范围（contain，不裁切）
      const scale = Math.min(size / width, size / height);
      const centerX = (minPt.x + maxPt.x) / 2;
      const centerY = (minPt.y + maxPt.y) / 2;
      const half = size / 2 / scale;
      rangePt1 = { x: centerX - half, y: centerY - half };
      rangePt2 = { x: centerX + half, y: centerY + half };
    }

    // 黑底截图（与黑色海报背景统一，CAD 深色显示），完成/取消后恢复原背景
    const bakViewColor = options.blackBackground
      ? mxcad.getViewBackgroundColor?.()
      : undefined;
    if (options.blackBackground) {
      mxcad.setViewBackgroundColor?.(0, 0, 0);
    }

    return await new Promise<Blob | null>((resolve) => {
      // type "image/bmp"：three.js 层 createCanvasImageData 回调参数无效（见 mxdraw esm
      // 实现，bmp 分支回调 undefined），真正的图在 canvas 里——该调用的副作用是把视口缩放到
      // range_pt1/range_pt2 + setSize(width,height) 并渲染，故 BMP 时用 MxCanvas2Image 从
      // getCanvas() 转（参考 Mx_ScreenToBmp）。png 缩略图仍用回调 imageData（有效）。
      const useBmp = options.type === 'image/bmp' || options.type === 'bmp';
      mxcad.mxdraw.createCanvasImageData(
        (imageData: string) => {
          mxcad.setAttribute({ ShowCoordinate: true });
          if (options.blackBackground && bakViewColor !== undefined) {
            mxcad.setViewBackgroundColor?.(bakViewColor);
          }
          let blob: Blob | null = null;
          try {
            if (useBmp) {
              const canvas2image = new MxCanvas2Image(document);
              const img = canvas2image.convertToImage(
                mxcad.mxdraw.getCanvas(),
                undefined,
                undefined,
                'bmp'
              );
              blob = img?.src ? dataUrlToBlob(img.src) : null;
            } else {
              blob = dataUrlToBlob(imageData);
            }
          } catch (e) {
            console.error('[renderFullDrawing] 出图失败:', e);
            blob = null;
          }
          resolve(blob);
          // 还原视口（与 PC 一致：50ms 后 rAF 再刷一次画布尺寸）
          setTimeout(() => {
            requestAnimationFrame(() => {
              mxcad.mxdraw.updateCanvasSize();
            });
          }, 50);
        },
        {
          ...(options.type ? { type: options.type } : {}),
          width: outWidth,
          height: outHeight,
          range_pt1: new McGePoint3d(rangePt1.x, rangePt1.y, 0).toVector3(),
          range_pt2: new McGePoint3d(rangePt2.x, rangePt2.y, 0).toVector3(),
        },
      );
    });
  } catch (err) {
    console.error('[generateThumbnail] 缩略图生成失败:', err);
    return null;
  }
}

/** 回退：直接截取当前画布（引擎离屏渲染不可用时） */
function captureCanvas(): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.getElementById('mxCanvas') as HTMLCanvasElement;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.7);
    } catch {
      resolve(null);
    }
  });
}

export async function generateThumbnail(
  region?: ThumbnailRegion | null,
): Promise<Blob | null> {
  return (await renderFullDrawing(region)) ?? (await captureCanvas());
}

/** 分享图片（海报）图纸图渲染长边尺寸（BMP 高清，宽约 1000px，远高于 200px 缩略图） */
export const POSTER_RENDER_SIZE = 1000;

/**
 * 生成分享图片（海报）用的高清图纸图（BMP 编码，长边 = POSTER_RENDER_SIZE）。
 *
 * 与 generateThumbnail（200px 缩略图，文件列表/上传用）不同，海报图纸图用引擎矢量
 * 渲染的高分辨率 BMP（用户参考 Mx_ScreenToBmp：type "image/bmp" + 宽 1000），清晰度
 * 远高于屏幕像素截图。有 region 时只截取该区域，无 region 时截取整图包围盒，均按
 * 真实宽高比填满 + 黑底（与黑色海报背景统一，CAD 深色显示）。
 */
export async function generatePosterImageBlob(
  region?: ThumbnailRegion | null,
): Promise<Blob | null> {
  return renderFullDrawing(region, {
    type: 'image/bmp',
    size: POSTER_RENDER_SIZE,
    aspectFill: true,
    blackBackground: true,
  });
}

/**
 * 显式还原画布尺寸（引擎截图后画布被 createCanvasImageData 的 setSize 改到截图尺寸，
 * 需 updateCanvasSize 还原到视口尺寸）。
 *
 * 供跨页流程（usePosterRegionFlow）在 router.replace 收起编辑器**之前**显式调用：
 * renderFullDrawing 回调里那个延迟（50ms+rAF）的 updateCanvasSize 会与紧随其后的
 * 路由切换抢跑——画布可能停留在 1000px 截图尺寸，而移动端没有 ResizeObserver /
 * visibilitychange 在重新露出时补 resize，于是重新进编辑器画布尺寸错乱。在路由切换
 * 前显式还原（此刻画布仍可见），确定性地恢复到视口尺寸（对齐 PC 同页流程：画布全程
 * 可见，延迟还原本就可靠，故 PC 无此问题）。
 */
export async function restoreCanvasSize(): Promise<void> {
  try {
    const { MxCpp } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD() as unknown as ThumbnailCadApi;
    mxcad?.mxdraw.updateCanvasSize();
  } catch (err) {
    console.error('[restoreCanvasSize] 还原画布尺寸失败:', err);
  }
}

/**
 * 屏幕像素长度对应的 CAD 世界坐标长度。
 *
 * 用 mxcad 原生长度换算 `mxcad.mxdraw.viewCoordLong2Cad(px)`（视区长度→CAD 长度，
 * 非坐标换算——勿改用 screenCoord2World，那是坐标不是长度）。容差随当前视图缩放
 * 自适应（与 PC screenPxToCadLength 同构）。返回 0 表示换算失败。
 */
function screenPxToCadLength(mxcad: ThumbnailCadApi, px: number): number {
  try {
    const len = mxcad.mxdraw.viewCoordLong2Cad(px);
    return Number.isFinite(len) && len > 0 ? len : 0;
  } catch (e) {
    console.error('[detectRegionBorder] 6px→CAD 换算失败:', e);
    return 0;
  }
}

/**
 * 检测框选区域是否与图纸上的直角方形边框重合（与 PC detectRegionBorder 同构）。
 *
 * 框选刚好框住图纸矩形边框（图框/表格外框/房间轮廓等）时截图边缘天然是直角边，
 * 海报无需再叠圆角描边；其余情况保留圆角描边。纯判据（四边共线 + 可见长度）收敛在
 * @cloudcad/platform 的 `isRectSurroundedByBorder`，本函数只负责从引擎遍历实体取
 * 包围盒，并把屏幕 6px 视觉误差换算成 CAD 长度作为共线容差。
 * 检测失败恒返回 false（保守：保留圆角描边）。
 */
export async function detectRegionBorder(
  region: ThumbnailRegion,
): Promise<boolean> {
  try {
    const { MxCpp } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD() as unknown as ThumbnailCadApi;
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
 * 交互式框选缩略图区域（移动端）。
 *
 * 与 PC 端 MxCADUtility.getCorner 不同，移动端用 MxCADUiPrPoint 两点对角框选
 * （参考 m_mx_rect 命令）：先取第一个角，再取对角，移动时 setUserDraw 画橡皮筋
 * 矩形预览；触控模式 kGetEnd 适配手机手指。用户取消（Esc/空白）时返回 null。
 */
export async function pickThumbnailRegion(
  prompt?: string,
): Promise<ThumbnailRegion | null> {
  try {
    const { MxCADUiPrPoint, McDbPolyline, McGePoint3d } = await import('mxcad');
    const { MxType } = await import('mxdraw');

    const createRect = (
      a: { x: number; y: number; z?: number },
      c: { x: number; y: number; z?: number },
    ) => {
      const pl = new McDbPolyline();
      pl.addVertexAt(new McGePoint3d(a.x, a.y, a.z ?? 0));
      pl.addVertexAt(new McGePoint3d(a.x, c.y, a.z ?? 0));
      pl.addVertexAt(new McGePoint3d(c.x, c.y, c.z ?? 0));
      pl.addVertexAt(new McGePoint3d(c.x, a.y, c.z ?? 0));
      pl.isClosed = true;
      return pl;
    };

    const getPoint = new MxCADUiPrPoint();
    // 禁用极轴追踪：框选矩形时避免 OSNAP 吸附到极轴角度导致对角点偏离（mxcad 官方 API）
    getPoint.disableAllTrace(true);
    
    getPoint.clearLastInputPoint();
    getPoint.setMessage(prompt ?? t('指定缩略图区域，请框选矩形范围'));
    getPoint.setOffsetInputPostion(true);
    getPoint.setInputToucheType(MxType.InputToucheType.kGetEnd);
    const pt1 = await getPoint.go();
    if (!pt1) return null;

    getPoint.setUserDraw((pt3, pw) => {
      pw.drawMcDbEntity(createRect(pt1, pt3));
    });
    const pt3 = await getPoint.go();
    if (!pt3) return null;

    return {
      minPt: { x: Math.min(pt1.x, pt3.x), y: Math.min(pt1.y, pt3.y) },
      maxPt: { x: Math.max(pt1.x, pt3.x), y: Math.max(pt1.y, pt3.y) },
    };
  } catch (err) {
    console.error('[pickThumbnailRegion] 框选区域失败:', err);
    return null;
  }
}

/** 上传已生成的缩略图 Blob（供后台渲染复用出图结果，避免二次生成）。 */
export async function uploadThumbnailBlobForNode(
  nodeId: string,
  blob: Blob,
): Promise<boolean> {
  if (!nodeId || !blob) return false;
  try {
    const checkResult = await thumbnailControllerCheckThumbnail({ path: { nodeId } });
    if (checkResult.data?.exists) {
      return true;
    }

    const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
    const result = await thumbnailControllerUploadThumbnail({
      path: { nodeId },
      body: { file },
    });
    unwrap(result);
    return true;
  } catch {
    return false;
  }
}

export async function uploadThumbnailForNode(
  nodeId: string,
  options?: { waitForRender?: boolean },
): Promise<boolean> {
  if (!nodeId) return false;
  try {
    if (options?.waitForRender) await waitForRenderIdle();
    const blob = await generateThumbnail();
    if (!blob) return false;
    return uploadThumbnailBlobForNode(nodeId, blob);
  } catch {
    return false;
  }
}
