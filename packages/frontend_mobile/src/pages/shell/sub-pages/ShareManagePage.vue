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
import { copyText } from '@/utils/clipboard'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { shareControllerListShares, shareControllerRevokeShare, shareControllerCreateShare, shareControllerUpdateShare, nodeControllerSearch } from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'
import QRCode from 'qrcode'
import { t } from '@/languages'
import { extractExtension } from '@/composables/useNodeFormatter'
import { useLoginPrompt } from '@/composables/useLoginPrompt'
import {
  computeExpiresAtIso,
  computeExpiresInSeconds,
  detectShareExpiration,
  isShareExpired,
  type ShareExpirationOption,
} from '@cloudcad/platform'

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
        url: s.url ?? '',
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

watch(keyword, () => {
  loadShares()
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

async function onRevokeShare(token: string) {
  // 撤销不可逆：二次确认防误触（对齐 PC ConfirmRevokeModal）
  try {
    await showConfirmDialog({
      title: t('撤销分享'),
      message: t('撤销后该分享链接将立即失效，确定撤销？'),
      confirmButtonText: t('撤销'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return // 用户取消
  }
  try {
    // 撤销端点按 token 查（DELETE /api/v1/shares/:token），传 DB id 会 404
    await shareControllerRevokeShare({
      path: { token },
    })
    showToast(t('已撤销'))
    loadShares()
  } catch (e) {
    showToast(t('撤销失败'))
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
const renewExpiration = ref<ShareExpirationOption>('7d')
const renewCustomDays = ref(1)
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
  renewCustomDays.value = detected.customDays
  showRenewPopup.value = true
}

// 续期到期时间计算收敛到 @cloudcad/platform（与 PC 共用）；自定义天数钳制 1-365
function computeRenewExpiresAt(): string | null {
  const days = Math.max(1, Math.min(365, Math.round(renewCustomDays.value) || 1))
  return computeExpiresAtIso(renewExpiration.value, days)
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
    qrPopupDataUrl.value = await QRCode.toDataURL(url, { width: 200, margin: 1 })
  } catch {
    qrPopupDataUrl.value = ''
  }
  showQrPopup.value = true
}

const showLinkSheet = ref(false)
const linkSheetUrl = ref('')

/**
 * 复制链接：两级降级都失败时弹出只读输入框，让用户手动选中复制。
 * 原降级是 showToast(url) —— toast 无法被选中复制，等于没有兜底。
 */
async function copyLinkWithFallback(url: string) {
  if (!url) return
  const result = await copyText(url)
  if (result === 'failed') {
    linkSheetUrl.value = url
    showLinkSheet.value = true
    return
  }
  showToast(t('已复制链接'))
}

function copyQrUrl() {
  void copyLinkWithFallback(qrPopupUrl.value)
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
    void copyLinkWithFallback(url)
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
const selectedFileId = ref('')
const fileLoading = ref(false)
const fileError = ref('')
const filePage = ref(1)
const fileTotalPages = ref(1)

const fileHasMore = computed(() => filePage.value < fileTotalPages.value)

const expirationOptions = ref<'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom'>('7d')
const customDays = ref(1)

const createdShareInfo = ref<{ token: string; url: string; expiresAt?: string | null } | null>(null)

// C-10：创建成功面板内嵌二维码（对齐 PC ShareDialog QRCodeSVG 160px）
const createdQrDataUrl = ref('')
watch(
  createdShareInfo,
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

// 创建分享的 expiresIn（秒）计算收敛到 @cloudcad/platform（与 PC 共用）
function expiresIn(expiration: 'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'custom'): number | undefined {
  return computeExpiresInSeconds(expiration, customDays.value)
}

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
  } as any)
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
    selectedFileId.value = ''
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
  createdShareInfo.value = null
  expirationOptions.value = '7d'
  // 作废上一次搜索残留的防抖任务，否则会在直调之后再刷一次列表
  fileSearchGen++
  clearTimeout(fileSearchTimer)
  fileKeyword.value = ''
  createError.value = ''
  void loadShareFiles(true)
}

function selectFile(id: string) {
  selectedFileId.value = id
}

async function handleCreateShare() {
  if (!selectedFileId.value) {
    showToast(t('请选择要分享的文件'))
    return
  }

  createLoading.value = true
  createError.value = ''
  try {
    const expiresInValue = expiresIn(expirationOptions.value)
    const res = await shareControllerCreateShare({
      body: {
        fileId: selectedFileId.value,
        ...(expiresInValue !== undefined ? { expiresIn: expiresInValue } : {}),
      },
    })
    if (res.error) {
      createError.value = String(res.error)
      return
    }
    const raw = res.data as { token?: string; url?: string; expiresAt?: string | null } | undefined
    if (!raw || !raw.token) {
      createError.value = t('创建失败，请重试')
      return
    }
    createdShareInfo.value = {
      token: raw.token,
      url: raw.url ?? '',
      expiresAt: raw.expiresAt ?? null,
    }
    // 重新加载分享列表
    void loadShares()
  } catch (e) {
    createError.value = t('创建失败，请重试')
  } finally {
    createLoading.value = false
  }
}

async function copyCreatedLink() {
  const url = createdShareInfo.value?.url
  if (!url) return
  void copyLinkWithFallback(url)
}

function closeCreateSharePopup() {
  showCreateSharePopup.value = false
  createdShareInfo.value = null
}

// 格式化有效期文本（含当前日期）
function formatExpirationDisplay(expiration: 'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d'): string {
  const labels: Record<'never' | '2h' | '6h' | '12h' | '1d' | '3d' | '7d', string> = {
    never: t('永不过期'),
    '2h': t('2 小时'),
    '6h': t('6 小时'),
    '12h': t('12 小时'),
    '1d': t('1 天'),
    '3d': t('3 天'),
    '7d': t('7 天'),
  }
  return labels[expiration] || expiration
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
          <!-- C-11 自定义天数输入（1-365，对齐 PC ExpirationPicker）-->
          <div v-if="renewExpiration === 'custom'" class="custom-days-row">
            <input
              v-model.number="renewCustomDays"
              class="custom-days-input"
              type="number"
              min="1"
              max="365"
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
            <button class="copy-btn" @click="copyQrUrl">{{ t('复制') }}</button>
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
            v-if="!createdShareInfo"
            class="panel-confirm"
            :disabled="!selectedFileId || createLoading"
            @click="handleCreateShare"
          >
            {{ createLoading ? t('创建中...') : t('创建') }}
          </button>
          <button v-else class="panel-confirm" @click="closeCreateSharePopup">{{ t('完成') }}</button>
        </div>

        <template v-if="createdShareInfo">
          <div class="share-success">
            <van-icon name="checked" size="48" color="var(--accent)" />
            <span class="success-text">{{ t('分享链接已创建') }}</span>
            <img v-if="createdQrDataUrl" class="qr-image qr-image--inline" :src="createdQrDataUrl" alt="QR" />
            <div class="share-url-row">
              <input class="share-url-input" :value="createdShareInfo.url" readonly />
              <button class="copy-btn" @click="copyCreatedLink">{{ t('复制') }}</button>
            </div>
            <div class="expire-hint">
              <van-icon name="clock-o" size="12" />
              {{ formatExpiryDate(createdShareInfo.expiresAt ?? null) }}
            </div>
          </div>
        </template>

        <template v-else>
          <div class="file-section">
            <div class="section-title">{{ t('选择文件') }}</div>
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
                  :class="['file-option', { selected: selectedFileId === f.id }]"
                  @click="selectFile(f.id)"
                >
                  <van-icon name="photo-o" size="18" />
                  <span class="file-option-name">{{ f.name }}</span>
                  <van-icon v-if="selectedFileId === f.id" name="passed" size="16" color="var(--accent)" />
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
                v-for="opt in ['2h', '6h', '12h', '1d', '3d', '7d', 'never'] as const"
                :key="opt"
                :class="['expire-chip', { active: expirationOptions === opt }]"
                @click="expirationOptions = opt"
              >
                {{ formatExpirationDisplay(opt) }}
              </button>
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
  width: 200px;
  height: 200px;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  box-sizing: border-box;
}

.qr-image--inline {
  width: 160px;
  height: 160px;
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