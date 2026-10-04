<script lang="ts">
// 多选操作项 key（回收站扩展 restore/permanentDelete；父组件 selectionAction handler 按此类型标注）
// cut/copy=写入剪贴板（对齐 PC），move=单条目菜单的移动到文件夹（picker）
export type SelectionActionKey = 'download' | 'delete' | 'move' | 'copy' | 'cut' | 'restore' | 'permanentDelete'

// 多选操作项定义（父组件可注入：回收站传 恢复/彻底删除；项目页按权限传 disabled 门控）
export interface SelectionActionDef {
  key: SelectionActionKey
  label: string
  danger?: boolean
  /** 权限/策略门控：禁用该操作（对齐 PC 按权限禁用批量操作按钮） */
  disabled?: boolean
}
</script>

<script setup lang="ts">
/**
 * 统一文件列表组件（M2 实施）—— 文件浏览器 / 项目详情共用，改一次两域同变。
 *
 * domain 决定行为差异：
 *   project:   有面包屑、无分类筛选
 *   personal:  有面包屑（子文件夹）、无分类筛选
 *
 * 数据由 useUnifiedFileList composable 提供，本组件纯展示。
 * 库域已改为抽屉（LibraryPanel.vue），不再走本组件——见 docs/adr/0062 第 5 节。
 */
import { ref, watch, computed } from 'vue'
import { t } from '@/languages'
import type { UnifiedDomain } from '../../../composables/useUnifiedFileList'
import type { FileListItem } from '../../../composables/useNodeFormatter'
import {
  FolderIcon,
  ProjectIcon,
  DwgIcon,
  DxfIcon,
  PdfIcon,
  ImageIcon,
  FileIcon,
} from '../../../components/FileIcons'
import { useFileSystemClipboard } from '../../../stores/fileSystemClipboard'
import { useMultiSelect } from '../../../composables/useMultiSelect'

type ListItem = FileListItem
type SortField = 'name' | 'createdAt' | 'updatedAt' | 'size'
type SortOrder = 'asc' | 'desc'

const props = withDefaults(
  defineProps<{
    domain: UnifiedDomain
    items: ListItem[]
    loading: boolean
    showToolbar?: boolean
    breadcrumb?: Array<{ id: string; name: string }>
    mode?: 'grid' | 'list'
    hasMore?: boolean
    /** 搜索关键词（双向绑定，父组件可在切换文件夹时清空输入框） */
    keyword?: string
    /** 搜索占位文案（回收站等场景传「搜索已删除的项目...」，对齐 PC） */
    searchPlaceholder?: string
    /** 加载更多失败（A-14）：已加载内容保留时底部出重试条 */
    loadMoreFailed?: boolean
    /** 当前排序字段（A-10），仅用于展示方向标记 */
    sortBy?: SortField
    sortOrder?: SortOrder
    /** 空态是否显示「新建文件夹」入口（回收站等无新建语义的列表传 false） */
    showFab?: boolean
    /** 空态文案（不传则按 domain 派生） */
    emptyText?: string
    /** 空态图标（不传沿用默认的 friends-o） */
    emptyIcon?: string
    /** 多选操作项（不传沿用默认的 复制/剪切/下载/删除；回收站传 恢复/彻底删除） */
    selectionActions?: SelectionActionDef[]
    /** 是否有生效的高级筛选（二期 d）：筛选按钮高亮 */
    filterActive?: boolean
    /** 是否启用剪贴板「粘贴」条（文件夹视图传 true；项目列表/回收站传 false） */
    enablePaste?: boolean
    /** 粘贴禁用（跨项目转移被源/目标策略禁止，对齐 PC canPaste 门控）：禁用粘贴按钮 + 红字原因 */
    pasteDisabled?: boolean
    /** 粘贴禁用原因（pasteDisabled 时展示） */
    pasteDisabledReason?: string
  }>(),
  {
    showToolbar: true,
    breadcrumb: () => [],
    mode: 'grid',
    hasMore: false,
    keyword: '',
    searchPlaceholder: '',
    loadMoreFailed: false,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    showFab: true,
    filterActive: false,
    enablePaste: false,
    pasteDisabled: false,
    pasteDisabledReason: '',
  }
)

