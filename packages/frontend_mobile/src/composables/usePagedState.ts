import { ref, computed, type Ref, type ComputedRef } from 'vue'

/** 分页 fetcher 返回的数据形态（各 composable 的 fetch 统一归约到此） */
export interface PagedItems<T> {
  items: T[]
  total: number
  totalPages: number
}

/**
 * 分页深模块：状态 + 派生 + 「加载仪式」+ 竞态守卫，单一出口。
 *
 * 收敛范围（相对旧 state-only 版）：
 *   - items 列表归此持有（首屏替换 / 翻页追加的合并逻辑在此，消费方不再各自写
 *     `page===1 ? replace : append`）；
 *   - load(fetcher) 统一 loading/error 仪式（true→''→try→catch→finally false）；
 *   - 竞态守卫：loadMore 受 loading / 当前页失败 / hasMore 三重守卫（防双击，
 *     也防「失败页被翻页跳过」）；load 不做重入拒绝（刷新/切 scope 总是重查，
 *     对齐原语义），但被取代的响应会被整条丢弃——合并决策按「发起时的页号」而非
 *     响应回来时的 page.value，否则翻页在途时导航回第 1 页，迟到的旧页响应会顶掉
 *     新列表（且带旧 scope 的数据混入新 scope）；
 *   - 错误文案经 onError 回调注入 i18n（本 composable 不依赖语言包）。
 *
 * fetcher 以 page 为入参（不直接读这里的响应式引用），故与「fetch 读取分页状态」
 * 不构成循环依赖：消费方把自身特有状态（scope/search/sort 等）闭包进 fetcher，
 * 翻页号由本模块按发起时的 page 传入。7 个调用方共用，消除逐字重复的
 * loading/error 仪式与首屏/翻页合并逻辑。
 */
export interface PagedState<T> {
  items: Ref<T[]>
  page: Ref<number>
  totalPages: Ref<number>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<string>
  hasMore: ComputedRef<boolean>
  /** 加载更多（page>1）失败：已加载列表保留、底部出重试条（首屏失败不算） */
  loadMoreFailed: ComputedRef<boolean>
  /** 执行一次分页加载（含 loading/error 仪式 + 首屏替换/翻页追加；不拒绝重入，被取代的响应整条丢弃） */
  load: (fetcher: (page: number) => Promise<PagedItems<T>>) => Promise<void>
  /** 翻下一页（loading / 当前页失败 / hasMore 三重守卫） */
  loadMore: (fetcher: (page: number) => Promise<PagedItems<T>>) => void
  /** 重试当前页（loadMore 失败后；不翻页，重载当前 page） */
  retryLoadMore: (fetcher: (page: number) => Promise<PagedItems<T>>) => void
  /** 回第 1 页（不触发加载，由调用方随后 load） */
  resetToFirstPage: () => void
}

export function usePagedState<T>(
  opts?: { onError?: (e: unknown) => string },
): PagedState<T> {
  const items = ref<T[]>([]) as Ref<T[]>
  const page = ref(1)
  const totalPages = ref(1)
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  const hasMore = computed(() => page.value < totalPages.value)
  const loadMoreFailed = computed(() => error.value !== '' && page.value > 1)

  // 代际计数防竞态：loadMore 在途时导航回第 1 页，迟到的旧页响应带着旧 scope 的数据回来；
  // 若不丢弃，它会按「响应回来时的 page.value」被合并、顶掉新列表（同仓 useClipboardPaste 的 gen 模式）。
  let generation = 0

  async function load(fetcher: (page: number) => Promise<PagedItems<T>>) {
    loading.value = true
    error.value = ''
    const thisPage = page.value
    const myGen = ++generation
    try {
      const { items: newItems, total: t, totalPages: tp } = await fetcher(thisPage)
      if (myGen !== generation) return
      items.value = thisPage === 1 ? newItems : [...items.value, ...newItems]
      total.value = t
      totalPages.value = tp
    } catch (e) {
      if (myGen !== generation) return
      error.value = opts?.onError?.(e) ?? '加载失败'
    } finally {
      // 只有最新一次负责清 loading：被取代的 load 早退时若清掉，会让仍在飞行中的那次失去指示
      if (myGen === generation) loading.value = false
    }
  }

  function loadMore(fetcher: (page: number) => Promise<PagedItems<T>>) {
    // loadMoreFailed 守卫：失败页未加载成功前不前进——前进会让 page 跳到下一页，
    // 而失败那一页的 items 从未落库，等于静默丢一整页数据。
    if (loading.value || loadMoreFailed.value || page.value >= totalPages.value) return
    page.value++
    void load(fetcher)
  }

  function retryLoadMore(fetcher: (page: number) => Promise<PagedItems<T>>) {
    void load(fetcher)
  }

  function resetToFirstPage() {
    page.value = 1
  }

  return {
    items,
    page,
    totalPages,
    total,
    loading,
    error,
    hasMore,
    loadMoreFailed,
    load,
    loadMore,
    retryLoadMore,
    resetToFirstPage,
  }
}
