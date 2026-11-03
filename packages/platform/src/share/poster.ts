/**
 * 分享链接海报（分享图片）布局——跨端共享的纯计算。
 *
 * 背景：PC 与移动端都要生成「图纸分享链接」的分享图片（海报）：底图=图纸缩略图，
 * 右上角=分享链接二维码，二维码下方=「扫一扫看图纸」文字。海报尺寸/缩略图缩放/
 * 二维码与文字定位这三件事两端必须一致（否则同一分享在两端出的海报长宽比例、
 * 元素位置不同）。这里收敛为唯一实现；canvas 绘制本身是 DOM 能力，留各端薄封装。
 *
 * 产品决策（用户拍板）：
 * - 「风格」= 布局/尺寸预设：手机竖版 9:16（默认 1080×1920）、正方形 1:1、横版 16:9。
 * - 二维码固定右上角，文字在二维码正下方居中。
 * - 缩略图等比 contain（不裁切图纸），四周留边距，风格背景填充剩余区域。
 */

/** 海报布局预设（尺寸/比例）。`phone`=手机竖版 9:16（默认），`square`=1:1，`landscape`=16:9。 */
export type SharePosterLayout = 'phone' | 'square' | 'landscape';

/** 各布局的原始像素尺寸。 */
export interface SharePosterSize {
  width: number;
  height: number;
}

/** 布局预设 → 海报画布尺寸（单一事实源）。 */
export const SHARE_POSTER_SIZES: Record<SharePosterLayout, SharePosterSize> = {
  // 1080 宽 × 1920 高：标准 9:16 手机竖版
  phone: { width: 1080, height: 1920 },
  // 1080 × 1080：正方形
  square: { width: 1080, height: 1080 },
  // 1920 宽 × 1080 高：横版 16:9
  landscape: { width: 1920, height: 1080 },
};

/** 默认布局 = 手机竖版 9:16。 */
export const SHARE_POSTER_DEFAULT_LAYOUT: SharePosterLayout = 'phone';

/** 海报内一个矩形区域（坐标原点=海报左上角，单位=海报像素）。 */
export interface SharePosterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 布局计算输出：海报尺寸 + 各元素区域，canvas 绘制方按此渲染。 */
export interface SharePosterLayoutSpec {
  layout: SharePosterLayout;
  /** 海报画布宽（px） */
  width: number;
  /** 海报画布高（px） */
  height: number;
  /** 缩略图绘制区域（等比 contain 后），四周留边距 */
  thumbnailRect: SharePosterRect;
  /** 二维码区域（右上角，含留白，绘制方可在其下垫白底卡） */
  qrRect: SharePosterRect;
  /** 「扫一扫看图纸」文字区域（二维码正下方居中） */
  textRect: SharePosterRect;
  /** 「扫一扫看图纸」字号（px，绘制方直接取用） */
  textFontSize: number;
  /** 底部文件名字号（px，仅 showFooter 时返回；0=不显示） */
  footerFontSize: number;
  /** 底部文件名区域（仅 showFooter 时返回；否则 0 值矩形） */
  footerRect: SharePosterRect;
}

/** 布局参数。 */
export interface SharePosterLayoutOptions {
  layout?: SharePosterLayout;
  /**
   * 缩略图宽高比（width/height）。前端 generateThumbnail 与后端 MxWebDwg2Jpg.exe
   * 都默认出 200×200 方形，缺省 1。非方形缩略图（如用户自定义尺寸）传真实比例，
   * 保证 contain 不裁切、不拉伸。
   */
  thumbnailAspectRatio?: number;
  /** 是否在底部显示文件名（海报常带，默认 true）。 */
  showFooter?: boolean;
  /**
   * 二维码大小缩放（默认 1）。0.5~2.0 范围由 UI 滑杆约束；二维码区域与
   * 「扫一扫看图纸」文字区域**一体缩放**（文字在二维码正下方，QR 变大则下移、字号同步放大）。
   */
  qrScale?: number;
}

