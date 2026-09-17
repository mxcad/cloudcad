///////////////////////////////////////////////////////////////////////////////
// 移动端图纸库/图块库节点操作服务
//
// 库是独立命名空间：所有节点操作走 libraryController*（不是 nodeController），
// 且库删除默认永久删除（无回收站，library.service.ts deleteNode permanently ?? true）。
// 下载分两条路：mxweb 走库公开下载端点（免登录，分享链接/CAD 编辑器也要能取文件），
// pdf/dwg/dxf 走真实转换端点（需登录 + LIBRARY_*_MANAGE 权限）。
// 对照 PC packages/frontend/src/hooks/library/useLibraryOperations.ts。
///////////////////////////////////////////////////////////////////////////////

import {
  libraryControllerRenameDrawingNode,
  libraryControllerRenameBlockNode,
  libraryControllerDeleteDrawingNode,
  libraryControllerDeleteBlockNode,
  libraryControllerBatchDeleteDrawingNodes,
  libraryControllerBatchDeleteBlockNodes,
  libraryControllerDownloadDrawingNode,
  libraryControllerDownloadBlockNode,
  downloadControllerDownloadNodeWithFormat,
} from '@cloudcad/api-sdk/sdk.gen'
import type { LibraryType } from '@/composables/useLibrary'
import { t } from '@/languages'
import { showLoadingToast, showSuccessToast, showFailToast, closeToast } from 'vant'

export type LibraryDownloadFormat = 'mxweb' | 'pdf' | 'dwg' | 'dxf'

export interface BatchDeleteResult {
  successCount: number
  failedCount: number
}

/**
 * 库文件直链的缓存破坏时间戳：取节点 updatedAt（服务端内容的稳定标识）。
 * 用 Date.now() 会让每次点击都生成新缓存键，同一文件重复插入永不命中缓存。
 */
export function buildCacheTimestamp(updatedAt?: string | null): number {
  if (!updatedAt) return Date.now()
  const ms = new Date(updatedAt).getTime()
  return Number.isNaN(ms) ? Date.now() : ms
}

/** 拼接库文件直链（filesData 为公开端点，?t= 用于绕过浏览器/CDN 缓存） */
export function buildLibraryFileUrl(
  libraryType: LibraryType,
  filePath: string,
  updatedAt?: string | null,
): string {
  if (!filePath) return ''
  return `/api/v1/library/${libraryType}/filesData/${filePath}?t=${buildCacheTimestamp(updatedAt)}`
}

/** 重命名库节点（PATCH /api/v1/library/{type}/nodes/{nodeId}） */
export async function renameLibraryNode(
  libraryType: LibraryType,
  nodeId: string,
  newName: string,
): Promise<boolean> {
  const fn = libraryType === 'drawing'
    ? libraryControllerRenameDrawingNode
    : libraryControllerRenameBlockNode
  showLoadingToast({ message: t('重命名中...'), forbidClick: true })
  try {
    const res = await fn({ path: { nodeId }, body: { name: newName } })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(t('重命名成功'))
    return true
  } catch (e) {
    closeToast()
    console.error('[LibraryOps] rename failed:', e)
    showFailToast(t('重命名失败'))
    return false
  }
}

/**
 * 删除单个库节点。库无回收站，永久删除不可恢复。
 */
export async function deleteLibraryNode(
  libraryType: LibraryType,
  nodeId: string,
): Promise<boolean> {
  const fn = libraryType === 'drawing'
    ? libraryControllerDeleteDrawingNode
    : libraryControllerDeleteBlockNode
  showLoadingToast({ message: t('删除中...'), forbidClick: true })
  try {
    const res = await fn({ path: { nodeId }, query: { permanently: true } })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    showSuccessToast(t('删除成功'))
    return true
  } catch (e) {
    closeToast()
    console.error('[LibraryOps] delete failed:', e)
    showFailToast(t('删除失败'))
    return false
  }
}

/**
 * 批量删除库节点。返回成功/失败计数（部分失败时由调用方提示，避免误报全成）。
 */
export async function batchDeleteLibraryNodes(
  libraryType: LibraryType,
  nodeIds: string[],
): Promise<BatchDeleteResult | null> {
  const fn = libraryType === 'drawing'
    ? libraryControllerBatchDeleteDrawingNodes
    : libraryControllerBatchDeleteBlockNodes
  showLoadingToast({ message: t('删除中...'), forbidClick: true })
  try {
    const res = await fn({ body: { nodeIds, permanently: true } })
    closeToast()
    if (res.error) throw new Error(String(res.error))
    const raw = res.data as BatchDeleteResult | undefined
    return {
      successCount: raw?.successCount ?? nodeIds.length,
      failedCount: raw?.failedCount ?? 0,
    }
  } catch (e) {
    closeToast()
    console.error('[LibraryOps] batch delete failed:', e)
    showFailToast(t('删除失败'))
    return null
  }
}

/**
 * 下载库节点。
 * - mxweb：库公开下载端点，免转换、免 VIP 门控
 * - pdf/dwg/dxf：真实转换端点，受配额与权限限制
 * @param silent true 时不弹 toast（批量下载由调用方统一提示进度），返回成功与否
 */
export async function downloadLibraryNode(
  libraryType: LibraryType,
  nodeId: string,
  nodeName: string,
  format: LibraryDownloadFormat,
  query?: Record<string, unknown>,
  silent = false,
): Promise<boolean> {
  if (!silent) showLoadingToast({ message: t('正在下载...'), forbidClick: true })
  try {
    let blob: Blob | undefined
    if (format === 'mxweb') {
      const fn = libraryType === 'drawing'
        ? libraryControllerDownloadDrawingNode
        : libraryControllerDownloadBlockNode
      const res = await fn({ path: { nodeId }, parseAs: 'blob' })
      if (res.error) throw new Error(String(res.error))
      blob = res.data as Blob | undefined
    } else {
      const res = await downloadControllerDownloadNodeWithFormat({
        path: { nodeId },
        query,
        parseAs: 'blob',
      } as never)
      if (res.error) throw new Error(String(res.error))
      blob = res.data as Blob | undefined
    }
    if (!silent) closeToast()
    if (!blob || blob.size === 0) {
      if (!silent) showFailToast(t('下载失败'))
      return false
    }
    const nameWithoutExt = nodeName.replace(/\.[^.]+$/, '')
    triggerBlobDownload(blob, `${nameWithoutExt}.${format}`)
    if (!silent) showSuccessToast(t('下载成功'))
    return true
  } catch (e) {
    if (!silent) closeToast()
    console.error('[LibraryOps] download failed:', e)
    if (!silent) showFailToast(t('下载失败'))
    return false
  }
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
