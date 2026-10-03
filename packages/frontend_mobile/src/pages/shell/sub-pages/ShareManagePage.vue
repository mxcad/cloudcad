<script setup lang="ts">
/**
 * 子页：分享管理 —— 搜索 + 分享列表 + 新建 FAB。
 *
 * 数据源：shareControllerListShares（分页 + 搜索）
 * 状态：有效（青）/ 已过期（灰）—— 由 expiresAt 客户端判定（后端不返回 status，撤销=软删不出现在列表）
 * 点击列表项 → action sheet（打开/复制链接/修改有效期/查看二维码/撤销）
 * 新建分享 → 底部弹窗（文件选择 + 有效期 + 创建 + 二维码 + 复制）
 */
import { ref, watch, computed } from 'vue'
import ShareLinkSheet from '@/components/ShareLinkSheet.vue'
import { useShareLinkCopy } from '@/composables/useShareLinkCopy'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { shareControllerListShares, shareControllerRevokeShare, shareControllerUpdateShare, nodeControllerSearch } from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'
import QRCode from 'qrcode'
import { t } from '@/languages'
import { extractExtension } from '@/composables/useNodeFormatter'
import { shareUrl } from '@/utils/shareUrl'
import { useLoginPrompt } from '@/composables/useLoginPrompt'
import {
  SHARE_CUSTOM_DAYS_DEFAULT,
  SHARE_CUSTOM_DAYS_MAX,
  SHARE_CUSTOM_DAYS_MIN,
  SHARE_EXPIRATION_DEFAULT,
  clampCustomDays,
  computeExpiresAtIso,
  detectShareExpiration,
  isShareExpired,
  type ShareExpirationOption,
} from '@cloudcad/platform'
import { useShareCreate, type ShareCreateResult } from '@/composables/useShareCreate'

interface ShareItem {
  id: string
  token: string
  name: string
  ext: string
  // 后端 listShares 不返回 status（撤销=软删不出现在列表），状态由 expiresAt 客户端判定（对齐 PC isExpired）
  status: 'active' | 'expired'
  statusText: string
  expireText: string
  usedCount: number
  url: string
  createdAt: string
  expiresAt?: string | null
}

const router = useRouter()
const { createShares } = useShareCreate()
const keyword = ref('')
const filter = ref<'all' | 'active' | 'expired'>('all')
const shares = ref<ShareItem[]>([])
const loading = ref(false)
const error = ref('')

// C-05 分页/滚动加载（对齐 PC ShareTable 分页）：page 累加 + hasMore；
// C-14 翻页失败保留已加载列表，底条重试（loadMoreFailed 与整页 error 分离）
const sharePageSize = 20
const sharePage = ref(1)
const shareTotal = ref(0)
const loadMoreFailed = ref(false)
const shareHasMore = computed(() => sharePage.value < Math.ceil(shareTotal.value / sharePageSize))

// 操作面板（vant 无 showActionSheet 函数式 API，改用 ActionSheet 组件）
const actionSheetShow = ref(false)
const actionSheetActions = ref<Array<{ name: string; className?: string }>>([])
const activeShare = ref<ShareItem | null>(null)

const filterItems = [
  { key: 'all' as const, label: t('全部') },
  { key: 'active' as const, label: t('有效') },
  { key: 'expired' as const, label: t('已过期') },
]

// C-04 分享列表排序（服务端 sortBy/sortOrder，对齐 PC SORTABLE_COLUMNS）
const sortBy = ref<'createdAt' | 'expiresAt' | 'usedCount'>('createdAt')
const sortOrder = ref<'asc' | 'desc'>('desc')
const showSortSheet = ref(false)

const sortOptions = [
  { field: 'createdAt' as const, label: t('创建时间') },
  { field: 'expiresAt' as const, label: t('有效期') },
  { field: 'usedCount' as const, label: t('次数') },
]

const sortSheetActions = computed(() =>
  sortOptions.map((o) => ({
    name: o.label,
    subname: sortBy.value === o.field ? (sortOrder.value === 'asc' ? '↑' : '↓') : '',
  }))
)

function onSortSelect(action: { name: string }) {
  showSortSheet.value = false
  const opt = sortOptions.find((o) => o.label === action.name)
  if (!opt) return
  if (sortBy.value === opt.field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = opt.field
    sortOrder.value = 'desc'
  }
}

async function loadShares(append = false) {
  loading.value = true
  if (!append) {
    sharePage.value = 1
    error.value = ''
    loadMoreFailed.value = false
  }
  try {
    const res = await shareControllerListShares({
      query: {
        page: sharePage.value,
        pageSize: sharePageSize,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        ...(keyword.value ? { search: keyword.value } : {}),
      },
    })
    if (res.error) throw new Error(String(res.error))
    const data = (res.data ?? {}) as { items?: Array<any>; total?: number }
    const rawShares = data.items ?? []

    const mapped = rawShares.map((s: any) => {
      const fileName = s.fileName ?? t('未知文件')
      const ext = extractExtension(fileName)
      const expiresAt: string | null = s.expiresAt ?? null
      // 状态由过期时间客户端判定（对齐 PC isExpired）：有 expiresAt 且已过期 → expired
      const expired = isShareExpired(expiresAt)
      const status: 'active' | 'expired' = expired ? 'expired' : 'active'

      return {
        id: s.id,
        token: s.token ?? '',
        name: fileName,
        ext,
        status,
        statusText: status === 'active' ? t('有效') : t('已过期'),
        expireText: formatExpiryDate(expiresAt),
        usedCount: s.usedCount ?? 0,
        url: shareUrl(s.url),
        createdAt: s.createdAt ?? '',
        expiresAt,
      }
    })
    shareTotal.value = data.total ?? 0
    shares.value = append ? [...shares.value, ...mapped] : mapped
    loadMoreFailed.value = false
  } catch (e) {
    // C-14：翻页失败保留已加载列表（底条重试）；首屏失败才整页错误态
    if (append) loadMoreFailed.value = true
    else error.value = t('加载失败')
  } finally {
    loading.value = false
  }
}