/**
 * 布局计算：给每个元素在指定布局下算出绘制区域。纯计算，无 DOM/IO。
 *
 * 缩略图等比 contain 进「海报减边距」区域（不裁切图纸，风格背景填充余量）；
 * 二维码固定右上角；「扫一扫看图纸」在二维码正下方水平居中；文件名贴底居中。
 * 所有坐标、尺寸都是整数（canvas 缩放用整数避免跨浏览器亚像素模糊）。
 */
export function computeSharePosterLayout(
  options: SharePosterLayoutOptions = {}
): SharePosterLayoutSpec {
  const layout = options.layout ?? SHARE_POSTER_DEFAULT_LAYOUT;
  const aspect = normalizeAspect(options.thumbnailAspectRatio);
  const { width, height } = SHARE_POSTER_SIZES[layout];

  // 边距与二维码尺寸按海报宽度比例推导（竖版/横版/方形都能自适应）。
  // 二维码「能扫描就行」：缩小到宽 15%（原 24%），海报以图纸为主、右上小二维码更简洁。
  // qrScale 由调用方传入（海报设置动态调整，默认 1）；「扫一扫看图纸」文字与二维码一体缩放。
  const padding = Math.round(width * 0.045);
  const qrScale = normalizeScale(options.qrScale);
  const qrSize = Math.round(width * 0.15 * qrScale);
  const textFontSize = Math.round(width * 0.024 * qrScale);

  // 二维码右上角（padding 内缩）
  const qrRect: SharePosterRect = {
    x: width - padding - qrSize,
    y: padding,
    width: qrSize,
    height: qrSize,
  };

  // 「扫一扫看图纸」：二维码正下方居中，与二维码等宽（窄幅折行由绘制方按此宽排版）
  const textRect: SharePosterRect = {
    x: qrRect.x,
    y: qrRect.y + qrRect.height + Math.round(textFontSize * 0.9),
    width: qrRect.width,
    height: Math.round(textFontSize * 1.5),
  };

  // 底部文件名（贴底居中，可选）
  const showFooter = options.showFooter ?? true;
  const footerFontSize = showFooter ? Math.round(width * 0.03) : 0;
  const footerRect: SharePosterRect = showFooter
    ? {
        x: Math.round(width * 0.06),
        y: height - padding - Math.round(footerFontSize * 1.6),
        width: width - Math.round(width * 0.12),
        height: Math.round(footerFontSize * 1.6),
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  // 缩略图区域：海报减边距，等比 contain
  const container: SharePosterRect = {
    x: padding,
    y: padding,
    width: width - padding * 2,
    height: height - padding * 2,
  };
  const thumbnailRect = fitContain(container, aspect);

  return {
    layout,
    width,
    height,
    thumbnailRect,
    qrRect,
    textRect,
    textFontSize,
    footerFontSize,
    footerRect,
  };
}

/** 宽高比归一化：非法/非有限值回落到 1（方形），避免 0/NaN 造成除零。 */
function normalizeAspect(aspect: number | undefined): number {
  if (aspect === undefined) return 1;
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return aspect;
}

/** 缩放归一化：非法/非有限/非正值回落到 1（不缩放）。范围钳制由 UI 滑杆负责。 */
function normalizeScale(scale: number | undefined): number {
  if (scale === undefined) return 1;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

/**
 * 等比 contain：把 aspect（w/h）的图缩放进 container 并居中，不裁切。
 * 结果坐标/尺寸取整；宽或高至少 1px 防 0 尺寸。
 */
function fitContain(
  container: SharePosterRect,
  aspect: number
): SharePosterRect {
  const containerAspect = container.width / container.height;
  let w: number;
  let h: number;
  if (aspect >= containerAspect) {
    // 图更宽：以宽为限
    w = container.width;
    h = Math.round(container.width / aspect);
  } else {
    // 图更高：以高为限
    h = container.height;
    w = Math.round(container.height * aspect);
  }
  w = Math.max(1, w);
  h = Math.max(1, h);
  return {
    x: container.x + Math.round((container.width - w) / 2),
    y: container.y + Math.round((container.height - h) / 2),
    width: w,
    height: h,
  };
}
