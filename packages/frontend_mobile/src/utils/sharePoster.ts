/**
 * 分享链接海报（分享图片）—— 移动端 canvas 合成与下载。
 *
 * 布局数学收敛在 @cloudcad/platform 的 `computeSharePosterLayout`（两端共用），
 * 本文件只做 DOM 能力：把缩略图 + 二维码 + 文字按布局绘制到 canvas，产出可下载图片。
 * PC 端在 `frontend/src/lib/sharePoster.ts` 有同构实现（canvas 逻辑一致）。
 */

import QRCode from 'qrcode'
import {
  computeSharePosterLayout,
  SHARE_POSTER_DEFAULT_LAYOUT,
  type SharePosterLayout,
} from '@cloudcad/platform'
import { triggerBlobDownload } from '@/utils/download'

/** 海报合成参数。 */
export interface SharePosterOptions {
  /** 分享链接绝对 URL（二维码内容） */
  shareUrl: string
  /** 图纸文件名（底部展示） */
  fileName: string
  /** 缩略图源：dataURL、http(s) URL、Blob */
  thumbnail: string | Blob
  /** 布局（尺寸/比例），默认手机竖版 9:16 */
  layout?: SharePosterLayout
  /** 「扫一扫看图纸」文案（i18n，调用方传入） */
  scanText: string
  /**
   * 底部名称显示控制：缺省 undefined 显示 fileName；传 null 隐藏（同时省出底部
   * 空间给图纸）；传字符串则用自定义名称替代 fileName。空字符串视为隐藏。
   */
  footerText?: string | null
  /** 二维码大小缩放（默认 1，UI 滑杆 0.5~2.0 约束）；「扫一扫看图纸」文字与二维码一体缩放 */
  qrScale?: number
  /**
   * 图纸图天然是直角方形边框（框选区域与图纸边框重合，见 detectRegionBorder）时为
   * true：截图边缘已是直角边，直接矩形绘制、不再叠加圆角裁剪与描边。缺省 false
   * 保留圆角描边（默认行为，黑底图纸与深色背景靠描边区分）。
   */
  thumbnailHasBorder?: boolean
}

/** 默认海报主题（黑色经典，与 PC 端 THEME 保持一致）。 */
const THEME = {
  backgroundTop: '#000000',
  backgroundBottom: '#000000',
  text: '#ffffff',
  textMuted: 'rgba(255, 255, 255, 0.72)',
  qrCard: '#ffffff',
  /** 二维码白卡投影（提升层次，浮在图纸上） */
  qrCardShadow: 'rgba(0, 0, 0, 0.45)',
  /** 图纸卡描边（黑底图纸与黑背景的细分界，黑上黑靠描边区分） */
  thumbStroke: 'rgba(255, 255, 255, 0.28)',
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/)
  if (!m || !m[2]) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * 合成海报 PNG dataURL。
 *
 * 流程：布局 → 背景渐变 → 缩略图 contain → 白卡二维码（右上）→「扫一扫看图纸」
 * （二维码下居中）→ 底部文件名。全部按 `computeSharePosterLayout` 的坐标绘制。
 */
