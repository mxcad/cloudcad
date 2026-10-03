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
    expect(results).toStrictEqual([
      { fileName: 'a.mxweb', token: 't1', url: '/share/t1', expiresAt: '2026-10-10', success: true },
      { fileName: 'b.mxweb', token: 't1', url: '/share/t1', expiresAt: '2026-10-10', success: true },
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
    expect(results[1]).toMatchObject({ fileName: 'b.mxweb', success: false, error: '创建失败，请重试' })
    expect(results[2].success).toBe(true)
  })
})
