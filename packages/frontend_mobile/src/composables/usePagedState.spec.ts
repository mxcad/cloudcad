import { describe, it, expect, vi } from 'vitest'
import { usePagedState, type PagedItems } from './usePagedState'

/** 构造一个返回固定分页数据的 fetcher */
function makeFetcher(
  pages: Array<PagedItems<string>>,
): (page: number) => Promise<PagedItems<string>> {
  return (page: number) => Promise.resolve(pages[page - 1] ?? { items: [], total: 0, totalPages: 1 })
}

describe('usePagedState', () => {
  it('初始状态：page=1、totalPages=1、total=0、未加载、无错误', () => {
    const s = usePagedState()
    expect(s.page.value).toBe(1)
    expect(s.totalPages.value).toBe(1)
    expect(s.total.value).toBe(0)
    expect(s.loading.value).toBe(false)
    expect(s.error.value).toBe('')
  })

  it('hasMore：page < totalPages 为 true，相等为 false', () => {
    const s = usePagedState()
    expect(s.hasMore.value).toBe(false) // 1 < 1
    s.totalPages.value = 5
    expect(s.hasMore.value).toBe(true) // 1 < 5
    s.page.value = 5
    expect(s.hasMore.value).toBe(false) // 5 < 5
  })

  it('loadMoreFailed：仅当有错误且 page>1 时为 true（首屏失败不算加载更多失败）', () => {
    const s = usePagedState()
    expect(s.loadMoreFailed.value).toBe(false) // 无错误
    s.error.value = 'boom'
    expect(s.loadMoreFailed.value).toBe(false) // page=1，首屏失败
    s.page.value = 2
    expect(s.loadMoreFailed.value).toBe(true) // 有错误且 page>1
    s.error.value = ''
    expect(s.loadMoreFailed.value).toBe(false) // 错误清除后复位
  })

  it('loadMore 守卫语义：page 到达 totalPages 后 hasMore 转 false，调用方据此停止翻页', () => {
    const s = usePagedState()
    s.totalPages.value = 3
    s.page.value = 2
    expect(s.hasMore.value).toBe(true)
    s.page.value = 3
    expect(s.hasMore.value).toBe(false)
  })

  it('load：首屏 fetcher 成功 → items 替换、total/totalPages 落值、loading 复位', async () => {
    const s = usePagedState<string>()
    await s.load(makeFetcher([{ items: ['a', 'b'], total: 2, totalPages: 1 }]))
    expect(s.items.value).toEqual(['a', 'b'])
    expect(s.total.value).toBe(2)
    expect(s.totalPages.value).toBe(1)
    expect(s.loading.value).toBe(false)
    expect(s.error.value).toBe('')
  })

  it('load：翻页（page>1）fetcher 成功 → items 追加而非替换', async () => {
    const s = usePagedState<string>()
    const fetcher = makeFetcher([
      { items: ['a', 'b'], total: 4, totalPages: 2 },
      { items: ['c', 'd'], total: 4, totalPages: 2 },
    ])
    await s.load(fetcher) // page=1 → items 替换为 ['a','b']
    s.page.value = 2
    await s.load(fetcher) // page=2 → items 追加为 ['a','b','c','d']
    expect(s.items.value).toEqual(['a', 'b', 'c', 'd'])
    expect(s.totalPages.value).toBe(2)
  })

  it('load：fetcher 抛错 → error 经 onError 注入（i18n 文案）、loading 复位', async () => {
    const s = usePagedState<string>({ onError: () => '加载失败' })
    const fetcher = () => Promise.reject(new Error('boom'))
    await s.load(fetcher)
    expect(s.error.value).toBe('加载失败')
    expect(s.loading.value).toBe(false)
  })

  it('load：未提供 onError 时兜底「加载失败」', async () => {
    const s = usePagedState<string>()
    await s.load(() => Promise.reject(new Error('boom')))
    expect(s.error.value).toBe('加载失败')
  })

  it('loadMore：到达末页不翻页、不触发 fetcher', () => {
    const s = usePagedState<string>()
    const fetcher = vi.fn(makeFetcher([{ items: [], total: 0, totalPages: 1 }]))
    s.totalPages.value = 1 // page=1 已到达末页
    s.loadMore(fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(s.page.value).toBe(1)
  })

  it('loadMore：hasMore 时 page 自增并触发 fetcher（按新页号）', async () => {
    const s = usePagedState<string>()
    const fetcher = vi.fn(makeFetcher([
      { items: ['a'], total: 2, totalPages: 2 },
      { items: ['b'], total: 2, totalPages: 2 },
    ]))
    s.totalPages.value = 2
    s.loadMore(fetcher)
    expect(s.page.value).toBe(2)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith(2))
  })

  it('retryLoadMore：不翻页，重载当前 page（loadMore 失败后重试）', async () => {
    const s = usePagedState<string>()
    const fetcher = vi.fn(makeFetcher([{ items: ['b'], total: 2, totalPages: 2 }]))
    s.page.value = 2
    s.retryLoadMore(fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith(2))
    expect(s.page.value).toBe(2) // 未自增
  })

  it('loadMore：当前页加载失败时不前进（前进会跳过失败页的数据）', async () => {
    const s = usePagedState<string>()
    const pages: Array<PagedItems<string>> = [
      { items: ['a'], total: 3, totalPages: 3 },
      { items: ['b'], total: 3, totalPages: 3 },
      { items: ['c'], total: 3, totalPages: 3 },
    ]
    const fetcher = vi.fn((page: number) =>
      page === 2
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(pages[page - 1] ?? { items: [], total: 0, totalPages: 1 })
    )
    s.totalPages.value = 3
    s.loadMore(fetcher) // page 1→2，加载失败
    await vi.waitFor(() => expect(s.loading.value).toBe(false))
    expect(s.error.value).toBe('加载失败')
    expect(s.loadMoreFailed.value).toBe(true)
    expect(s.page.value).toBe(2)

    // 失败未修复前滚动到底不再前进：否则 page 跳到 3，第 2 页 items 从未落库
    s.loadMore(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(s.page.value).toBe(2)
  })

  it('loadMore：retryLoadMore 成功后守卫解除，可继续翻页', async () => {
    const s = usePagedState<string>()
    const pages: Array<PagedItems<string>> = [
      { items: ['a'], total: 3, totalPages: 3 },
      { items: ['b'], total: 3, totalPages: 3 },
      { items: ['c'], total: 3, totalPages: 3 },
    ]
    let flaky = true
    const fetcher = vi.fn((page: number) => {
      if (page === 2 && flaky) return Promise.reject(new Error('boom'))
      return Promise.resolve(pages[page - 1] ?? { items: [], total: 0, totalPages: 1 })
    })

    await s.load(fetcher) // 首屏 page=1
    expect(s.items.value).toEqual(['a'])

    s.loadMore(fetcher) // page 1→2 失败
    await vi.waitFor(() => expect(s.loading.value).toBe(false))
    expect(s.loadMoreFailed.value).toBe(true)

    flaky = false
    s.retryLoadMore(fetcher) // 重试第 2 页成功
    await vi.waitFor(() => expect(s.loading.value).toBe(false))
    expect(s.error.value).toBe('')
    expect(s.loadMoreFailed.value).toBe(false)
    expect(s.items.value).toEqual(['a', 'b'])

    s.loadMore(fetcher) // 守卫解除后可前进到第 3 页
    expect(s.page.value).toBe(3)
    await vi.waitFor(() => expect(s.loading.value).toBe(false))
    expect(s.items.value).toEqual(['a', 'b', 'c'])
  })

  it('loadMore 在途时导航回第 1 页：迟到的翻页响应不得顶掉新列表', async () => {
    const s = usePagedState<string>()
    s.totalPages.value = 2

    // 第 2 页响应卡住，直到测试显式放行——模拟「翻页在途时用户点面包屑回父目录」
    let releasePage2!: () => void
    const page2 = new Promise<PagedItems<string>>((resolve) => {
      releasePage2 = () => resolve({ items: ['c'], total: 2, totalPages: 2 })
    })
    // 刻意不用 vi.fn 包延迟响应：vi.fn 返回的是另一个 promise，会比原始响应晚约 2 个微任务
    // resolve，「await page2 后断言」会读到旧值而假绿（已实测）
    const fetcher = (page: number): Promise<PagedItems<string>> =>
      page === 2
        ? page2
        : Promise.resolve<PagedItems<string>>({ items: ['a'], total: 2, totalPages: 2 })

    s.loadMore(fetcher)
    await Promise.resolve()

    s.resetToFirstPage()
    await s.load(fetcher)
    expect(s.page.value).toBe(1)
    expect(s.items.value).toEqual(['a'])
    expect(s.loading.value).toBe(false)

    releasePage2()
    await page2 // load 的续作先于本续作入队，故此处可断言迟到响应已被消费
    // 若迟到响应仍被合并，列表会变成 ['c']（旧 scope 的数据顶掉新 scope 的第 1 页）
    expect(s.items.value).toEqual(['a'])
    expect(s.page.value).toBe(1)
    expect(s.loading.value).toBe(false)
  })

  it('被取代的失败响应不写 error（旧 scope 的失败不污染新 scope 的重试条）', async () => {
    const s = usePagedState<string>()
    s.totalPages.value = 2

    let releasePage2!: () => void
    const page2 = new Promise<never>((_, reject) => {
      releasePage2 = () => reject(new Error('boom'))
    })
    const fetcher = (page: number): Promise<PagedItems<string>> =>
      page === 2
        ? (page2 as unknown as Promise<PagedItems<string>>)
        : Promise.resolve<PagedItems<string>>({ items: ['a'], total: 2, totalPages: 2 })

    s.loadMore(fetcher)
    await Promise.resolve()

    s.resetToFirstPage()
    await s.load(fetcher)
    expect(s.error.value).toBe('')
    expect(s.loadMoreFailed.value).toBe(false)

    releasePage2()
    await page2.catch(() => undefined)

    expect(s.error.value).toBe('')
    expect(s.loadMoreFailed.value).toBe(false)
    expect(s.items.value).toEqual(['a'])
  })

  it('resetToFirstPage：page 归 1（不触发加载，由调用方随后 load）', () => {
    const s = usePagedState<string>()
    s.page.value = 3
    s.resetToFirstPage()
    expect(s.page.value).toBe(1)
  })
})
