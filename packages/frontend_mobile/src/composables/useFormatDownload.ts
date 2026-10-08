import { ref } from 'vue'
import {
  showLoadingToast,
  closeToast,
  showSuccessToast,
  showFailToast,
} from 'vant'
import { t } from '@/languages'
import { cachedApiUrl } from '@/utils/apiConfig'
import { triggerBlobDownload, triggerUrlDownload } from '@/utils/download'
import { isCadFileName } from '@/utils/cadFile'
import { downloadControllerDownloadNodeWithFormat } from '@cloudcad/api-sdk/sdk.gen'
import { useBatchDownload } from '@/composables/useBatchDownload'
import type { DownloadFormatPayload } from '@/pages/shell/components/DownloadFormatPopup.vue'

export interface DownloadSelectionItem {
  id: string
  name: string
  isFolder?: boolean
}

/**
 * 格式转换下载状态机（单文件格式 + 批量格式 + 文件夹打包 + 多选下载路由）。
 *
 * FileBrowserPage（个人空间）与 ProjectDetailPage（项目）的文件节点操作层共用此状态机，
 * 二者逐字节一致，唯一差异是 zip 打包任务是否携带 projectId（项目空间带、个人空间不带）——
 * 由 `zipProjectId` 参数注入，避免两页各维护一份 ~120 行的下载路由 / 弹窗状态 / 任务创建逻辑。
 *
 * 暴露的 refs（showFormatPopup / formatTarget / formatDownloadMode / batchConvertCount /
 * showBatchPanel）供模板绑定 DownloadFormatPopup 与 BatchDownloadPanel；暴露的函数供
 * 多选下载（downloadSelection）与单条菜单（openFormatDownload / downloadFolder）调用。
 */
