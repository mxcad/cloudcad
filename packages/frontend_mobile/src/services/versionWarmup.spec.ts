/**
 * versionWarmup：历史版本预热轮询（H3，对齐 PC useVersionHistory 预热逻辑）。
 *
 * 回归点：
 * - 202（转换在途）→ 轮询间隔 2s 后重试，直到非 202（204=缓存已生成）才放行；
 * - 总超时 360s → 抛「准备超时」；
 * - 后端错误按 code 映射文案（UNAUTHORIZED/NOT_FOUND），其余透传 message；
 * - isCancelled 返回 true → 静默退出（不抛、不再请求）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../api-sdk', () => ({
  mxcadFileAccessControllerGetFilesDataFile: vi.fn(),
}))
vi.mock('../languages', () => ({ t: (s: string) => s }))

import { mxcadFileAccessControllerGetFilesDataFile } from '../api-sdk'
import { warmupHistoricalVersion } from './versionWarmup'

const mockGetFilesDataFile = mxcadFileAccessControllerGetFilesDataFile as ReturnType<typeof vi.fn>

function okResponse(status: number) {
  return {
    error: undefined,
    data: new ArrayBuffer(0),
    response: { status },
  }
}

describe('warmupHistoricalVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('首次即 204：一次请求后放行', async () => {
    mockGetFilesDataFile.mockResolvedValueOnce(okResponse(204))

    await warmupHistoricalVersion('files/202610/n1/a.mxweb', 3)

    expect(mockGetFilesDataFile).toHaveBeenCalledTimes(1)
    expect(mockGetFilesDataFile).toHaveBeenCalledWith({
      path: { path: 'files/202610/n1/a.mxweb' },
      query: { v: '3', warmup: '1' },
      parseAs: 'arrayBuffer',
    })
  })

  it('202 轮询：间隔 2s 重试，直到 204 才放行', async () => {
    mockGetFilesDataFile
      .mockResolvedValueOnce(okResponse(202))
      .mockResolvedValueOnce(okResponse(202))
      .mockResolvedValueOnce(okResponse(204))

    const p = warmupHistoricalVersion('p', 1)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(2000)
    await p

    expect(mockGetFilesDataFile).toHaveBeenCalledTimes(3)
  })

  it('200（已完成直接返回内容）同样放行，不再轮询', async () => {
    mockGetFilesDataFile.mockResolvedValueOnce(okResponse(200))

    await warmupHistoricalVersion('p', 2)

    expect(mockGetFilesDataFile).toHaveBeenCalledTimes(1)
  })

  it('持续 202 超过 360s：抛准备超时', async () => {
    mockGetFilesDataFile.mockResolvedValue(okResponse(202))

    const p = warmupHistoricalVersion('p', 1)
    const assertion = p.catch((e: Error) => e.message)
    // 360s 整判据是 >（非 >=）：t=360s 时仍会再排一个 2s 定时器，须推进过 362s 才触发超时
    await vi.advanceTimersByTimeAsync(363_000)
    await expect(assertion).resolves.toBe('历史版本文件准备超时，请稍后重试')
    expect(mockGetFilesDataFile.mock.calls.length).toBeGreaterThan(100)
  })

  it('后端错误 code=UNAUTHORIZED：映射登录文案', async () => {
    mockGetFilesDataFile.mockResolvedValueOnce({
      error: { code: 'UNAUTHORIZED' },
      data: undefined,
      response: { status: 401 },
    })

    await expect(warmupHistoricalVersion('p', 1)).rejects.toThrow('请登录后访问此文件')
  })

  it('后端错误 code=NOT_FOUND：映射不存在文案', async () => {
    mockGetFilesDataFile.mockResolvedValueOnce({
      error: { code: 'NOT_FOUND' },
      data: undefined,
      response: { status: 404 },
    })

    await expect(warmupHistoricalVersion('p', 1)).rejects.toThrow('文件不存在或已被删除')
  })

  it('其他后端错误：透传 message', async () => {
    mockGetFilesDataFile.mockResolvedValueOnce({
      error: new Error('quota exceeded'),
      data: undefined,
      response: { status: 400 },
    })

    await expect(warmupHistoricalVersion('p', 1)).rejects.toThrow('quota exceeded')
  })

  it('isCancelled 已为 true：不发请求直接退出', async () => {
    await warmupHistoricalVersion('p', 1, () => true)

    expect(mockGetFilesDataFile).not.toHaveBeenCalled()
  })

  it('轮询途中取消：静默退出（不抛错）', async () => {
    mockGetFilesDataFile.mockResolvedValue(okResponse(202))
    let cancelled = false
    const p = warmupHistoricalVersion('p', 1, () => cancelled)

    await vi.advanceTimersByTimeAsync(2000)
    cancelled = true
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toBeUndefined()
  })
})