function loadMoreShares() {
  if (loading.value || loadMoreFailed.value || !shareHasMore.value) return
  sharePage.value++
  loadShares(true)
}

function retryLoadMore() {
  // page 已指向失败页，直接重跑当前页（不会重复追加）
  loadShares(true)
}

function onShareListScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadMoreShares()
}

let shareSearchGen = 0
let shareSearchTimer: ReturnType<typeof setTimeout> | undefined

watch(keyword, () => {
  // 逐字符搜索会每键一次全量请求：与同页文件选择器（fileKeyword）同一 300ms 防抖口径
  const gen = ++shareSearchGen
  clearTimeout(shareSearchTimer)
  shareSearchTimer = setTimeout(() => {
    if (gen !== shareSearchGen) return
    loadShares()
  }, 300)
})

watch(filter, () => loadShares())

// C-04 排序变化回第一页重拉
watch([sortBy, sortOrder], () => loadShares())

// 分享链接一律取后端返回的 url（ShareListItemDto.url 必填）。
// 不本地拼 `/share/{id}`——两端路由表里都没有 `/share/:token`，拼出来是死链。

// 到期时间展示（对齐 PC formatExpiryDate）：null=永不过期，否则本地化日期
function formatExpiryDate(dateStr: string | null): string {
  if (!dateStr) return t('永不过期')
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

// 创建成功面板的到期提示：对齐 PC ShareDialog 用 toLocaleString()（含时分）；
// 列表行仍走 formatExpiryDate 的 toLocaleDateString()（PC 两处同为分档口径）
function formatCreatedExpiry(dateStr: string | null): string {
  if (!dateStr) return t('永不过期')
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

// 创建时间展示（对齐 PC createdAt 列）
function formatDate(iso: string): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

// URL 截断展示（对齐 PC 链接列 25 字符）
function truncateUrl(url: string): string {
  if (!url) return ''
  return url.length > 25 ? url.slice(0, 25) + '...' : url
}

async function onRevokeShare(token: string): Promise<boolean> {
  // 撤销不可逆：二次确认防误触（对齐 PC ConfirmRevokeModal）
  try {
    await showConfirmDialog({
      title: t('撤销分享'),
      message: t('撤销后该分享链接将立即失效，确定撤销？'),
      confirmButtonText: t('撤销'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return false // 用户取消
  }
  try {
    // 撤销端点按 token 查（DELETE /api/v1/shares/:token），传 DB id 会 404
    // SDK 失败不抛而是回 { error }，必须检查——否则失败也报「已撤销」
    const res = await shareControllerRevokeShare({
      path: { token },
    })
    if (res.error) {
      showToast(t('撤销失败'))
      return false
    }
    showToast(t('已撤销'))
    loadShares()
    return true
  } catch (e) {
    showToast(t('撤销失败'))
    return false
  }
}

// C-33 创建成功面板内可直接撤销（对齐 PC ShareDialog 的「撤销分享 + 完成」双按钮）
async function onRevokeCreated() {
  const info = singleCreated.value
  if (!info) return
  if (await onRevokeShare(info.token)) {
    // 该链接已失效，清掉成功面板回到选择态
    createdResults.value = []
  }
}

// ── C-03 多选 + 批量撤销（对齐 PC ShareTable 行选择 + BatchActionBar）──
// 长按进入多选（与文件列表/项目卡片同套 500ms 手势）；底部操作栏「批量撤销」
const isSelecting = ref(false)
const selectedTokens = ref<string[]>([])
const batchRevoking = ref(false)
let shareLongPressTimer: ReturnType<typeof setTimeout> | null = null
const shareLongPressTriggered = ref(false)

function onShareTouchStart(item: ShareItem) {
  shareLongPressTriggered.value = false
  shareLongPressTimer = setTimeout(() => {
    shareLongPressTriggered.value = true
    if (!isSelecting.value) {
      isSelecting.value = true
      selectedTokens.value = [item.token]
    }
    if (navigator.vibrate) navigator.vibrate(10)
  }, 500)
}

function cancelShareLongPress() {
  if (shareLongPressTimer) {
    clearTimeout(shareLongPressTimer)
    shareLongPressTimer = null
  }
}

function toggleSelect(token: string) {
  const idx = selectedTokens.value.indexOf(token)
  if (idx >= 0) selectedTokens.value.splice(idx, 1)
  else selectedTokens.value.push(token)
  if (selectedTokens.value.length === 0) isSelecting.value = false
}

function selectAllShares() {
  selectedTokens.value = filteredShares.value.map((s) => s.token).filter(Boolean)
}

function exitSelecting() {
  isSelecting.value = false
  selectedTokens.value = []
}

async function onBatchRevoke() {
  const tokens = selectedTokens.value.slice()
  if (tokens.length === 0) return
  try {
    await showConfirmDialog({
      title: t('批量撤销'),
      message: t('确定撤销 {count} 个分享？撤销后链接立即失效。', { count: String(tokens.length) }),
      confirmButtonText: t('撤销'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return // 用户取消
  }
  batchRevoking.value = true
  let successCount = 0
  let failCount = 0
  for (const token of tokens) {
    try {
      const res = await shareControllerRevokeShare({ path: { token } })
      if (res.error) failCount++
      else successCount++
    } catch {
      failCount++
    }
  }
  batchRevoking.value = false
  exitSelecting()
  if (successCount > 0) {
    showToast(
      failCount > 0
        ? t('已撤销 {a} 个，{b} 个失败', { a: String(successCount), b: String(failCount) })
        : t('已撤销 {count} 个分享', { count: String(successCount) })
    )
  } else if (failCount > 0) {
    showToast(t('撤销失败 {count} 个', { count: String(failCount) }))
  }
  loadShares()
}

// ── C-02 修改有效期（续期）底部弹窗（对齐 PC EditExpiryModal）──
// C-11/C-12：补「自定义天数」+「立即过期」两档（PC EditExpiryModal 两处都有）
const showRenewPopup = ref(false)
const renewTarget = ref<{ token: string; expiresAt: string | null } | null>(null)
// 保留显式类型：反推出期的分享会预置 'immediate'，超出 SHARE_EXPIRATION_DEFAULT 的类型
const renewExpiration = ref<ShareExpirationOption>(SHARE_EXPIRATION_DEFAULT)
const renewCustomDays = ref(SHARE_CUSTOM_DAYS_DEFAULT)
const renewSaving = ref(false)

const renewExpirationOptions: Array<{ key: ShareExpirationOption; label: string }> = [
  { key: '2h', label: t('2 小时') },
  { key: '6h', label: t('6 小时') },
  { key: '12h', label: t('12 小时') },
  { key: '1d', label: t('1 天') },
  { key: '3d', label: t('3 天') },
  { key: '7d', label: t('7 天') },
  { key: 'custom', label: t('自定义天数') },
  { key: 'immediate', label: t('立即过期') },
  { key: 'never', label: t('永不过期') },
]

function openRenewPopup(item: ShareItem) {
  renewTarget.value = { token: item.token, expiresAt: item.expiresAt ?? null }
  // 对齐 PC EditExpiryModal：按现有 expiresAt 反推初始选中项 + 自定义天数
  const detected = detectShareExpiration(item.expiresAt ?? null)
  renewExpiration.value = detected.option
  // platform 只在 custom 分支返回天数，其余分支的输入框初值走统一默认值
  renewCustomDays.value =
    detected.option === 'custom' ? detected.customDays : SHARE_CUSTOM_DAYS_DEFAULT
  showRenewPopup.value = true
}

// 续期到期时间计算与自定义天数上下界钳制都收敛到 @cloudcad/platform（与 PC 共用）
function computeRenewExpiresAt(): string | null {
  return computeExpiresAtIso(renewExpiration.value, renewCustomDays.value)
}

// 自定义天数输入实时钳制：显示=保存（与提交路径、PC 输入框同一 clampCustomDays）
function onRenewDaysInput(e: Event) {
  renewCustomDays.value = clampCustomDays(
    parseInt((e.target as HTMLInputElement).value, 10)
  )
}

async function onRenewConfirm() {
  const target = renewTarget.value
  if (!target) return
  renewSaving.value = true
  try {
    const res = await shareControllerUpdateShare({
      path: { token: target.token },
      body: { expiresAt: computeRenewExpiresAt() } as never,
    })
    if (res.error) throw new Error(String(res.error))
    showRenewPopup.value = false
    showToast(t('有效期已更新'))
    loadShares()
  } catch (e) {
    showToast(t('修改失败'))
  } finally {
    renewSaving.value = false
  }
}

// ── C-10 二维码（qrcode toDataURL，对齐 PC ShareDialog QRCodeSVG）──
const showQrPopup = ref(false)
const qrPopupUrl = ref('')
const qrPopupDataUrl = ref('')

async function openQrPopup(url: string) {
  qrPopupUrl.value = url
  try {
    qrPopupDataUrl.value = await QRCode.toDataURL(url, { width: 160, margin: 1 })
  } catch {
    qrPopupDataUrl.value = ''
  }
  showQrPopup.value = true
}

// 复制走唯一出口 useShareLinkCopy：copyText → 失败回落手动复制面板 → 成功行内反馈
// （copiedKey 用 url 当键，各按钮用「copiedKey === 自己的 url」判定，对齐 PC copiedToken）
const { copiedKey, showLinkSheet, linkSheetUrl, copy } = useShareLinkCopy()

function copyQrUrl() {
  void copy(qrPopupUrl.value)
}

function onShareClick(item: ShareItem) {
  // 长按触发后抑制随后的 click
  if (shareLongPressTriggered.value) {
    shareLongPressTriggered.value = false
    return
  }
  // C-03 多选模式：点按切换选中（不进 action sheet）
  if (isSelecting.value) {
    toggleSelect(item.token)
    return
  }
  // 对齐 PC ShareTable 行操作：打开 / 复制链接 / 修改有效期 / 撤销（二维码为移动端补充入口）
  const actions: Array<{ name: string; className?: string }> = [
    { name: t('打开') },
    { name: t('复制链接') },
    { name: t('修改有效期') },
    { name: t('查看二维码') },
    { name: t('撤销分享'), className: 'danger' },
  ]

  activeShare.value = item
  actionSheetActions.value = actions
  actionSheetShow.value = true
}

function onActionSheetSelect(action: { name: string; className?: string }) {
  actionSheetShow.value = false
  const item = activeShare.value
  if (!item) return

  const url = item.url
  // 撤销走 token，不依赖链接；其余动作都基于 url，缺失时给可见提示而非静默无动作
  if (!url && action.name !== t('撤销分享')) {
    showToast(t('链接生成失败，请重试'))
    return
  }

  if (action.name === t('打开')) {
    window.open(url, '_blank')
  } else if (action.name === t('复制链接')) {
    void copy(url)
  } else if (action.name === t('修改有效期')) {
    openRenewPopup(item)
  } else if (action.name === t('查看二维码')) {
    void openQrPopup(url)
  } else if (action.name === t('撤销分享')) {
    onRevokeShare(item.token)
  }
}

function onFabClick() {
  openCreateSharePopup()
}

function statusColor(s: string): string {
  if (s === 'active') return '#00a99e'
  return '#8e8e8e'
}

function statusBg(s: string): string {
  if (s === 'active') return 'rgba(0, 169, 158, 0.14)'
  return 'rgba(255, 255, 255, 0.06)'
}

const filteredShares = computed(() => {
  if (filter.value === 'all') return shares.value
  return shares.value.filter((s) => s.status === filter.value)
})

// 未登录引导：guest/token_expired 态自动跳原生登录页（同 tab 带 redirect 回跳）；登录完成后加载分享列表
useLoginPrompt(() => loadShares())

// ── 新建分享弹窗 ──
const showCreateSharePopup = ref(false)
const createLoading = ref(false)
// G-06 实时进度（done/total），对齐 PC ShareDialog loading 视图的 (current/total)
const createProgress = ref<{ done: number; total: number } | null>(null)
const createLabel = computed(() => {
  if (!createLoading.value) return t('创建')
  const p = createProgress.value
  if (p && p.total > 1) {
    return t('正在生成分享链接... ({current}/{total})', {
      current: String(p.done),
      total: String(p.total),
    })
  }
  return t('创建中...')
})
const createError = ref('')

interface CreateFileOption {
  id: string
  name: string
}

// 可选文件 = 「个人空间子树」+「我所属项目的文件」两个搜索 scope 的并集（按 id 去重、翻页累积）：
// 两个 scope 递归覆盖文件夹内层与项目文件，只列个人空间根第一页会让大量文件选不到。
// 重叠节点靠 id 去重（个人空间下的项目文件同时命中两个 scope）。
// 不传 type：searchAllProjects 不按 nodeType 过滤会返回文件夹，文件夹过滤一律放客户端，
// 同时保证 LIBRARY_DRAWING 等后端同样允许分享的节点类型不被服务端筛掉。
const SHARE_FILE_SCOPES = ['personal_space', 'all_projects'] as const
const SHARE_FILE_PAGE_SIZE = 50

const fileKeyword = ref('')
const fileOptions = ref<CreateFileOption[]>([])
// M-01 多选（对齐 PC ShareDialog 批量分享）：点按切换勾选，创建时逐文件循环
const selectedFileIds = ref<string[]>([])
const fileLoading = ref(false)
const fileError = ref('')
const filePage = ref(1)
const fileTotalPages = ref(1)

const fileHasMore = computed(() => filePage.value < fileTotalPages.value)

// 保留显式类型：创建弹窗含第 9 档 'immediate'（对齐 PC getExpirationLabels 九档）
const expirationOptions = ref<ShareExpirationOption>(SHARE_EXPIRATION_DEFAULT)
const customDays = ref(SHARE_CUSTOM_DAYS_DEFAULT)

// M-01 批量创建结果（对齐 PC ShareDialog BatchShareResult）：单文件=长度 1，
// 多选=逐文件一条。成功项带 url 可复制，失败项带 error 供排查。
const createdResults = ref<ShareCreateResult[]>([])
// 单文件成功时沿用原「二维码 + 复制链接」视图；多选走结果列表
const singleCreated = computed(() =>
  createdResults.value.length === 1 && createdResults.value[0].success
    ? createdResults.value[0]
    : null,
)

// C-10：创建成功面板内嵌二维码（对齐 PC ShareDialog QRCodeSVG 160px）
const createdQrDataUrl = ref('')
watch(
  singleCreated,
  async (info) => {
    if (!info) {
      createdQrDataUrl.value = ''
      return
    }
    const url = info.url
    if (!url) {
      createdQrDataUrl.value = ''
      return
    }
    try {
      createdQrDataUrl.value = await QRCode.toDataURL(url, { width: 160, margin: 1 })
    } catch {
      createdQrDataUrl.value = ''
    }
  },
  { immediate: true }
)

async function searchShareFiles(scope: 'personal_space' | 'all_projects', page: number) {
  const res = await nodeControllerSearch({
    query: {
      keyword: fileKeyword.value.trim(),
      scope,
      page,
      limit: SHARE_FILE_PAGE_SIZE,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    },
  })
  if (res.error) throw new Error(String(res.error))
  const data = (res.data ?? {}) as { nodes?: FileSystemNodeDto[]; totalPages?: number }
  return { nodes: data.nodes ?? [], totalPages: data.totalPages ?? 1 }
}

// reset=true（打开弹窗 / 改搜索词）从第一页重建列表并清空选中；
// reset=false（加载更多）在当前已加载结果上追加去重后的新节点。
// fileSearchGen 防止「上一轮翻页 / 上一次搜索」的结果覆盖新一轮重建后的列表。
async function loadShareFiles(reset: boolean) {
  if (fileLoading.value) return
  if (reset) {
    fileSearchGen++
    filePage.value = 1
    fileTotalPages.value = 1
    fileOptions.value = []
    selectedFileIds.value = []
  }
  const gen = fileSearchGen
  fileLoading.value = true
  fileError.value = ''
  try {
    const pages = await Promise.all(SHARE_FILE_SCOPES.map((scope) => searchShareFiles(scope, filePage.value)))
    if (gen !== fileSearchGen) return
    const seen = new Set(fileOptions.value.map((f) => f.id))
    const incoming = pages
      .flatMap((p) => p.nodes)
      .filter((n) => !!n?.id && !n.isFolder)
      .filter((n) => !seen.has(n.id))
      .map((n) => ({ id: n.id, name: n.name || t('未知文件') }))
    fileOptions.value = [...fileOptions.value, ...incoming]
    fileTotalPages.value = Math.max(...pages.map((p) => p.totalPages))
  } catch (e) {
    console.error('[ShareManagePage] loadShareFiles:', e)
    fileError.value = t('加载失败，点击重试')
  } finally {
    fileLoading.value = false
  }
}

function loadMoreShareFiles() {
  filePage.value += 1
  void loadShareFiles(false)
}

// 重试探当前页（不重建列表）：翻页失败时已加载的结果保留，只补失败那一页
function retryFileLoad() {
  void loadShareFiles(false)
}

let fileSearchGen = 0
let fileSearchTimer: ReturnType<typeof setTimeout> | undefined

watch(fileKeyword, () => {
  const gen = ++fileSearchGen
  clearTimeout(fileSearchTimer)
  fileSearchTimer = setTimeout(async () => {
    if (gen !== fileSearchGen) return
    await loadShareFiles(true)
  }, 300)
})

function openCreateSharePopup() {
  showCreateSharePopup.value = true
  createdResults.value = []
  expirationOptions.value = SHARE_EXPIRATION_DEFAULT
  // 作废上一次搜索残留的防抖任务，否则会在直调之后再刷一次列表
  fileSearchGen++
  clearTimeout(fileSearchTimer)
  fileKeyword.value = ''
  createError.value = ''
  void loadShareFiles(true)
}

function toggleFileSelect(id: string) {
  const idx = selectedFileIds.value.indexOf(id)
  if (idx >= 0) selectedFileIds.value.splice(idx, 1)
  else selectedFileIds.value.push(id)
}

// M-01 批量创建（对齐 PC createBatchShares）：逐文件循环 + 结果收集收敛到 useShareCreate；
// 全部成功关弹窗（结果在列表可复制），部分失败停留结果视图供排查。
async function handleCreateShare() {
  const ids = selectedFileIds.value.slice()
  if (ids.length === 0) {
    showToast(t('请选择要分享的文件'))
    return
  }

  createLoading.value = true
  createError.value = ''
  createProgress.value = null
  const results = await createShares(
    ids.map((id) => ({
      fileId: id,
      fileName: fileOptions.value.find((f) => f.id === id)?.name ?? t('未知文件'),
    })),
    expirationOptions.value,
    customDays.value,
    (done, total) => {
      createProgress.value = { done, total }
    },
  )
  createLoading.value = false

  const successCount = results.filter((r) => r.success).length
  const failCount = results.length - successCount
  if (successCount === 0) {
    // G-04：全失败时透出后端本地化文案（如配额不足），而不是只有笼统提示
    createError.value = results[0]?.error ?? t('创建失败，请重试')
    return
  }
  createdResults.value = results
  // 重新加载分享列表（成功项已入库）
  void loadShares()
  if (failCount > 0) {
    showToast(t('已生成 {a} 个分享链接，{b} 个失败', { a: String(successCount), b: String(failCount) }))
  } else if (ids.length > 1) {
    // 多选全部成功：对齐 PC 自动关弹窗，结果在分享列表可复制
    showToast(t('已生成 {count} 个分享链接', { count: String(successCount) }))
    closeCreateSharePopup()
  }
}

function copyCreatedLink(result: ShareCreateResult) {
  void copy(result.url)
}

function closeCreateSharePopup() {
  showCreateSharePopup.value = false
  createdResults.value = []
  createProgress.value = null
}

// 格式化有效期文本（含当前日期）
function formatExpirationDisplay(
  expiration: 'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom' | 'immediate'
): string {
  const labels: Record<
    'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom' | 'immediate',
    string
  > = {
    never: t('永不过期'),
    '2h': t('2 小时'),
    '6h': t('6 小时'),
    '12h': t('12 小时'),
    '1d': t('1 天'),
    '3d': t('3 天'),
    '7d': t('7 天'),
    custom: t('自定义天数'),
    immediate: t('立即过期'),
  }
  return labels[expiration] || expiration
}

// 自定义天数输入实时钳制：显示=保存（与续期弹窗、PC ExpirationPicker 同一 clampCustomDays）
function onCustomDaysInput(e: Event) {
  customDays.value = clampCustomDays(parseInt((e.target as HTMLInputElement).value, 10))
}

</script>

<template>
  <div class="subpage">
    <ShareLinkSheet v-model:show="showLinkSheet" :url="linkSheetUrl" />

    <van-nav-bar :title="t('分享管理')" left-arrow @click-left="() => router.back()" />

    <van-search v-model="keyword" :placeholder="t('搜索分享')" shape="round" />

    <div class="filter-bar">
      <button
        v-for="f in filterItems"
        :key="f.key"
        :class="['filter-btn', { active: filter === f.key }]"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
      <!-- C-04 排序入口：右侧对齐，点开 ActionSheet 选字段/切方向 -->
      <button class="filter-btn sort-btn" @click="showSortSheet = true">
        <van-icon name="sort" size="14" />
        {{ sortOptions.find((o) => o.field === sortBy)?.label }}
      </button>
    </div>
    <van-action-sheet
      v-model:show="showSortSheet"
      :actions="sortSheetActions"
      @select="onSortSelect"
    />

    <div v-if="loading && filteredShares.length === 0" class="state-box">
      <van-loading size="24" />
      <span class="state-text">{{ t('加载中...') }}</span>
    </div>

    <div v-else-if="error" class="state-box">
      <span class="state-text">{{ error }}</span>
      <van-button size="small" round @click="loadShares">{{ t('重试') }}</van-button>
    </div>

    <div v-else-if="filteredShares.length === 0" class="state-box">
      <van-icon name="share-o" size="48" />
      <span class="state-text">{{ keyword ? t('未找到相关分享') : t('暂无分享') }}</span>
      <button v-if="keyword" class="empty-action" @click="keyword = ''">
        <van-icon name="search" size="12" />
        {{ t('清除搜索') }}
      </button>
      <button v-else class="empty-action" @click="onFabClick">
        <van-icon name="plus" size="12" />
        {{ t('新建分享') }}
      </button>
    </div>

    <div v-else class="share-list" @scroll.passive="onShareListScroll">
      <div
        v-for="s in filteredShares"
        :key="s.id"
        :class="['share-item', { 'share-item--selected': isSelecting && selectedTokens.includes(s.token) }]"
        @click="onShareClick(s)"
        @touchstart.passive="onShareTouchStart(s)"
        @touchend="cancelShareLongPress"
        @touchmove="cancelShareLongPress"
      >
        <!-- C-03 多选模式：选中指示（纯 CSS 圆圈勾选，不依赖 vant 图标名）-->
        <span
          v-if="isSelecting"
          :class="['share-select-dot', { 'share-select-dot--on': selectedTokens.includes(s.token) }]"
        />
        <div class="share-left">
          <div class="share-name">
            <span class="share-title">{{ s.name }}</span>
            <span v-if="s.ext" class="share-ext">{{ s.ext }}</span>
          </div>
          <div class="share-url">
            <van-icon name="link-o" size="10" />
            <span class="share-url-text">{{ truncateUrl(s.url) }}</span>
          </div>
          <div class="share-stats">
            <span class="stat"><van-icon name="records-o" size="10" /> {{ s.usedCount }} 次</span>
            <span class="stat">{{ t('创建') }} {{ formatDate(s.createdAt) }}</span>
            <span class="stat">{{ t('到期') }} {{ s.expireText }}</span>
          </div>
        </div>
        <div
          class="share-status"
          :style="{ color: statusColor(s.status), background: statusBg(s.status) }"
        >
          {{ s.statusText }}
        </div>
      </div>
      <!-- C-05/C-14：滚动加载底条（加载中/失败重试/没有更多）-->
      <div class="share-list-footer">
        <van-loading v-if="loading" size="20" />
        <van-button
          v-else-if="loadMoreFailed"
          size="small"
          round
          plain
          type="danger"
          @click="retryLoadMore"
        >
          {{ t('加载失败，点击重试') }}
        </van-button>
        <span v-else-if="!shareHasMore" class="state-text">{{ t('没有更多了') }}</span>
      </div>
    </div>

    <!-- C-03 多选模式底部操作栏（取消/全选/批量撤销）-->
    <div v-if="isSelecting" class="select-bar">
      <button class="select-bar-btn" @click="exitSelecting">{{ t('取消') }}</button>
      <button class="select-bar-btn" @click="selectAllShares">
        {{ t('全选') }}（{{ filteredShares.length }}）
      </button>
      <button
        class="select-bar-btn select-bar-btn--danger"
        :disabled="selectedTokens.length === 0 || batchRevoking"
        @click="onBatchRevoke"
      >
        {{ batchRevoking ? t('撤销中...') : `${t('批量撤销')}（${selectedTokens.length}）` }}
      </button>
    </div>

    <button v-if="!isSelecting" class="fab" :aria-label="t('新建分享')" @click="onFabClick">
      <van-icon name="plus" />
    </button>

    <van-action-sheet
      v-model:show="actionSheetShow"
      :actions="actionSheetActions"
      :cancel-text="t('取消')"
      @select="onActionSheetSelect"
    />

    <!-- C-02 修改有效期（续期）底部弹窗 -->
    <van-popup v-model:show="showRenewPopup" position="bottom" round :style="{ height: '45%' }">
      <div class="renew-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showRenewPopup = false">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('修改有效期') }}</span>
          <button class="panel-confirm" :disabled="renewSaving" @click="onRenewConfirm">
            {{ t('保存') }}
          </button>
        </div>
        <div class="renew-body">
          <div class="section-title">{{ t('有效期') }}</div>
          <div class="expire-chips">
            <button
              v-for="opt in renewExpirationOptions"
              :key="opt.key"
              :class="['expire-chip', { active: renewExpiration === opt.key }]"
              @click="renewExpiration = opt.key"
            >
              {{ opt.label }}
            </button>
          </div>
          <!-- C-11 自定义天数输入（1-365，对齐 PC ExpirationPicker）：受控钳制，显示=保存 -->
          <div v-if="renewExpiration === 'custom'" class="custom-days-row">
            <input
              :value="renewCustomDays"
              class="custom-days-input"
              type="number"
              :min="SHARE_CUSTOM_DAYS_MIN"
              :max="SHARE_CUSTOM_DAYS_MAX"
              @input="onRenewDaysInput"
            />
            <span class="custom-days-unit">{{ t('天后过期') }}</span>
          </div>
        </div>
      </div>
    </van-popup>

    <!-- C-10 二维码弹窗 -->
    <van-popup v-model:show="showQrPopup" position="bottom" round>
      <div class="qr-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="showQrPopup = false">{{ t('关闭') }}</button>
          <span class="panel-title">{{ t('分享二维码') }}</span>
          <span></span>
        </div>
        <div class="qr-body">
          <img v-if="qrPopupDataUrl" class="qr-image" :src="qrPopupDataUrl" alt="QR" />
          <div v-else class="qr-fallback">{{ t('二维码生成失败') }}</div>
          <div class="qr-url-row">
            <input class="share-url-input" :value="qrPopupUrl" readonly />
            <button class="copy-btn" @click="copyQrUrl">
              <van-icon v-if="copiedKey === qrPopupUrl" name="success" size="14" />
              <span v-else>{{ t('复制') }}</span>
            </button>
          </div>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showCreateSharePopup" position="bottom" round :style="{ height: '70%' }" @close="closeCreateSharePopup">
      <div class="create-share-panel">
        <div class="panel-header">
          <button class="panel-cancel" @click="closeCreateSharePopup">{{ t('取消') }}</button>
          <span class="panel-title">{{ t('新建分享') }}</span>
          <button
            v-if="createdResults.length === 0"
            class="panel-confirm"
            :disabled="selectedFileIds.length === 0 || createLoading"
            @click="handleCreateShare"
          >
            {{ createLabel }}
          </button>
          <button v-else class="panel-confirm" @click="closeCreateSharePopup">{{ t('完成') }}</button>
        </div>

        <template v-if="singleCreated">
          <div class="share-success">
            <van-icon name="checked" size="48" color="var(--accent)" />
            <span class="success-text">{{ t('分享链接已创建') }}</span>
            <img v-if="createdQrDataUrl" class="qr-image" :src="createdQrDataUrl" alt="QR" />
            <div class="share-url-row">
              <input class="share-url-input" :value="singleCreated.url" readonly />
              <button class="copy-btn" @click="copyCreatedLink(singleCreated)">
                <van-icon v-if="copiedKey === singleCreated.url" name="success" size="14" />
                <span v-else>{{ t('复制') }}</span>
              </button>
            </div>
            <div class="expire-hint">
              <van-icon name="clock-o" size="12" />
              {{ formatCreatedExpiry(singleCreated.expiresAt ?? null) }}
            </div>
            <!-- C-33：创建成功即可撤销，不必先关闭再回列表找行（对齐 PC ShareDialog） -->
            <button class="success-revoke" @click="onRevokeCreated">
              <van-icon name="delete-o" size="14" />
              {{ t('撤销分享') }}
            </button>
          </div>
        </template>

        <!-- M-01 批量结果列表（多选成功/部分失败；全成功已自动关弹窗，此处只渲染多选失败残留态与单文件失败） -->
        <template v-else-if="createdResults.length > 0">
          <div class="batch-results">
            <div class="batch-summary">
              {{
                t('已生成 {count} 个分享链接', {
                  count: String(createdResults.filter((r) => r.success).length),
                })
              }}
            </div>
            <div
              v-for="(r, i) in createdResults"
              :key="i"
              :class="['batch-item', { 'batch-item--failed': !r.success }]"
            >
              <div class="batch-item-name">
                <van-icon :name="r.success ? 'photo-o' : 'warning-o'" size="14" />
                <span>{{ r.fileName }}</span>
              </div>
              <template v-if="r.success">
                <div class="share-url-row">
                  <input class="share-url-input" :value="r.url" readonly />
                  <button class="copy-btn" @click="copyCreatedLink(r)">
                    <van-icon v-if="copiedKey === r.url" name="success" size="14" />
                    <span v-else>{{ t('复制') }}</span>
                  </button>
                </div>
              </template>
              <div v-else class="batch-item-error">{{ r.error }}</div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="file-section">
            <div class="section-title">
              {{ t('选择文件') }}
              <span v-if="selectedFileIds.length > 0" class="selected-count">
                {{ t('已选择 {count} 个文件', { count: String(selectedFileIds.length) }) }}
              </span>
            </div>
            <van-search
              v-model="fileKeyword"
              class="file-search"
              shape="round"
              clearable
              :placeholder="t('搜索文件')"
            />
            <div v-if="fileError" class="file-empty file-error" @click="retryFileLoad">
              <van-icon name="warning-o" size="24" />
              <span>{{ fileError }}</span>
            </div>
            <template v-else>
              <div v-if="fileLoading && fileOptions.length === 0" class="file-empty">
                <van-loading size="22" />
              </div>
              <div v-else-if="fileOptions.length === 0" class="file-empty">
                <van-icon name="search" size="24" />
                <span>{{ t('暂无可分享的文件') }}</span>
              </div>
              <div v-else class="file-list">
                <div
                  v-for="f in fileOptions"
                  :key="f.id"
                  :class="['file-option', { selected: selectedFileIds.includes(f.id) }]"
                  @click="toggleFileSelect(f.id)"
                >
                  <span
                    :class="['file-check', { 'file-check--on': selectedFileIds.includes(f.id) }]"
                  />
                  <van-icon name="photo-o" size="18" />
                  <span class="file-option-name">{{ f.name }}</span>
                  <van-icon v-if="selectedFileIds.includes(f.id)" name="passed" size="16" color="var(--accent)" />
                </div>
                <button v-if="fileHasMore && !fileLoading" class="file-more" @click="loadMoreShareFiles">
                  {{ t('加载更多') }}
                </button>
              </div>
            </template>
          </div>

          <div class="expire-section">
            <div class="section-title">{{ t('有效期') }}</div>
            <div class="expire-chips">
              <button
                v-for="opt in ['2h', '6h', '12h', '1d', '3d', '7d', 'custom', 'immediate', 'never'] as const"
                :key="opt"
                :class="['expire-chip', { active: expirationOptions === opt }]"
                @click="expirationOptions = opt"
              >
                {{ formatExpirationDisplay(opt) }}
              </button>
            </div>
            <!-- 自定义天数输入（1-365，对齐 PC ExpirationPicker 与同页续期弹窗） -->
            <div v-if="expirationOptions === 'custom'" class="custom-days-row">
              <input
                :value="customDays"
                class="custom-days-input"
                type="number"
                :min="SHARE_CUSTOM_DAYS_MIN"
                :max="SHARE_CUSTOM_DAYS_MAX"
                @input="onCustomDaysInput"
              />
              <span class="custom-days-unit">{{ t('天后过期') }}</span>
            </div>
          </div>
        </template>

        <div v-if="createError" class="create-error">
          <span>{{ createError }}</span>
        </div>
      </div>
    </van-popup>

  </div>
</template>

<style scoped lang="scss">
.subpage {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px 14px 4px;
  flex: none;
}

.filter-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-size: 12px;
  flex-shrink: 0;

  &.active {
    background: rgba(0, 169, 158, 0.14);
    color: var(--accent);
  }
}

/* C-04 排序按钮：右侧对齐（margin-left:auto），与筛选按钮同风格 */
.sort-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.state-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.empty-action {
  margin-top: 8px;
  padding: 8px 16px;
  border: 1px solid var(--accent);
  border-radius: 16px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.share-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
}

.share-list-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 16px;
}

.share-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 0.5px solid var(--divider);

  &:active {
    opacity: 0.8;
  }
}

.share-item--selected {
  background: rgba(0, 169, 158, 0.06);
}

.share-select-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--accent);
  background: transparent;
  flex-shrink: 0;
  box-sizing: border-box;
  position: relative;
}

.share-select-dot--on {
  background: var(--accent);
}

.share-select-dot--on::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.share-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-title {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-ext {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 169, 158, 0.18);
  color: var(--accent);
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.share-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 3px;
}

.share-status {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 10px;
  flex-shrink: 0;
}

.fab {
  position: fixed;
  right: 16px;
  bottom: 60px;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 169, 158, 0.4);
  z-index: 100;

  &:active {
    opacity: 0.85;
  }
}