const emit = defineEmits<{
  itemClick: [item: ListItem]
  itemMenu: [item: ListItem]
  modeChange: [mode: 'grid' | 'list']
  breadcrumbClick: [index: number]
  fabClick: []
  selectionAction: [action: SelectionActionKey, items: ListItem[]]
  search: [keyword: string]
  loadMore: []
  loadMoreRetry: []
  refresh: []
  sortChange: [sortBy: SortField, sortOrder: SortOrder]
  /** 工具栏筛选按钮（二期 d）：父组件打开 FileFilterPopup */
  filter: []
  /** 剪贴板「粘贴」（Bug6）：父组件把剪贴板内容粘贴到当前文件夹 */
  paste: []
  /** 剪贴板「清空」：父组件清空剪贴板 */
  clearPaste: []
  'update:keyword': [keyword: string]
}>()

const searchKeyword = ref(props.keyword)
const mode = ref<'grid' | 'list'>(props.mode)

// 父组件用 useViewMode 持久化视图模式（A-16），切域回来时保持外部值
watch(
  () => props.mode,
  (val) => {
    if (val !== mode.value) mode.value = val
  },
)

function switchMode(m: 'grid' | 'list') {
  mode.value = m
  emit('modeChange', m)
}

// 服务端搜索：关键词上抛给父组件（父组件调 composable.setSearch，带防抖），
// 列表直接用 props.items（不再客户端过滤已加载页——那样搜不到未加载的内容）
watch(searchKeyword, (val) => {
  emit('update:keyword', val)
  emit('search', val)
})

// 父组件清空/设置关键词（如切换文件夹）→ 同步输入框
watch(
  () => props.keyword,
  (val) => {
    if (val !== searchKeyword.value) searchKeyword.value = val
  },
)

// 无限滚动：滚动接近底部时上抛加载更多（父组件调 composable.loadMore）
function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
    emit('loadMore')
  }
}