export async function composeSharePosterDataUrl(
  options: SharePosterOptions
): Promise<string> {
  const layout = options.layout ?? SHARE_POSTER_DEFAULT_LAYOUT

  // 底部名称：footerText=null 隐藏（省出底部空间给图纸）；undefined 用 fileName；
  // 字符串用自定义名称（空串视为隐藏）。showFooter 决定布局是否预留底部空间。
  const showFooter = options.footerText !== null
  const footerName =
    options.footerText === undefined ? options.fileName : options.footerText

  // 统一转 Blob：dataURL 或 http(s) URL（缩略图接口按 cookie 鉴权，fetch+credentials
  // 避免直接 <img src=cross-origin> 污染 canvas 导致 toDataURL 抛错）
  const thumbnailBlob =
    options.thumbnail instanceof Blob
      ? options.thumbnail
      : typeof options.thumbnail === 'string' && options.thumbnail.startsWith('data:')
        ? dataUrlToBlob(options.thumbnail)
        : await (await fetch(options.thumbnail, { credentials: 'include' })).blob()
  if (!thumbnailBlob) throw new Error('invalid thumbnail data URL')

  const bitmap = await createImageBitmap(thumbnailBlob)
  const aspect = bitmap.width > 0 ? bitmap.width / bitmap.height : 1
  const spec = computeSharePosterLayout({
    layout,
    thumbnailAspectRatio: aspect,
    showFooter,
    qrScale: options.qrScale,
  })

  const canvas = document.createElement('canvas')
  canvas.width = spec.width
  canvas.height = spec.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')

  // 背景（深色渐变）
  const grad = ctx.createLinearGradient(0, 0, 0, spec.height)
  grad.addColorStop(0, THEME.backgroundTop)
  grad.addColorStop(1, THEME.backgroundBottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, spec.width, spec.height)

  // 缩略图（contain，不裁切）。默认圆角矩形裁剪 + 细分界描边（黑底图纸与深色背景区分）；
  // 框选区域与图纸直角方形边框重合（thumbnailHasBorder）时截图边缘天然是直角边，
  // 直接矩形绘制、不再叠加圆角裁剪与描边（叠加在图纸边框上反而多余）。
  const thumb = spec.thumbnailRect
  if (options.thumbnailHasBorder) {
    ctx.drawImage(bitmap, thumb.x, thumb.y, thumb.width, thumb.height)
  } else {
    const thumbRadius = Math.round(Math.min(thumb.width, thumb.height) * 0.045)
    ctx.save()
    roundRect(ctx, thumb.x, thumb.y, thumb.width, thumb.height, thumbRadius)
    ctx.clip()
    ctx.drawImage(bitmap, thumb.x, thumb.y, thumb.width, thumb.height)
    ctx.restore()
    // 细分界描边（白底图纸与深色背景之间）
    ctx.save()
    ctx.strokeStyle = THEME.thumbStroke
    ctx.lineWidth = Math.max(2, Math.round(thumb.width * 0.004))
    roundRect(ctx, thumb.x, thumb.y, thumb.width, thumb.height, thumbRadius)
    ctx.stroke()
    ctx.restore()
  }

  // 二维码白卡（右上角）：圆角 + 投影浮起
  const qr = spec.qrRect
  const qrCardPad = Math.round(qr.width * 0.08)
  ctx.save()
  ctx.shadowColor = THEME.qrCardShadow
  ctx.shadowBlur = Math.round(qr.width * 0.07)
  ctx.shadowOffsetY = Math.round(qr.width * 0.035)
  roundRect(
    ctx,
    qr.x - qrCardPad,
    qr.y - qrCardPad,
    qr.width + qrCardPad * 2,
    qr.height + qrCardPad * 2,
    Math.round(qr.width * 0.09)
  )
  ctx.fillStyle = THEME.qrCard
  ctx.fill()
  ctx.restore()

  const qrDataUrl = await QRCode.toDataURL(options.shareUrl, {
    width: qr.width,
    margin: 2,
  })
  const qrImg = new Image()
  qrImg.src = qrDataUrl
  await qrImg.decode()
  ctx.drawImage(qrImg, qr.x, qr.y, qr.width, qr.height)

  // 「扫一扫看图纸」（二维码正下方居中，白色）
  ctx.fillStyle = THEME.text
  ctx.font = `600 ${spec.textFontSize}px -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    options.scanText,
    spec.textRect.x + spec.textRect.width / 2,
    spec.textRect.y + spec.textRect.height / 2
  )

  // 底部名称（贴底居中，弱化色）。footerText=null/空 或无 fileName 时不画
  const footer = spec.footerRect
  if (footer.width > 0 && footerName) {
    ctx.fillStyle = THEME.textMuted
    ctx.font = `500 ${spec.footerFontSize}px -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.fillText(
      footerName,
      footer.x + footer.width / 2,
      footer.y + footer.height / 2
    )
  }

  return canvas.toDataURL('image/png')
}

/** 合成并触发浏览器下载。 */
export async function downloadSharePoster(
  options: SharePosterOptions,
  filename: string
): Promise<void> {
  const dataUrl = await composeSharePosterDataUrl(options)
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) throw new Error('poster encode failed')
  triggerBlobDownload(blob, filename)
}