/* C-03 多选模式底部操作栏 */
.select-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: var(--bg-primary);
  border-top: 0.5px solid var(--divider);
  z-index: 100;
}

.select-bar-btn {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;

  &:active {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.select-bar-btn--danger {
  background: var(--accent);
  color: #fff;
}

/* ═══ 新建分享弹窗 ═══ */
.create-share-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 16px;
  border-bottom: 0.5px solid var(--divider);
  flex-shrink: 0;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-cancel {
  border: none;
  background: none;
  font-size: 14px;
  padding: 4px 8px;
  color: var(--text-tertiary);
}

.panel-confirm {
  border: none;
  background: none;
  font-size: 14px;
  padding: 4px 8px;
  color: var(--accent);
  font-weight: 600;
  opacity: 0.5;
  cursor: default;

  &:not(:disabled) {
    opacity: 1;
    cursor: pointer;
  }

  &:disabled {
    pointer-events: none;
  }
}

.section-title {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 14px 0 8px;
  flex-shrink: 0;
}

.file-section,
.expire-section {
  flex-shrink: 0;
}

.file-section {
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
}

.file-search {
  margin: 0 0 6px;
  padding: 0 4px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-primary);
  flex-shrink: 0;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
  cursor: pointer;

  &.selected {
    border-color: var(--accent);
    background: rgba(0, 169, 158, 0.08);
  }

  &:active {
    opacity: 0.8;
  }
}

.file-option-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-more {
  width: 100%;
  margin-top: 4px;
  padding: 10px 0;
  border: 1px solid var(--divider);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

/* M-01 多选：已选计数 + 行内勾选圈 */
.selected-count {
  margin-left: 8px;
  color: var(--accent);
  font-weight: 500;
}

.file-check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--text-tertiary);
  background: transparent;
  flex-shrink: 0;
  box-sizing: border-box;
  position: relative;
}

