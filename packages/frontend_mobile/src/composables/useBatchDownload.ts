/**
 * 批量下载任务（A-07）—— 移动端任务体系 composable。
 *
 * 对齐 PC useBatchDownload 的核心能力（zip 打包 / 进度 / 取消 / 重试），
 * 移动端简化为：任务列表 + 轮询进度（无 SSE）。
 *
 * 数据源：
 * - batchDownloadControllerGetUserTasks（任务列表，page/pageSize 为字符串）
 * - batchDownloadControllerCreateTask（创建 zip 任务）
 * - batchDownloadControllerGetFolderFiles（文件夹递归展开，A-08）
 * - batchDownloadControllerCancelTask / RetryTask / RetryFailedItems
 *
 * zip 下载走锚点：/api/v1/file-system/batch-download/{taskId}/download
 */
import { ref, onUnmounted } from 'vue'
import {
  batchDownloadControllerCreateTask,
  batchDownloadControllerCreateSingleFileTask,
  batchDownloadControllerGetUserTasks,
  batchDownloadControllerGetFolderFiles,
  batchDownloadControllerCancelTask,
  batchDownloadControllerRetryTask,
  batchDownloadControllerRetryFailedItems,
} from '@cloudcad/api-sdk/sdk.gen'
import type { BatchDownloadTaskDto } from '@cloudcad/api-sdk/types.gen'
import { cachedApiUrl } from '@/utils/apiConfig'

export interface BatchTaskItem extends BatchDownloadTaskDto {
  /** 展示名（文件夹名 / 首个文件名），由创建方传入 */
  name?: string
}

/** 文件夹递归树节点（getFolderFilesRecursive 返回形状） */
interface FolderTreeNode {
  nodeId: string
  fileName: string
  isFolder: boolean
  children?: FolderTreeNode[]
}

/** 文件夹树 → 扁平文件列表（relativePath 由嵌套目录名拼接） */
function flattenFolderTree(
  node: FolderTreeNode,
  parentPath: string[] = []
): Array<{ nodeId: string; fileName: string; relativePath?: string }> {
  if (!node.isFolder) {
    return [{ nodeId: node.nodeId, fileName: node.fileName, relativePath: parentPath.join('/') || undefined }]
  }
  const items: Array<{ nodeId: string; fileName: string; relativePath?: string }> = []
  for (const child of node.children ?? []) {
    items.push(...flattenFolderTree(child, [...parentPath, node.fileName]))
  }
  return items
}

