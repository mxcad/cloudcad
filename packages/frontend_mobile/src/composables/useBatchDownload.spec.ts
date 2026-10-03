/**
 * useBatchDownload.createZipTask：多选「下载」走 zip 任务队列（对齐 PC 批量下载）。
 *
 * 回归点（修浏览器拦截多文件 <a> 下载的 bug）：
 * - 文件夹项传 isFolder:true（后端展开），文件项不传；
 * - mode='zip'、formats=[]（原格式）；
 * - 后端报错时抛错（调用方 toast 兜底）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBatchDownload } from './useBatchDownload'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  batchDownloadControllerCreateTask: vi.fn(),
  batchDownloadControllerCreateSingleFileTask: vi.fn(),
  batchDownloadControllerGetUserTasks: vi.fn(),
  batchDownloadControllerGetFolderFiles: vi.fn(),
  batchDownloadControllerCancelTask: vi.fn(),
  batchDownloadControllerRetryTask: vi.fn(),
  batchDownloadControllerRetryFailedItems: vi.fn(),
}))
vi.mock('@/utils/apiConfig', () => ({
  cachedApiUrl: (p: string) => `http://test${p}`,
}))

import {
  batchDownloadControllerCreateTask,
  batchDownloadControllerGetUserTasks,
} from '@cloudcad/api-sdk/sdk.gen'

const mockedCreate = batchDownloadControllerCreateTask as ReturnType<typeof vi.fn>
const mockedGetTasks = batchDownloadControllerGetUserTasks as ReturnType<typeof vi.fn>

describe('useBatchDownload.createZipTask（多选下载）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetTasks.mockResolvedValue({ data: { tasks: [] }, error: null })
  })

  it('文件夹项传 isFolder:true，文件项不传；mode=zip、formats=[]', async () => {
    mockedCreate.mockResolvedValue({ data: { taskId: 'task-1' }, error: null })
    const { createZipTask } = useBatchDownload()
    await createZipTask(
      [
        { nodeId: 'f1', fileName: 'a.mxweb' },
        { nodeId: 'd1', fileName: '图纸目录', isFolder: true },
      ],
      { name: 'a.mxweb' },
    )

    expect(mockedCreate).toHaveBeenCalledTimes(1)
    const body = mockedCreate.mock.calls[0][0].body
    expect(body.mode).toBe('zip')
    expect(body.fileList).toStrictEqual([
      { nodeId: 'f1', fileName: 'a.mxweb', formats: [] },
      { nodeId: 'd1', fileName: '图纸目录', formats: [], isFolder: true },
    ])
  })

  it('逐文件格式+选项透传（多选含 CAD 转格式）：CAD 项带 formats/选项，非 CAD 项 formats=[]', async () => {
    mockedCreate.mockResolvedValue({ data: { taskId: 'task-3' }, error: null })
    const { createZipTask } = useBatchDownload()
    await createZipTask(
      [
        // CAD 图纸转 PDF（带 PDF 选项）
        { nodeId: 'c1', fileName: 'a.dwg', formats: ['pdf'], width: '2000', height: '2000', colorPolicy: 'mono' },
        // CAD 图纸转 DWG（带 dwgVersion）
        { nodeId: 'c2', fileName: 'b.dwg', formats: ['dwg'], dwgVersion: 27 },
        // 非 CAD 文件：原格式
        { nodeId: 'n1', fileName: 'readme.txt' },
        // 文件夹：原格式打包
        { nodeId: 'd1', fileName: '图纸目录', isFolder: true },
      ],
      { name: '下载' },
    )

    const body = mockedCreate.mock.calls[0][0].body
    expect(body.fileList).toStrictEqual([
      { nodeId: 'c1', fileName: 'a.dwg', formats: ['pdf'], width: '2000', height: '2000', colorPolicy: 'mono' },
      { nodeId: 'c2', fileName: 'b.dwg', formats: ['dwg'], dwgVersion: 27 },
      { nodeId: 'n1', fileName: 'readme.txt', formats: [] },
      { nodeId: 'd1', fileName: '图纸目录', formats: [], isFolder: true },
    ])
  })

  it('传 projectId 时透传给后端', async () => {
    mockedCreate.mockResolvedValue({ data: { taskId: 'task-2' }, error: null })
    const { createZipTask } = useBatchDownload()
    await createZipTask([{ nodeId: 'f1', fileName: 'a.mxweb' }], { name: 'a.mxweb', projectId: 'prj-1' })

    const body = mockedCreate.mock.calls[0][0].body
    expect(body.projectId).toBe('prj-1')
  })

  it('后端报错时抛错（调用方 toast 兜底）', async () => {
    mockedCreate.mockResolvedValue({ data: null, error: 'quota exceeded' })
    const { createZipTask } = useBatchDownload()
    await expect(
      createZipTask([{ nodeId: 'f1', fileName: 'a.mxweb' }], { name: 'a.mxweb' }),
    ).rejects.toThrow('quota exceeded')
  })
})