.file-check--on {
  background: var(--accent);
  border-color: var(--accent);
}

.file-check--on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* M-01 批量结果列表 */
.batch-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.batch-summary {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  padding: 14px 0 10px;
}

.batch-item {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
  margin-bottom: 8px;

  &.batch-item--failed {
    border-color: #ff4444;
  }
}

.batch-item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-item-error {
  font-size: 12px;
  color: #ff4444;
}

.file-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 13px;

  &.file-error {
    cursor: pointer;
  }
}

.expire-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.expire-chip {
  padding: 8px 14px;
  border: 1px solid var(--divider);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;

  &.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  &:active {
    opacity: 0.8;
  }
}

.share-success {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 0;
}

.success-text {
  font-size: 14px;
  color: var(--text-primary);
}

.share-url-row {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: center;
}

.share-url-input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--divider);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: monospace;
}

.copy-btn {
  flex-shrink: 0;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.expire-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.success-revoke {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 68, 68, 0.1);
  color: #ff4444;
  font-size: 13px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
}

.create-error {
  padding: 12px 0 0;
  text-align: center;
  color: #ff4444;
  font-size: 13px;
}

/* ═══ C-07 列表项 URL 行 ═══ */
.share-url {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
}

.share-url-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

/* ═══ C-02 修改有效期弹窗 ═══ */
.renew-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

.renew-body {
  flex: 1;
  overflow-y: auto;
}

.custom-days-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.custom-days-input {
  width: 72px;
  padding: 6px 10px;
  border: 1px solid var(--border-primary, #ddd);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

.custom-days-unit {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ═══ C-10 二维码 ═══ */
.qr-panel {
  padding: 16px;
  box-sizing: border-box;
}

.qr-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 8px 0 4px;
}

.qr-image {
  width: 160px;
  height: 160px;
  border-radius: 8px;
  background: var(--van-white);
  padding: 8px;
  box-sizing: border-box;
}

.qr-fallback {
  font-size: 13px;
  color: var(--text-tertiary);
  padding: 24px 0;
}

.qr-url-row {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>