const extColor = (ext: string) => {
  const map: Record<string, string> = {
    mxweb: '#00a99e',
    dwg: '#ff976a',
    dxf: '#7c9cff',
    xlsx: '#52c41a',
    pdf: '#ff4d4f',
    jpg: '#9254de',
    png: '#9254de',
  }
  return map[ext.toLowerCase()] || '#8e8e8e'
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

// 按扩展名返回默认文件图标（对齐 PC getFileIconComponent：dwg/dxf/pdf/图片/通用兜底）
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
function fileIconFor(item: ListItem) {
  const ext = (item.ext || '').toLowerCase()
  if (ext === 'dwg') return DwgIcon
  if (ext === 'dxf') return DxfIcon
  if (ext === 'pdf') return PdfIcon
  if (IMAGE_EXTS.includes(ext)) return ImageIcon
  return FileIcon
}

// 缩略图加载失败标记：失败后隐藏 <img>，露出底层按后缀的默认图标（替代旧的文件夹 emoji 兜底）
const thumbErrors = ref<Set<string>>(new Set())
function onThumbError(id: string) {
  thumbErrors.value.add(id)
}

// ── 长按多选（状态机见 useMultiSelect：导航清选中/点按切换/清空退出；手势定时器绑 touch 事件留这里）──
const { isSelectionMode, selected, enterWith, toggleSelect, selectAll, clearSelection, exitSelectionMode } = useMultiSelect(
  () => props.breadcrumb,
  // 数据源更换（搜索/换 scope/刷新回第一页）时按加载项剪枝选中，避免「已选 N 项」残留却点不动
  () => props.items.map((i) => i.id),
)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
// 长按触发后抑制随后的合成 click：被动 touchstart（.passive）无法 preventDefault，
// touchend 后浏览器仍派发 click → onItemClick 见已进多选态会 toggleSelect 把刚选中的项
// 取消、清空后退出多选态，长按净效果=震动一下回到原状（触摸设备无法进入多选）。
// 与 FileBrowserPage 项目卡片/搜索行同套守卫（longPressTriggered ? undefined : handler）。
const longPressTriggered = ref(false)

function startLongPress(item: ListItem) {
  if (isSelectionMode.value) return
  longPressTriggered.value = false
  longPressTimer = setTimeout(() => {
    longPressTriggered.value = true
    enterWith(item)
    if (navigator.vibrate) navigator.vibrate(10)
  }, 500)
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onItemClick(item: ListItem) {
  if (isSelectionMode.value) {
    toggleSelect(item)
  } else {
    emit('itemClick', item)
  }
}

// 长按守卫：只抑制长按后紧随的那次合成 click（消费后复位）。
// 原内联 `longPressTriggered ? undefined : onItemClick` 不复位标志，长按进多选后
// 标志恒为 true，后续所有点选追加都被吞——触摸设备无法逐项勾选，只能靠「全选」。
// 与 LibraryPanel / ShareManagePage 的消费式写法对齐。
function onItemTap(item: ListItem) {
  if (longPressTriggered.value) {
    longPressTriggered.value = false
    return
  }
  onItemClick(item)
}

// 多选操作项由父组件注入（回收站传 恢复/彻底删除），不传沿用默认四项
// 复制/剪切=写入剪贴板（对齐 PC 多选剪贴板），粘贴见工具栏粘贴条
const selectionActions = computed<SelectionActionDef[]>(() =>
  props.selectionActions ?? [
    { key: 'copy', label: t('复制') },
    { key: 'cut', label: t('剪切') },
    // 移动=直达文件夹选择器（移动端便捷入口，比剪切+粘贴少一步；PC 无此按钮，靠剪切+粘贴/右键「移动到…」）
    { key: 'move', label: t('移动') },
    { key: 'download', label: t('下载') },
    { key: 'delete', label: t('删除'), danger: true },
  ]
)

// 剪贴板（Bug6）：粘贴条读取全局剪贴板状态；仅 enablePaste 的文件夹视图展示
const clipboard = useFileSystemClipboard()
const showPasteBar = computed(() => props.enablePaste && clipboard.hasItems)

function onSelectionAction(action: SelectionActionKey) {
  const selectedItems = props.items.filter((i) => selected.value.has(i.id))
  if (selectedItems.length === 0) return
  // 选中项在 emit 时已捕获，父组件异步处理（确认/选文件夹）期间可安全退出多选
  emit('selectionAction', action, selectedItems)
  exitSelectionMode()
}

// 空态文案/图标：默认按 domain 派生，回收站等场景可由父组件覆盖
const emptyText = computed(() =>
  props.emptyText || (props.domain === 'project' ? t('暂无项目文件') : t('个人空间空空如也'))
)
const emptyIcon = computed(() => props.emptyIcon || 'friends-o')

// 网格缩略图：已删项目根用项目图标（与普通文件夹区分），其余文件夹用文件夹图标
function isProjectRoot(item: ListItem): boolean {
  return !!item.isFolder && item.nodeType === 'PROJECT'
}

// A-25 转换失败红标：fileStatus=FAILED 的文件节点（文件夹不显示）
function isFailed(item: ListItem): boolean {
  return !item.isFolder && item.fileStatus === 'FAILED'
}

// A-19 全选：作用于当前已加载页（服务端分页下与 PC「全选当前视图」语义一致）
const allSelected = computed(() => props.items.length > 0 && props.items.every((i) => selected.value.has(i.id)))

function toggleSelectAll() {
  if (allSelected.value) {
    clearSelection()
  } else {
    selectAll(props.items.map((i) => i.id))
  }
}

// ── A-10 排序（ActionSheet 选字段；同字段再点切换方向）──
const sortOptions: Array<{ field: SortField; label: string }> = [
  { field: 'updatedAt', label: t('修改时间') },
  { field: 'createdAt', label: t('创建时间') },
  { field: 'name', label: t('名称') },
  { field: 'size', label: t('大小') },
]
const showSortSheet = ref(false)

const sortSheetActions = computed(() =>
  sortOptions.map((o) => ({
    name: o.label,
    subname: props.sortBy === o.field ? (props.sortOrder === 'asc' ? '↑' : '↓') : '',
  })),
)

function onSortSheetSelect(action: { name: string }) {
  const opt = sortOptions.find((o) => o.label === action.name)
  if (opt) onSortSelect(opt.field)
}

function onSortSelect(field: SortField) {
  showSortSheet.value = false
  // 切换字段用该字段的自然默认方向；同字段重复选择则反转
  const order: SortOrder = props.sortBy === field ? (props.sortOrder === 'asc' ? 'desc' : 'asc') : (field === 'name' ? 'asc' : 'desc')
  emit('sortChange', field, order)
}

// ── A-15 下拉刷新 ──
const refreshing = ref(false)

async function onPullRefresh() {
  emit('refresh')
  // 父组件刷新是异步的：动画至少转一个 tick，再等父组件 loading 回落；
  // 请求挂死时 8s 后强制收起，避免下拉态永远卡住
  await new Promise((r) => setTimeout(r, 400))
  const deadline = Date.now() + 8000
  while (props.loading && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
  }
  refreshing.value = false
}

</script>

<template>
  <div class="unified-list" :class="`domain-${domain}`">
    <!-- ═══ 工具栏（搜索 + 模式切换 + FAB） ═══ -->
    <div v-if="showToolbar" class="list-toolbar">
      <van-search
        v-model="searchKeyword"
        :placeholder="searchPlaceholder || t('搜索文件')"
        shape="round"
        style="flex:1"
      />
      <div class="mode-toggle">
        <button
          :class="['mode-btn', { active: mode === 'grid' }]"
          @click="switchMode('grid')"
        >
          <van-icon name="apps-o" size="18" />
        </button>
        <button
          :class="['mode-btn', { active: mode === 'list' }]"
          @click="switchMode('list')"
        >
          <van-icon name="bars" size="18" />
        </button>
        <!-- A-10 排序（ActionSheet 选字段，同字段再点反转方向） -->
        <button class="mode-btn" @click="showSortSheet = true">
          <van-icon name="sort" size="18" />
        </button>
        <!-- 二期 d 高级筛选（格式/大小/时间区间），有生效筛选时高亮 -->
        <button :class="['mode-btn', { active: filterActive }]" @click="emit('filter')">
          <van-icon name="filter-o" size="18" />
        </button>
      </div>
    </div>

    <!-- ═══ 剪贴板粘贴条（Bug6）：文件夹视图且剪贴板非空时展示；跨项目被策略禁止时禁用+原因 ═══ -->
    <div v-if="showPasteBar" class="paste-bar">
      <van-icon name="description" size="16" class="paste-bar-icon" />
      <div class="paste-bar-main">
        <span class="paste-bar-text">
          {{ clipboard.mode === 'cut' ? t('已剪切 {count} 项', { count: String(clipboard.itemIds.length) }) : t('已复制 {count} 项', { count: String(clipboard.itemIds.length) }) }}
        </span>
        <span v-if="pasteDisabled && pasteDisabledReason" class="paste-bar-reason">{{ pasteDisabledReason }}</span>
      </div>
      <button
        class="paste-bar-btn"
        :class="{ 'paste-bar-btn--disabled': pasteDisabled }"
        :disabled="pasteDisabled"
        @click="emit('paste')"
      >
        {{ t('粘贴') }}
      </button>
      <button class="paste-bar-clear" @click="emit('clearPaste')">{{ t('清空') }}</button>
    </div>

    <!-- ═══ 面包屑 ═══ -->
    <div v-if="breadcrumb.length > 0" class="breadcrumb">
      <span
        class="crumb"
        @click="emit('breadcrumbClick', -1)"
      >
        {{ t('根目录') }}
      </span>
      <template v-for="(b, i) in breadcrumb" :key="b.id">
        <span class="crumb-sep">›</span>
        <span
          :class="['crumb', i === breadcrumb.length - 1 ? 'crumb--last' : '']"
          @click="i < breadcrumb.length - 1 ? emit('breadcrumbClick', i) : undefined"
        >
          {{ b.name }}
        </span>
      </template>
    </div>

    <!-- ═══ 加载态 ═══ -->
    <div v-if="loading && items.length === 0" class="loading-state">
      <van-loading size="24" />
      <span class="empty-text">{{ t('加载中...') }}</span>
    </div>

    <!-- ═══ 空态 ═══ -->
    <div v-else-if="!loading && items.length === 0" class="empty-state">
      <div class="empty-icon">
        <van-icon :name="emptyIcon" size="48" />
      </div>
      <span class="empty-text">
        {{ emptyText }}
      </span>
      <button v-if="showFab" class="empty-action" @click="emit('fabClick')">
        {{ t('新建文件夹') }}
      </button>
    </div>

    <!-- ═══ 文件列表（A-15 下拉刷新包裹 + A-14 加载更多失败出重试条）═══ -->
    <van-pull-refresh v-else v-model="refreshing" :items-length="items.length" @refresh="onPullRefresh">
      <!-- ═══ 网格模式 ═══ -->
      <div v-if="mode === 'grid'" class="file-grid" @scroll.passive="onScroll">
        <div
          v-for="item in items"
          :key="item.id"
          class="grid-item"
          :class="{ 'grid-item--folder': item.isFolder, 'grid-item--selected': selected.has(item.id) }"
          @click="onItemTap(item)"
          @touchstart.passive="startLongPress(item)"
          @touchend="cancelLongPress"
          @touchmove="cancelLongPress"
          @contextmenu.prevent="onItemClick(item)"
        >
          <div v-if="item.isFolder" class="grid-thumb grid-thumb--folder">
            <ProjectIcon v-if="isProjectRoot(item)" size="72%" />
            <FolderIcon v-else size="72%" />
          </div>
          <div v-else class="grid-thumb grid-thumb--file">
            <component :is="fileIconFor(item)" class="thumb-icon" size="72%" />
            <img
              v-if="item.thumb && !thumbErrors.has(item.id)"
              :src="item.thumb"
              class="thumb-img"
              @error="onThumbError(item.id)"
            />
          </div>
          <span class="grid-name">{{ stripExt(item.name) }}</span>
          <span v-if="isFailed(item)" class="failed-badge">
            <van-icon name="cross" size="12" />
            {{ t('转换失败') }}
          </span>
          <!-- A-12 项目根卡片：描述（2 行截断）+ 成员数（对齐 PC FileItemInfo metaStats） -->
          <span v-if="isProjectRoot(item) && item.description" class="grid-desc">{{ item.description }}</span>
          <span v-if="isProjectRoot(item) && item.memberCount !== undefined" class="grid-meta grid-meta--project">
            {{ t('{count} 个成员', { count: String(item.memberCount) }) }}
          </span>
          <span v-if="!item.isFolder" class="grid-meta">{{ item.time }}</span>
          <span v-if="item.ancestorPath" class="grid-source">{{ item.ancestorPath }}</span>
          <!-- 单条目操作菜单入口（A-03）：列表行 ellipsis / 网格角标，长按仍为多选 -->
          <button class="grid-more" @click.stop="emit('itemMenu', item)">
            <van-icon name="ellipsis" size="16" />
          </button>
        </div>
        <div v-if="items.length > 0" class="load-more-footer">
          <van-loading v-if="loading" size="18" />
          <button
            v-else-if="loadMoreFailed"
            class="load-more-retry"
            @click="emit('loadMoreRetry')"
          >
            {{ t('加载失败，点击重试') }}
          </button>
          <span v-else-if="!hasMore" class="load-more-text">没有更多了</span>
        </div>
      </div>

      <!-- ═══ 清单模式 ═══ -->
      <div v-else class="file-list" @scroll.passive="onScroll">
        <div
          v-for="item in items"
          :key="item.id"
          class="list-item"
          :class="{ 'list-item--selected': selected.has(item.id) }"
          @click="onItemTap(item)"
          @touchstart.passive="startLongPress(item)"
          @touchend="cancelLongPress"
          @touchmove="cancelLongPress"
          @contextmenu.prevent="onItemClick(item)"
        >
          <div class="list-icon" :class="item.isFolder ? 'list-icon--folder' : 'list-icon--file'">
            <ProjectIcon v-if="isProjectRoot(item)" :size="20" />
            <FolderIcon v-else-if="item.isFolder" :size="20" />
            <component v-else :is="fileIconFor(item)" :size="20" />
          </div>
          <div class="list-body">
            <span class="list-name">{{ stripExt(item.name) }}</span>
            <span v-if="isFailed(item)" class="failed-badge">
              <van-icon name="cross" size="12" />
              {{ t('转换失败') }}
            </span>
            <span class="list-sub">{{ item.isFolder ? t('文件夹') : `${item.time} · ${item.size}` }}</span>
            <span v-if="item.ancestorPath" class="list-sub list-source">{{ item.ancestorPath }}</span>
          </div>
          <span v-if="!item.isFolder" class="list-ext" :style="{ color: extColor(item.ext), borderColor: extColor(item.ext) }">
            {{ item.ext }}
          </span>
          <!-- 单条目操作菜单入口（A-03）：原死控件接线；与网格角标同为 28px 圆形热区 -->
          <button class="list-more" @click.stop="emit('itemMenu', item)">
            <van-icon name="ellipsis" size="16" />
          </button>
        </div>
        <div v-if="items.length > 0" class="load-more-footer">
          <van-loading v-if="loading" size="18" />
          <button
            v-else-if="loadMoreFailed"
            class="load-more-retry"
            @click="emit('loadMoreRetry')"
          >
            {{ t('加载失败，点击重试') }}
          </button>
          <span v-else-if="!hasMore" class="load-more-text">没有更多了</span>
        </div>
      </div>
    </van-pull-refresh>

    <!-- ═══ 多选操作栏（A-19 全选/取消全选当前已加载页；操作项可横向滚动防溢出；权限门控禁用）═══ -->
    <div v-if="isSelectionMode && selected.size > 0" class="selection-bar">
      <span class="sel-count">{{ t('已选 {count} 项', { count: String(selected.size) }) }}</span>
      <button class="sel-select-all" @click="toggleSelectAll">
        <van-icon :name="allSelected ? 'checked' : 'circle'" size="14" />
        <span>{{ allSelected ? t('取消全选') : t('全选') }}</span>
      </button>
      <div class="sel-actions">
        <button
          v-for="a in selectionActions"
          :key="a.key"
          :class="['sel-action', { 'sel-del': a.danger, 'sel-disabled': a.disabled }]"
          :disabled="a.disabled"
          @click="onSelectionAction(a.key)"
        >
          {{ a.label }}
        </button>
      </div>
      <button class="sel-cancel" @click="exitSelectionMode" :aria-label="t('取消')">
        <van-icon name="close" size="18" />
      </button>
    </div>

    <!-- A-10 排序选项（subname 显示当前方向） -->
    <van-action-sheet
      v-model:show="showSortSheet"
      :title="t('排序')"
      :actions="sortSheetActions"
      @select="onSortSheetSelect"
    />
  </div>
</template>

<style scoped lang="scss">
.unified-list {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* A-15 下拉刷新：van-pull-refresh 作为列表滚动容器的外层（高度撑满剩余空间），
   真正的滚动仍由内部 .file-grid / .file-list 承接，无限滚动的 onScroll 监听不受影响。
   Vant 的 __track 只有 height:100% 不是 flex 容器，必须补成 flex column，
   否则内部滚动容器的 flex:1 失效、列表被 overflow:hidden 裁掉 */
.unified-list :deep(.van-pull-refresh) {
  flex: 1;
  min-height: 0;
}

.unified-list :deep(.van-pull-refresh__track) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ── 工具栏 ── */
.list-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 4px;
  flex: none;
}

.mode-toggle {
  display: flex;
  gap: 4px;
  flex: none;
}

.mode-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active {
    background: var(--bg-tertiary);
    color: var(--accent);
  }
}

/* ── 面包屑 ── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  font-size: 12px;
  overflow-x: auto;
  white-space: nowrap;
  flex: none;
  border-bottom: 0.5px solid var(--divider);
}

.crumb {
  color: var(--accent);
  cursor: pointer;

  &--last {
    color: var(--text-primary);
    cursor: default;
    font-weight: 600;
  }
}

.crumb-sep {
  color: var(--text-tertiary);
}

/* ── 加载态 ── */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
}