export function useBatchDownload() {
  const tasks = ref<BatchTaskItem[]>([])
  const loading = ref(false)

  async function loadTasks() {
    loading.value = true
    try {
      const res = await batchDownloadControllerGetUserTasks({
        query: { page: '1', pageSize: '20' },
      })
      if (res.error) return
      const data = (res.data ?? {}) as { tasks?: BatchDownloadTaskDto[] }
      tasks.value = (data.tasks ?? []).map((t) => ({ ...t }))
    } catch {
      // 加载失败静默（面板展示空态）
    } finally {
      loading.value = false
    }
  }

  /** 创建 zip 任务（A-07/A-08 共用；多选下载传 isFolder 让后端展开文件夹，对齐 PC 批量下载） */
  async function createZipTask(
    fileList: Array<{ nodeId: string; fileName: string; relativePath?: string; isFolder?: boolean }>,
    opts: { projectId?: string; name?: string } = {}
  ) {
    const res = await batchDownloadControllerCreateTask({
      body: {
        fileList: fileList.map((f) => ({
          nodeId: f.nodeId,
          fileName: f.fileName,
          formats: [] as string[],
          ...(f.relativePath ? { relativePath: f.relativePath } : {}),
          ...(f.isFolder ? { isFolder: true } : {}),
        })),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
        mode: 'zip',
      },
    } as never)
    if (res.error) throw new Error(String(res.error))
    // 本地记录展示名（服务端任务 DTO 不含 name）
    if (opts.name) {
      const created = (res.data ?? {}) as { taskId?: string }
      if (created.taskId) {
        tasks.value = tasks.value.map((t) => (t.taskId === created.taskId ? { ...t, name: opts.name } : t))
      }
    }
    await loadTasks()
  }

  /** 文件夹下载（A-08）：递归展开 → zip 任务 */
  async function createFolderZipTask(
    nodeId: string,
    opts: { projectId?: string; name?: string } = {}
  ) {
    const res = await batchDownloadControllerGetFolderFiles({ path: { nodeId } } as never)
    if (res.error) throw new Error(String(res.error))
    const tree = res.data as FolderTreeNode
    const files = flattenFolderTree(tree)
    if (files.length === 0) throw new Error('empty')
    await createZipTask(files, opts)
  }

  /**
   * 单文件格式转换下载任务（dwg/dxf/pdf 走异步队列，对齐 PC createSingleFormatTask）。
   *
   * 同步 download-with-format 对慢转换会挂起至超时（PC 因此把转换格式全走异步）：
   * 后端内核复用批量任务表（mode='individual' 单项），HTTP 立即返回 taskId，
   * 转换完成后由任务面板的单项下载（items/0/download）取产物。返回 taskId，失败抛错。
   */
  async function createSingleFormatTask(
    nodeId: string,
    fileName: string,
    format: string,
    opts: {
      dwgVersion?: number
      width?: string
      height?: string
      colorPolicy?: string
      projectId?: string
    } = {}
  ): Promise<string> {
    const res = await batchDownloadControllerCreateSingleFileTask({
      body: {
        nodeId,
        fileName,
        format,
        ...(opts.dwgVersion ? { dwgVersion: opts.dwgVersion } : {}),
        ...(opts.width ? { width: opts.width } : {}),
        ...(opts.height ? { height: opts.height } : {}),
        ...(opts.colorPolicy ? { colorPolicy: opts.colorPolicy } : {}),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
      },
    } as never)
    if (res.error) throw new Error(String(res.error))
    const data = (res.data ?? {}) as { taskId?: string }
    const taskId = data.taskId
    if (taskId) {
      // 本地记录展示名（服务端任务 DTO 不含 name），与 zip 任务同口径
      tasks.value = tasks.value.map((t) => (t.taskId === taskId ? { ...t, name: fileName } : t))
    }
    await loadTasks()
    return taskId ?? ''
  }

  /** zip 完成下载（锚点） */
  function downloadZip(taskId: string) {
    const a = document.createElement('a')
    a.href = cachedApiUrl(`/file-system/batch-download/${taskId}/download`)
    a.download = ''
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  /** individual 任务单项产物下载（锚点）：单文件任务只有 1 项，固定 items/0/download */
  function downloadSingleFileItem(taskId: string) {
    const a = document.createElement('a')
    a.href = cachedApiUrl(`/file-system/batch-download/${taskId}/items/0/download`)
    a.download = ''
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function cancelTask(taskId: string) {
    try {
      await batchDownloadControllerCancelTask({ path: { taskId } } as never)
      await loadTasks()
    } catch {
      /* 失败由调用方 toast 兜底 */
    }
  }

  async function retryTask(taskId: string) {
    try {
      await batchDownloadControllerRetryTask({ path: { taskId } } as never)
      await loadTasks()
    } catch {
      /* 同上 */
    }
  }

  async function retryFailedItems(taskId: string) {
    try {
      await batchDownloadControllerRetryFailedItems({ path: { taskId } } as never)
      await loadTasks()
    } catch {
      /* 同上 */
    }
  }

  // 面板打开期间轮询进度（移动端无 SSE，3s 轮询）
  let timer: ReturnType<typeof setInterval> | null = null
  function startPolling() {
    stopPolling()
    timer = setInterval(() => {
      void loadTasks()
    }, 3000)
  }
  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  onUnmounted(stopPolling)

  return {
    tasks,
    loading,
    loadTasks,
    createZipTask,
    createFolderZipTask,
    createSingleFormatTask,
    downloadZip,
    downloadSingleFileItem,
    cancelTask,
    retryTask,
    retryFailedItems,
    startPolling,
    stopPolling,
  }
}
