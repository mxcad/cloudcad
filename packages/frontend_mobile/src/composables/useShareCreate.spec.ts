/**
 * useShareCreate.createShares：批量分享创建（M-01，对齐 PC createBatchShares）。
 *
 * 回归点：
 * - 同一 expiresIn 逐文件透传（7d=604800；never 不传该字段）；
 * - 逐文件失败隔离：单文件报错/请求异常不中断其余文件创建；
 * - 后端报错 / 响应缺 token / 请求异常 → 该文件 success:false 且带 error。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useShareCreate } from './useShareCreate'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  shareControllerCreateShare: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (s: string) => s,
}))

import { shareControllerCreateShare } from '@cloudcad/api-sdk/sdk.gen'

const mockedCreate = shareControllerCreateShare as ReturnType<typeof vi.fn>

/** 后端返回相对 path，结果里的 url 必须前置当前 origin 才可直接复制/扫码 */
const origin = window.location.origin

describe('useShareCreate.createShares（批量分享）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('同一 expiresIn 逐文件透传（7d=604800）', async () => {
    mockedCreate.mockResolvedValue({
      data: { token: 't1', url: '/share/t1', expiresAt: '2026-10-10' },
      error: null,
    })
    const { createShares } = useShareCreate()
    const results = await createShares(
      [
        { fileId: 'f1', fileName: 'a.mxweb' },
        { fileId: 'f2', fileName: 'b.mxweb' },
      ],
      '7d',
      7
    )

    expect(mockedCreate).toHaveBeenCalledTimes(2)
    for (const call of mockedCreate.mock.calls) {
      expect(call[0].body.expiresIn).toBe(604800)
    }
    // 后端返回的是相对 path，结果里必须是可复制/可扫码的绝对 URL
    expect(results).toStrictEqual([
      { fileName: 'a.mxweb', token: 't1', url: `${origin}/share/t1`, expiresAt: '2026-10-10', success: true },
      { fileName: 'b.mxweb', token: 't1', url: `${origin}/share/t1`, expiresAt: '2026-10-10', success: true },
    ])
  })

  it('never 不传 expiresIn', async () => {
    mockedCreate.mockResolvedValue({
      data: { token: 't1', url: '/share/t1', expiresAt: null },
      error: null,
    })
    const { createShares } = useShareCreate()
    await createShares([{ fileId: 'f1', fileName: 'a.mxweb' }], 'never', 7)

    expect(mockedCreate.mock.calls[0][0].body).toStrictEqual({ fileId: 'f1' })
  })

  it('逐文件失败隔离：单文件后端报错不中断其余创建', async () => {
    mockedCreate
      .mockResolvedValueOnce({ data: { token: 't1', url: '/share/t1', expiresAt: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: 'quota exceeded' })
      .mockResolvedValueOnce({ data: { token: 't3', url: '/share/t3', expiresAt: null }, error: null })
    const { createShares } = useShareCreate()
    const results = await createShares(
      [
        { fileId: 'f1', fileName: 'a.mxweb' },
        { fileId: 'f2', fileName: 'b.mxweb' },
        { fileId: 'f3', fileName: 'c.mxweb' },
      ],
      'never',
      7
    )

    expect(mockedCreate).toHaveBeenCalledTimes(3)
    expect(results[0].success).toBe(true)
    expect(results[1]).toMatchObject({
      fileName: 'b.mxweb',
      success: false,
      error: 'quota exceeded',
      url: '',
    })
    expect(results[2].success).toBe(true)
  })

  it('响应缺 token → 该文件失败；请求异常 → 该文件失败且循环继续', async () => {
    mockedCreate
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ data: { token: 't3', url: '/share/t3', expiresAt: null }, error: null })
    const { createShares } = useShareCreate()
    const results = await createShares(
      [
        { fileId: 'f1', fileName: 'a.mxweb' },
        { fileId: 'f2', fileName: 'b.mxweb' },
        { fileId: 'f3', fileName: 'c.mxweb' },
      ],
      'never',
      7
    )

    expect(results[0]).toMatchObject({ fileName: 'a.mxweb', success: false, error: '创建分享链接失败' })
    // 请求异常透出原始错误文案（errMsg 单一出口），不再一律塌成笼统兜底
    expect(results[1]).toMatchObject({ fileName: 'b.mxweb', success: false, error: 'network down' })
    expect(results[2].success).toBe(true)
  })

  it('onProgress 每完成一个文件回调一次（done/total，对齐 PC 实时进度）', async () => {
    mockedCreate
      .mockResolvedValueOnce({ data: { token: 't1', url: '/share/t1', expiresAt: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: 'quota exceeded' })
      .mockResolvedValueOnce({ data: { token: 't3', url: '/share/t3', expiresAt: null }, error: null })
    const { createShares } = useShareCreate()
    const progress: Array<[number, number]> = []
    await createShares(
      [
        { fileId: 'f1', fileName: 'a.mxweb' },
        { fileId: 'f2', fileName: 'b.mxweb' },
        { fileId: 'f3', fileName: 'c.mxweb' },
      ],
      'never',
      7,
      (done, total) => progress.push([done, total])
    )

    // 失败项也算「已完成一个」，与 PC 的 batchResults.length 语义一致
    expect(progress).toStrictEqual([[1, 3], [2, 3], [3, 3]])
  })

  it('不传 onProgress 时行为不变；后端报错文案取后端 message 而非 [object Object]', async () => {
    mockedCreate.mockResolvedValueOnce({ data: null, error: { message: 'no quota left' } })
    const { createShares } = useShareCreate()
    const results = await createShares([{ fileId: 'f1', fileName: 'a.mxweb' }], 'never', 7)

    expect(results[0]).toMatchObject({ success: false, error: 'no quota left' })
  })
})