/* ── 空态 ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.empty-action {
  margin-top: 8px;
  padding: 8px 20px;
  border: 1px solid var(--accent);
  border-radius: 16px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
}

/* ── 网格模式 ── */
.file-grid {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 10px;
  /* min-width:0 让网格项保持在列宽内（长名称 nowrap 由 .grid-name 自身 ellipsis 裁切），
     不用 overflow:hidden——它会令自动行轨道只按 min-content 定高，把卡片压成一条 */
  min-width: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--divider);
  position: relative;
  padding: 8px;
  box-sizing: border-box;

  &--selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  &:active {
    opacity: 0.8;
  }
}

.grid-thumb {
  width: 100%;
  /* 4/3 横向缩略图：卡片更紧凑，图标不再占满整屏高 */
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  color: var(--text-tertiary);
  font-size: 32px;
  border-radius: 8px;
  overflow: hidden;

  &--file {
    position: relative;
    background: var(--bg-primary);
  }
}

.thumb-icon {
  position: relative;
  z-index: 0;
}

.thumb-img {
  position: absolute;
  /* 留出内边距：缩略图照片与文件夹图标视觉分量一致，不撑满整块 */
  inset: 16%;
  width: 68%;
  height: 68%;
  object-fit: contain;
  border-radius: inherit;
}

