import { useEditorStore } from '@/stores/editor'
import { t } from '@/languages'
import { openDrawing } from './drawingOpener'
import {
  generateThumbnail,
  generatePosterImageBlob,
  uploadThumbnailBlobForNode,
  detectRegionBorder,
  type ThumbnailRegion,
} from './thumbnailService'

/**
 * 后台渲染缩略图（分享管理页路径 B，移动端）
 *
 * 移动端 Shell 的 Home（编辑器根）恒挂载在底层，WebGL 引擎常驻；子页（分享管理）
 * 以 router-view + page-slide 覆盖其上。因此「CAD 编辑器始终在底层」在移动端是结构
 * 保证，只需在底层引擎打开目标 mxweb 后出图即可。
 *
 * 安全约束（防止静默替换引擎文档造成数据丢失）：
 *  - 编辑器有未保存改动（isModified）→ 拒绝
 *  - 正在协同（isInCollaboration）→ 拒绝
 *
 * @param nodeId 云端节点 ID
 * @returns 缩略图 Blob（已上传后端供复用），失败返回 null
 */
export async function renderShareThumbnailInBackground(
  nodeId: string,
): Promise<Blob | null> {
  const { state } = useEditorStore()
  if (state.isModified) {
    throw new Error(t('当前图纸有未保存的修改，请先保存后再生成分享图片'))
  }
  if (state.isInCollaboration) {
    throw new Error(t('协同编辑进行中，暂不能生成分享图片'))
  }

  // 打开目标文件到底层引擎（drawingOpener 承载节点信息获取、URL 构造、openMxWeb）
  const opened = await openDrawing({ source: 'node', nodeId })
  if (!opened) {
    throw new Error(t('打开图纸失败，无法生成分享图片'))
  }

  // 出图并上传（供后台复用）
  const blob = await generateThumbnail()
  if (!blob) {
    throw new Error(t('缩略图生成失败，请重试'))
  }
  await uploadThumbnailBlobForNode(nodeId, blob)
  return blob
}

/**
 * 分享图片（海报）生成结果：高清 BMP 图纸图 + 是否与图纸直角方形边框重合。
 * 对齐 PC resolvePosterThumbnail 的返回形状（thumbnail + hasBorder）。
 */
export interface SharePosterRenderResult {
  /** 海报图纸图 BMP Blob（长边 POSTER_RENDER_SIZE=1000，清晰度远高于 200px 缩略图） */
  posterBlob: Blob
  /** 框选区域是否与图纸直角方形边框重合（海报据此省略圆角描边） */
  hasBorder: boolean
}

/**
 * 后台渲染分享图片（海报）—— 高清 BMP 版本（分享管理页「分享图片」，对齐 PC 编辑器上下文）。
 *
 * 与 renderShareThumbnailInBackground（200px PNG 缩略图）不同，海报图纸图用引擎矢量渲染的
 * 高分辨率 BMP（用户参考 Mx_ScreenToBmp：type "image/bmp" + 宽 1000），清晰度远高于屏幕像素
 * 截图。缩略图生成与上传与海报截图解耦：本函数 best-effort 顺带生成并上传 200px 缩略图
 * （文件列表/后台渲染复用），失败不阻塞海报（对齐 PC 注释：缩略图上传由独立机制负责）。
 *
 * 安全约束（防静默替换引擎文档造成数据丢失）：编辑器有未保存改动/正在协同时**抛错**——
 * 调用方必须提示用户，不能静默回退（回退会让用户误以为生成成功，实际什么都没生成）。
 * 引擎打开/出图失败**返回 null**——调用方可回退到后端已有缩略图（低清兜底）。
 * 有 region 时先 detectRegionBorder（须在 zoomW 前，容差以框选时视图为准）。
 *
 * @param nodeId 云端节点 ID
 * @param region 指定区域（CAD 坐标包围盒）；不传截取整图包围盒
 * @returns 海报 BMP + hasBorder；打开失败/出图失败返回 null
 */
export async function renderSharePosterInBackground(
  nodeId: string,
  region?: ThumbnailRegion | null,
): Promise<SharePosterRenderResult | null> {
  const { state } = useEditorStore()
  if (state.isModified) {
    throw new Error(t('当前图纸有未保存的修改，请先保存后再生成分享图片'))
  }
  if (state.isInCollaboration) {
    throw new Error(t('协同编辑进行中，暂不能生成分享图片'))
  }

  // 对齐 PC 编辑器上下文（isEditorContext = 分享文件 === 当前打开图纸）：目标文件已是
  // 当前打开图纸时不再后台开图。后台开图会走 openDrawing → loadByNodeId → fetchFileNode
  // （nodeControllerGetNode，需登录/权限），正是「预览分享图片需要登录」的根因；且会静默
  // 重载当前文档。仅当文件未打开时才 openDrawing（分享管理页非当前图纸的兜底路径）。
  if (state.fileId !== nodeId) {
    const opened = await openDrawing({ source: 'node', nodeId })
    if (!opened) {
      return null
    }
  }

  // 边框检测须在任意 zoom（generatePosterImageBlob 会 zoomW 到区域）之前执行：
  // 共线容差是「屏幕 5px 换算的 CAD 长度」，以框选时的视图为准，缩放后容差失真。
  // 有 region（用户框选）→ 按四边算法判定；无 region（默认整图框）→ 整图框天然不需要
  // 描边，恒 hasBorder=true（不描边），不走算法（对齐 PC generatePosterImage 统一逻辑）。
  const hasBorder = region ? await detectRegionBorder(region) : true

  // 缩略图（200px PNG）生成与上传分离：best-effort 不阻塞海报（文件列表/后台渲染复用）
  const thumbBlob = await generateThumbnail(region)
  if (thumbBlob) await uploadThumbnailBlobForNode(nodeId, thumbBlob)

  // 海报图纸图用引擎高分辨率 BMP（清晰度远高于 200px 缩略图）
  const posterBlob = await generatePosterImageBlob(region)
  if (!posterBlob) {
    return null
  }
  return { posterBlob, hasBorder }
}
