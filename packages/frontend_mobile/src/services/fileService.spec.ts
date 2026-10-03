/**
 * fileService.downloadNodeOriginal：非 CAD 文件原格式直下（H1 出口）。
 *
 * 回归点：
 * - 成功：blob 经 triggerBlobDownload 落盘，文件名走 sanitizeFileName；
 * - SDK 返回非 Blob（ArrayBuffer 等）：包一层 Blob 再落盘；
 * - result.error：抛出（调用方弹失败提示），不落盘。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api-sdk', () => ({
  nodeControllerGetNode: vi.fn(),
  downloadControllerDownloadNode: vi.fn(),
}))
vi.mock('../utils/download', () => ({ triggerBlobDownload: vi.fn() }))
vi.mock('../utils/sanitizeFileName', () => ({ sanitizeFileName: vi.fn((n: string) => n) }))
vi.mock('../utils/apiConfig', () => ({ cachedApiUrl: vi.fn((p: string) => p) }))
vi.mock('../utils/mxwebUrl', () => ({ mxwebFilesDataPath: vi.fn((p: string) => p) }))

import { downloadControllerDownloadNode, nodeControllerGetNode } from '../api-sdk'
import { triggerBlobDownload } from '../utils/download'
import { downloadNodeOriginal, getNodeInfo } from './fileService'

const mockDownloadNode = downloadControllerDownloadNode as ReturnType<typeof vi.fn>
const mockTriggerBlobDownload = triggerBlobDownload as ReturnType<typeof vi.fn>

describe('downloadNodeOriginal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功：Blob 直接落盘，文件名经 sanitize', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    mockDownloadNode.mockResolvedValue({ error: undefined, data: blob })

    await downloadNodeOriginal('n1', 'photo.jpg')

    expect(mockDownloadNode).toHaveBeenCalledWith({ path: { nodeId: 'n1' }, parseAs: 'blob' })
    expect(mockTriggerBlobDownload).toHaveBeenCalledWith(blob, 'photo.jpg')
  })

  it('SDK 返回非 Blob（ArrayBuffer）：包 Blob 再落盘', async () => {
    const buf = new ArrayBuffer(8)
    mockDownloadNode.mockResolvedValue({ error: undefined, data: buf })

    await downloadNodeOriginal('n1', 'a.pdf')

    expect(mockTriggerBlobDownload).toHaveBeenCalledTimes(1)
    const [blob, name] = mockTriggerBlobDownload.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(name).toBe('a.pdf')
  })

  it('result.error：抛出且不落盘', async () => {
    mockDownloadNode.mockResolvedValue({ error: new Error('boom'), data: undefined })

    await expect(downloadNodeOriginal('n1', 'a.pdf')).rejects.toThrow('boom')
    expect(mockTriggerBlobDownload).not.toHaveBeenCalled()
  })
})

describe('getNodeInfo', () => {
  it('error 时抛出', async () => {
    const mockGetNode = nodeControllerGetNode as ReturnType<typeof vi.fn>
    mockGetNode.mockResolvedValueOnce({ error: new Error('nf'), data: undefined })

    await expect(getNodeInfo('n404')).rejects.toThrow('nf')
  })
})