.grid-name {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  width: 100%;
}

.grid-meta {
  font-size: 10px;
  color: var(--text-tertiary);
  padding-bottom: 6px;
}

/* A-12 项目根卡片描述：2 行截断，浅色小字居中 */
.grid-desc {
  font-size: 10px;
  color: var(--text-tertiary);
  padding: 0 8px;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* A-12 项目根卡片成员数：与文件时间 meta 同风格，上留少量间距 */
.grid-meta--project {
  padding-top: 2px;
}

/* 来源徽章（回收站原位置路径）：浅色小字，不抢占名称的视觉分量 */
.grid-source {
  font-size: 10px;
  color: var(--text-tertiary);
  opacity: 0.75;
  padding: 0 8px 6px;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A-25 转换失败红标：红色小字 + × 图标，网格（居中）/清单（左对齐）通用 */
.failed-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 500;
  color: var(--danger);
}

/* ── 清单模式 ── */
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--divider);
  position: relative;

  &--selected {
    background: rgba(0, 169, 158, 0.06);
  }

  &:active {
    background: var(--list-hover);
  }
}

.list-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &--folder {
    background: rgba(255, 151, 106, 0.14);
    color: #ff976a;
  }

  &--file {
    background: rgba(0, 169, 158, 0.14);
    color: var(--accent);
  }
}

