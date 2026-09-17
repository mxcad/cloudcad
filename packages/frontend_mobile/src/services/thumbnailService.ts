import { thumbnailControllerCheckThumbnail, thumbnailControllerUploadThumbnail } from '../api-sdk';

/** 缩略图边长（与 PC 端 mxcadThumbnail.generateThumbnail 默认值一致） */
const THUMBNAIL_SIZE = 200;

/**
 * mxcad 1.0.393 的 d.ts 未声明 McObject.getDatabase（运行时存在，见 mxcad.es.js 的 McObject 类体），
 * 这里按缩略图实际用到的 API 面补最小类型。
 */
interface ThumbnailCadApi {
  setAttribute(val: object): boolean;
  getDatabase(): {
    currentSpace: {
      getBoundingBox(): { minPt: { x: number; y: number }; maxPt: { x: number; y: number } };
    };
  };
  mxdraw: {
    createCanvasImageData(fun: (imageData: string) => void, param?: object): void;
    updateCanvasSize(): void;
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
  const dataPart = dataUrl.split(',')[1];
  if (!dataPart) return null;
  const bytes = atob(dataPart);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: 'image/jpeg' });
}

/**
 * 按当前空间包围盒等比缩放到 200×200 后离屏渲染（参考 PC mxcadThumbnail.generateThumbnail）。
 * 直接截当前视口只会拍到用户正在看的那一小块，包围盒才是整张图。
 */
async function renderFullDrawing(): Promise<Blob | null> {
  try {
    const { MxCpp, McGePoint3d } = await import('mxcad');
    const mxcad = MxCpp.getCurrentMxCAD() as unknown as ThumbnailCadApi;
    if (!mxcad) return null;

    // 坐标轴会出现在图元里，出图前先隐藏
    mxcad.setAttribute({ ShowCoordinate: false });
    const box = mxcad.getDatabase().currentSpace.getBoundingBox();
    const { minPt, maxPt } = box;

    const width = Math.abs(minPt.x - maxPt.x);
    const height = Math.abs(minPt.y - maxPt.y);
    // 空白图纸（包围盒退化）无法算比例尺，交给截屏回退
    if (!(width > 0) || !(height > 0)) return null;

    const scale = Math.min(THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height);
    const centerX = (minPt.x + maxPt.x) / 2;
    const centerY = (minPt.y + maxPt.y) / 2;
    const half = THUMBNAIL_SIZE / 2 / scale;

    return await new Promise<Blob | null>((resolve) => {
      mxcad.mxdraw.createCanvasImageData(
        (imageData: string) => {
          mxcad.setAttribute({ ShowCoordinate: true });
          resolve(dataUrlToBlob(imageData));
          // 还原视口（与 PC 一致：50ms 后 rAF 再刷一次画布尺寸）
          setTimeout(() => {
            requestAnimationFrame(() => {
              mxcad.mxdraw.updateCanvasSize();
            });
          }, 50);
        },
        {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          range_pt1: new McGePoint3d(centerX - half, centerY - half, 0),
          range_pt2: new McGePoint3d(centerX + half, centerY + half, 0),
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

export async function generateThumbnail(): Promise<Blob | null> {
  return (await renderFullDrawing()) ?? (await captureCanvas());
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

    const checkResult = await thumbnailControllerCheckThumbnail({ path: { nodeId } });
    if (checkResult.data?.exists) {
      return true;
    }

    const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
    const result = await thumbnailControllerUploadThumbnail({
      path: { nodeId },
      body: { file },
    });
    return !result.error;
  } catch {
    return false;
  }
}
