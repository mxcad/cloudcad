/**
 * useNodeDownload：单文件原格式直下（H1 出口）的提示编排。
 *
 * 回归点：
 * - 成功：loading→close→「下载成功」，返回 true；
 * - 失败（Error 带 message）：后端文案透传，不吞成通用「下载失败」，返回 false；
 * - 失败（非 Error）：兜底「下载失败」文案。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/fileService', () => ({
  downloadNodeOriginal: vi.fn(),
}))
vi.mock('vant', () => ({
  showLoadingToast: vi.fn(),
  closeToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showFailToast: vi.fn(),
}))

import { downloadNodeOriginal } from '@/services/fileService'
import { showLoadingToast, closeToast, showSuccessToast, showFailToast } from 'vant'
import { useNodeDownload } from './useNodeDownload'

const mockDownloadOriginal = downloadNodeOriginal as ReturnType<typeof vi.fn>
const mockShowLoadingToast = showLoadingToast as ReturnType<typeof vi.fn>
const mockCloseToast = closeToast as ReturnType<typeof vi.fn>
const mockShowSuccessToast = showSuccessToast as ReturnType<typeof vi.fn>
const mockShowFailToast = showFailToast as ReturnType<typeof vi.fn>

describe('useNodeDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功：loading→close→下载成功，返回 true', async () => {
    mockDownloadOriginal.mockResolvedValue(undefined)

    const { downloadOriginal } = useNodeDownload()
    const ok = await downloadOriginal('n1', 'photo.jpg')

    expect(ok).toBe(true)
    expect(mockShowLoadingToast).toHaveBeenCalledTimes(1)
    expect(mockCloseToast).toHaveBeenCalledTimes(1)
    expect(mockShowSuccessToast).toHaveBeenCalledTimes(1)
    expect(mockShowFailToast).not.toHaveBeenCalled()
  })

  it('失败（Error 带 message）：后端文案透传，返回 false', async () => {
    mockDownloadOriginal.mockRejectedValue(new Error('文件不存在'))

    const { downloadOriginal } = useNodeDownload()
    const ok = await downloadOriginal('n1', 'a.pdf')

    expect(ok).toBe(false)
    expect(mockShowFailToast).toHaveBeenCalledTimes(1)
    expect(String(mockShowFailToast.mock.calls[0][0])).toContain('文件不存在')
    expect(mockShowSuccessToast).not.toHaveBeenCalled()
  })

  it('失败（非 Error）：兜底「下载失败」文案', async () => {
    mockDownloadOriginal.mockRejectedValue('unknown')

    const { downloadOriginal } = useNodeDownload()
    const ok = await downloadOriginal('n1', 'a.pdf')

    expect(ok).toBe(false)
    expect(mockShowFailToast).toHaveBeenCalledTimes(1)
    expect(mockShowSuccessToast).not.toHaveBeenCalled()
  })
})