.list-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-sub {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* 来源徽章（回收站原位置路径）：第三行浅色小字，长路径 ellipsis 裁切 */
.list-source {
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-ext {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 2px 5px;
  border: 1px solid;
  border-radius: 3px;
  flex-shrink: 0;
}

.list-more {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

/* 网格模式单条目菜单角标（A-03）：顶/右 10px = 卡片 8px padding + 1px 缩略图内缩，
   整个热区落在黑框内，不再探出卡片/缩略图边界 */
.grid-more {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
}

/* ── 加载更多（无限滚动指示）── */
.load-more-footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 14px 0;
}

.load-more-text {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* A-14 加载更多失败重试条（列表已有内容时不出整页错误，只在这里出重试） */
.load-more-retry {
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 6px;

  &:active {
    opacity: 0.7;
  }
}

/* ── 多选操作栏 ──
   布局：[已选N项] [全选] [操作项…(可横向滚动)] [✕取消]
   操作项区 flex:1 + overflow-x:auto，窄屏下横向滚动而非撑破/裁切布局 */
.selection-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border-top: 0.5px solid var(--divider);
  gap: 10px;
  z-index: 10;
}

.sel-count {
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
  flex: none;
  white-space: nowrap;
}

/* A-19 全选/取消全选（当前已加载页） */
.sel-select-all {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  flex: none;
  white-space: nowrap;
}

.sel-actions {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  /* 隐藏横向滚动条（保留滚动能力），避免视觉噪音 */
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.sel-action {
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  padding: 4px 8px;
  flex: none;
  white-space: nowrap;
  border-radius: 6px;

  &.sel-del {
    color: #ff4444;
  }

  /* 权限/策略门控：禁用态弱化 + 不可点 */
  &.sel-disabled {
    color: var(--text-tertiary);
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.sel-cancel {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

/* ── 剪贴板粘贴条（Bug6）── */
.paste-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-secondary);
  border-bottom: 0.5px solid var(--divider);
}

.paste-bar-icon {
  color: var(--accent);
  flex-shrink: 0;
}

/* 文案区纵向堆叠：首行=已复制/剪切 N 项，次行（禁用时）=策略禁止原因 */
.paste-bar-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.paste-bar-text {
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 策略禁止原因：红色小字，不抢占首行视觉分量 */
.paste-bar-reason {
  min-width: 0;
  font-size: 11px;
  color: var(--danger, #ff4444);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paste-bar-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 14px;
  padding: 5px 14px;
  background: var(--accent, #00a99e);
  color: #fff;
  font-size: 13px;
  font-weight: 600;

  &--disabled {
    background: var(--bg-tertiary, rgba(0, 0, 0, 0.08));
    color: var(--text-tertiary);
  }
}

.paste-bar-clear {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 4px 6px;
}
</style>