export function useFormatDownload(options: {
  /** zip 打包任务携带的 projectId（项目空间传 `() => projectId.value`；个人空间不传） */
  zipProjectId?: () => string | undefined
} = {}) {
  const { createZipTask, createFolderZipTask, createSingleFormatTask } =
    useBatchDownload()
  const showBatchPanel = ref(false)

  // ── 格式转换下载（底部弹窗选格式）──
  // 转换格式（dwg/dxf/pdf）走异步单文件任务队列（对齐 PC）：同步 download-with-format
  // 对慢转换会挂起至超时；mxweb/original 无转换开销，保持同步直下
  const showFormatPopup = ref(false)
  const formatTarget = ref<{ id: string; name: string } | null>(null)
  // 批量下载格式模式（多选含 CAD）：所选格式应用于全部选中图纸，zip 任务逐文件格式（对齐 PC 批量下载）
  const formatDownloadMode = ref<'single' | 'batch'>('single')
  const batchDownloadItems = ref<DownloadSelectionItem[]>([])
  // 批量下载弹窗计数=选中项总数（含文件夹）；文件夹内图纸由后端递归转换
  const batchConvertCount = ref(0)

  function openFormatDownload(target: { id: string; name: string }) {
    formatDownloadMode.value = 'single'
    formatTarget.value = target
    showFormatPopup.value = true
  }

  function openBatchFormatDownload(items: DownloadSelectionItem[]) {
    batchDownloadItems.value = items
    batchConvertCount.value = items.length
    formatDownloadMode.value = 'batch'
    showFormatPopup.value = true
  }

  async function onFormatDownloadConfirm(payload: DownloadFormatPayload) {
    if (formatDownloadMode.value === 'batch') {
      await confirmBatchFormatDownload(payload)
      return
    }
    const target = formatTarget.value
    if (!target) return

    if (payload.format !== 'mxweb') {
      showLoadingToast({ message: t('创建下载任务...'), forbidClick: true })
      try {
        await createSingleFormatTask(target.id, target.name, payload.format, {
          dwgVersion: payload.dwgOptions?.dwgVersion,
          width: payload.pdfOptions?.width,
          height: payload.pdfOptions?.height,
          colorPolicy: payload.pdfOptions?.colorPolicy,
        })
        closeToast()
        showSuccessToast(t('已加入下载队列'))
        showBatchPanel.value = true
      } catch (e) {
        closeToast()
        showFailToast(t('创建下载任务失败'))
      }
      return
    }

    showLoadingToast({ message: t('下载中...'), forbidClick: true })
    try {
      const res = await downloadControllerDownloadNodeWithFormat({
        path: { nodeId: target.id },
        query: { format: payload.format },
        parseAs: 'blob',
      } as never)
      closeToast()
      if (res.error) throw new Error(String(res.error))
      const blob = res.data as Blob
      const nameWithoutExt = target.name.replace(/\.[^.]+$/, '')
      const finalName = `${nameWithoutExt}.${payload.format}`
      triggerBlobDownload(blob, finalName)
      showSuccessToast(t('下载成功'))
    } catch (e) {
      closeToast()
      showFailToast(t('下载失败'))
    }
  }

  // 批量下载格式确认：所选格式应用于全部选中 CAD 图纸（zip 任务逐文件格式）；
  // 非 CAD 文件与文件夹保持原格式（文件夹按原样打包，移动端不做文件夹内逐文件转换）
  async function confirmBatchFormatDownload(payload: DownloadFormatPayload) {
    const items = batchDownloadItems.value
    const format = payload.format
    showLoadingToast({ message: t('正在创建打包任务...'), forbidClick: true })
    try {
      const fileList = items.map((i) => {
        // CAD 文件或文件夹都套用所选格式：文件夹的格式由后端 expandFolderItems 递归传播到内部文件
        //（对齐 PC 文件夹级格式）；顶层非 CAD 文件保持原格式（单个非图纸文件无转换意义）
        const apply = format !== 'mxweb' && (i.isFolder || isCadFileName(i.name))
        return {
          nodeId: i.id,
          fileName: i.name,
          isFolder: i.isFolder,
          formats: apply ? [format] : [],
          ...(apply && (format === 'dwg' || format === 'dxf')
            ? { dwgVersion: payload.dwgOptions?.dwgVersion }
            : {}),
          ...(apply && format === 'pdf'
            ? {
                width: payload.pdfOptions?.width,
                height: payload.pdfOptions?.height,
                colorPolicy: payload.pdfOptions?.colorPolicy,
              }
            : {}),
        }
      })
      await createZipTask(fileList, {
        name: t('下载'),
        ...(options.zipProjectId ? { projectId: options.zipProjectId() } : {}),
      })
      closeToast()
      showSuccessToast(t('打包任务已创建'))
      showBatchPanel.value = true
    } catch (e) {
      closeToast()
      showFailToast(t('打包任务创建失败'))
    }
  }

  async function downloadFolder(target: { id: string; name: string }) {
    showLoadingToast({ message: t('正在创建打包任务...'), forbidClick: true })
    try {
      await createFolderZipTask(target.id, { name: target.name })
      closeToast()
      showSuccessToast(t('打包任务已创建'))
      showBatchPanel.value = true
    } catch (e) {
      closeToast()
      showFailToast(t('打包任务创建失败'))
    }
  }

  // ── 多选「下载」（对齐 PC 批量下载）：单文件直接下（可靠），多项/含文件夹走 zip 任务队列 ──
  // 旧实现循环 <a> 点击触发多文件下载，浏览器会拦截后续下载（只下第一个），故收敛到任务队列
  async function downloadSelection(items: DownloadSelectionItem[]) {
    // 多选含 CAD 图纸或文件夹 → 弹格式选择（对齐 PC 批量下载）：
    // - 顶层 CAD 文件：所选格式直接转换；
    // - 文件夹：格式由后端 expandFolderItems 递归传播到内部文件（对齐 PC 文件夹级格式）；
    // - 顶层非 CAD 文件：保持原格式。
    // 单条目菜单的 CAD 下载同样可转格式，故多选下载也须支持，避免「单选能转、多选不能转」的不一致。
    const cadFiles = items.filter((i) => !i.isFolder && isCadFileName(i.name))
    const hasFolders = items.some((i) => i.isFolder)
    if (cadFiles.length > 0 || hasFolders) {
      // 单个 CAD 文件（无文件夹）：复用单文件格式流程（mxweb 原格式直下 / 转格式走异步任务）
      if (items.length === 1 && !items[0].isFolder) openFormatDownload(items[0])
      else openBatchFormatDownload(items)
      return
    }
    if (items.length === 1 && !items[0].isFolder) {
      triggerUrlDownload(
        cachedApiUrl(`/file-system/nodes/${items[0].id}/download`),
        items[0].name
      )
      showSuccessToast(t('开始下载 {count} 个文件', { count: '1' }))
      return
    }
    showLoadingToast({ message: t('正在创建打包任务...'), forbidClick: true })
    try {
      const fileList = items.map((i) => ({
        nodeId: i.id,
        fileName: i.name,
        isFolder: i.isFolder,
      }))
      await createZipTask(fileList, {
        name: t('下载'),
        ...(options.zipProjectId ? { projectId: options.zipProjectId() } : {}),
      })
      closeToast()
      showSuccessToast(t('打包任务已创建'))
      showBatchPanel.value = true
    } catch (e) {
      closeToast()
      showFailToast(t('打包任务创建失败'))
    }
  }

  return {
    showBatchPanel,
    showFormatPopup,
    formatTarget,
    formatDownloadMode,
    batchConvertCount,
    openFormatDownload,
    openBatchFormatDownload,
    onFormatDownloadConfirm,
    downloadFolder,
    downloadSelection,
  }
}
