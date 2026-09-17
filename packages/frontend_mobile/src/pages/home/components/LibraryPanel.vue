<template>
  <FloatingPopup
    ref="floatingPopupRef"
    v-model:show="innerShow"
    :title="title"
    :anchors="[100, 0.5, 0.95]"
    :initial-height-index="2"
    :draggable="true"
    :lazy-render="false"
    :preserve-height-on-reopen="props.preserveHeightOnReopen"
    @close="onClose"
  >
    <template #header-after>
      <div class="library-header">
        <div class="header-top">
          <div class="category-btn" @click="showCategoryPopup = true">
            <span class="category-label">{{ library.categoryLabel.value }}</span>
            <van-icon name="arrow-down" size="12" />
          </div>
          <van-search
            v-model="searchInput"
            class="header-search"
            :placeholder="t('搜索')"
            shape="round"
            @update:model-value="library.setSearch($event)"
          />
          <div
            class="refresh-btn"
            :class="{ 'refresh-btn--spinning': library.loading.value }"
            role="button"
            :aria-label="t('刷新')"
            @click="refresh"
          >
            <van-icon name="replay" size="16" />
          </div>
          <div
            v-if="canManage"
            class="refresh-btn"
            :class="{ 'refresh-btn--spinning': uploading }"
            role="button"
            :aria-label="t('上传')"
            @click="pickFiles"
          >
            <van-icon :name="uploading ? 'replay' : 'photo-o'" size="16" />
          </div>
        </div>
        <div class="header-meta">
          <span class="total-count">{{ t('共') }} {{ library.total.value }} {{ t('项') }}</span>
        </div>
      </div>
    </template>
    <!-- ═══ 列表 ═══ -->
    <div class="library-body">
      <!-- 加载中 -->
      <div v-if="library.loading.value && library.nodes.value.length === 0" class="state-box">
        <van-loading size="24" />
        <span class="state-text">{{ t('加载中...') }}</span>
      </div>

      <!-- 错误：仅当无数据时整页错误态；已有列表时保留列表并在底部「加载更多」处重试 -->
      <div v-else-if="library.error.value && library.nodes.value.length === 0" class="state-box">
        <span class="state-text">{{ library.error.value }}</span>
        <van-button size="small" round @click="retry">{{ t('重试') }}</van-button>
      </div>

      <!-- 空 -->
      <div v-else-if="library.isEmpty.value" class="state-box">
        <span class="state-text">{{ t('暂无内容') }}</span>
        <van-button
          v-if="canManage && !selecting"
          size="small"
          round
          type="primary"
          @click="pickFiles"
        >
          {{ t('上传图纸') }}
        </van-button>
      </div>

      <!-- 网格 -->
      <div v-else class="item-grid">
        <div
          v-for="node in library.nodes.value"
          :key="node.id"
          class="grid-item"
          :class="{
            'grid-item--active': isActive(node),
            'grid-item--selected': isSelected(node),
          }"
          @click="onItemClick(node)"
          @touchstart="onTouchStart($event, node)"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
        >
          <van-icon
            v-if="selecting"
            class="select-mark"
            :name="isSelected(node) ? 'checked' : 'circle'"
            size="20"
          />
          <div v-if="library.isFolder(node)" class="thumbnail thumbnail--folder">
            <van-icon name="bag-o" size="28" />
          </div>
          <div v-else-if="failedImages[node.id]" class="thumbnail thumbnail--file">
            <van-icon name="description" size="28" />
          </div>
          <img
            v-else
            class="thumbnail"
            :src="library.getThumbnailUrl(node.id)"
            loading="lazy"
            @error="onImgError($event, node.id)"
          />
          <div class="item-meta">
            <span class="item-name">{{ stripExt(node.name) }}</span>
            <span v-if="formatDate(node.updatedAt)" class="item-date">{{ formatDate(node.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 加载更多 -->
      <div
        v-if="library.nodes.value.length > 0"
        ref="sentinelRef"
        class="load-more"
      >
        <van-loading v-if="library.loading.value" size="20" />
        <!-- 分页失败：保留已有列表，只在这一行给重试入口 -->
        <button v-else-if="library.error.value" class="load-more-retry" @click="library.retryLoadMore">
          <van-icon name="replay" size="14" />
          {{ t('加载失败，点击重试') }}
        </button>
        <span v-else-if="!library.hasMore.value" class="load-more-text">{{ t('没有更多了') }}</span>
      </div>
    </div>

    <!-- ═══ 多选操作栏（E-11） ═══ -->
    <template #footer>
      <div v-if="selecting" class="select-bar">
        <button class="select-bar-btn" @click="exitSelection">{{ t('取消') }}</button>
        <span class="select-bar-count">
          {{ t('已选 {count} 项', { count: String(selectedNodes.length) }) }}
        </span>
        <button class="select-bar-btn" @click="toggleSelectAll">
          {{ allSelected ? t('取消全选') : t('全选') }}
        </button>
        <button class="select-bar-btn select-bar-btn--primary" @click="openActionSheet">
          {{ t('操作') }}
        </button>
      </div>
    </template>
  </FloatingPopup>

  <!-- 上传用隐藏 file input（E-08） -->
  <input
    ref="fileInputRef"
    type="file"
    class="file-input-hidden"
    multiple
    :accept="UPLOAD_ACCEPT"
    @change="onFilesPicked"
  />

  <!-- ═══ 条目操作（E-10/E-11/E-13） ═══ -->
  <van-action-sheet
    v-model:show="showActionSheet"
    :actions="actionSheetActions"
    :cancel-text="t('关闭')"
    @select="onActionSheetSelect"
    @cancel="showActionSheet = false"
  />

  <!-- ═══ 重命名（E-10） ═══ -->
  <van-popup v-model:show="showRename" position="bottom" round>
    <div class="rename-popup">
      <div class="rename-popup-title">{{ t('重命名') }}</div>
      <van-field
        v-model="renameText"
        :label="t('名称')"
        :placeholder="t('请输入名称')"
        maxlength="100"
        clearable
      />
      <div class="rename-popup-actions">
        <button class="select-bar-btn" @click="showRename = false">{{ t('取消') }}</button>
        <button
          class="select-bar-btn select-bar-btn--primary"
          :disabled="!renameText.trim()"
          @click="confirmRename"
        >
          {{ t('确定') }}
        </button>
      </div>
    </div>
  </van-popup>

  <!-- ═══ 分类级联选择 ═══ -->
  <van-popup
    v-model:show="showCategoryPopup"
    position="bottom"
    :style="{ height: '50%' }"
    round
  >
    <div class="category-popup">
      <div class="category-popup-header">
        <span class="category-popup-title">{{ t('选择分类') }}</span>
        <van-icon name="cross" size="18" @click="showCategoryPopup = false" />
      </div>
      <div class="category-levels">
        <div
          v-for="(level, li) in library.categories.value"
          :key="li"
          class="category-column"
        >
          <div class="category-column-title">L{{ li + 1 }}</div>
          <div class="category-column-list">
            <div
              v-for="item in filteredCategoryItems(li)"
              :key="item.id"
              class="category-item"
              :class="{ 'category-item--active': library.selectedPath.value[li] === item.id }"
              @click="onSelectCategory(li, item.id)"
            >
              {{ item.name }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { showToast, showLoadingToast, closeToast, showImagePreview, showConfirmDialog } from 'vant'

// Vant 的 ActionSheetAction 未从 'vant' 根导出（只在 lib/action-sheet 内部），
// 且 van-action-sheet 用 name 字段（van-popover 用 text），故在此按实际使用字段声明
interface LibraryActionItem {
  name: string
  color?: string
}
import { t } from '@/languages'
import { MxFun } from 'mxdraw'
import FloatingPopup from '@/components/FloatingPopup.vue'
import { useLibrary, LibraryType } from '@/composables/useLibrary'
import { openMxWeb } from '@/plugins/mxcad/openMxWeb'
import { useEditorState } from '@/composables/useEditorState'
import { useSave } from '@/composables/useSave'
import { useUser } from '@/composables/useUser'
import { PERMISSIONS, canExportDownloadGate } from '@/services/permissionService'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'
import { calculateFileHash } from '@/utils/hashUtils'
import { uploadFile } from '@/services/mobileUploadService'
import {
  buildLibraryFileUrl,
  renameLibraryNode,
  deleteLibraryNode,
  batchDeleteLibraryNodes,
  downloadLibraryNode,
} from '@/services/libraryOperationService'
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'

const props = withDefaults(
  defineProps<{
    show?: boolean
    libraryType: LibraryType
    preserveHeightOnReopen?: boolean
  }>(),
  {
    show: false,
  }
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'close'): void
}>()

const innerShow = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const floatingPopupRef = ref<InstanceType<typeof FloatingPopup>>()

const library = useLibrary(props.libraryType)
const { save: saveAction } = useSave()
const editorState = useEditorState()
const { user, hasPermission } = useUser()
const { config: runtimeConfig } = useRuntimeConfig()

// ── 库管理权限：上传/重命名/删除/下载等写操作统一门控 ──
const canManage = computed(() =>
  hasPermission(
    props.libraryType === 'drawing'
      ? PERMISSIONS.LIBRARY_DRAWING_MANAGE
      : PERMISSIONS.LIBRARY_BLOCK_MANAGE,
  ),
)

// ── 当前打开文件（高亮当前图纸） ──
const currentFileId = computed(() => editorState.state.fileId ?? '')
function isActive(node: FileSystemNodeDto): boolean {
  return !!node.id && currentFileId.value === node.id
}

// ── 搜索 ──
const searchInput = ref('')

// ── 分类弹窗 ──
const showCategoryPopup = ref(false)

// 根据上级选择过滤当前级分类
function filteredCategoryItems(level: number) {
  const levelData = library.categories.value[level]
  if (!levelData) return []
  if (level === 0) return levelData.items
  // level > 0: 过滤 parentId
  const parentId = library.selectedPath.value[level - 1]
  if (parentId === 'all') return levelData.items
  return levelData.items.filter((item) => item.parentId === parentId || item.id === 'all')
}

function onSelectCategory(level: number, categoryId: string) {
  library.selectCategory(level, categoryId)
  showCategoryPopup.value = false
}

// ── 无限滚动 ──
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

watch(
  () => sentinelRef.value,
  (el) => {
    if (observer) observer.disconnect()
    if (!el) return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          library.loadMore()
        }
      },
      { rootMargin: '100px' }
    )
    observer.observe(el)
  }
)

onUnmounted(() => {
  observer?.disconnect()
})

// ── 项目点击 ──
async function onItemClick(node: FileSystemNodeDto) {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  if (longPressTriggered.value) {
    longPressTriggered.value = false
    return
  }
  if (library.isFolder(node)) {
    library.enterFolder(node)
    return
  }

  // 多选态：短按即勾选/取消勾选，不打开文件
  if (selecting.value) {
    toggleSelect(node)
    return
  }

  if (props.libraryType === 'block') {
    // 图块 → 插入：抽屉收缩到最低让画布可见（用户能看到块插入位置），抽屉仍可拖回继续选块
    const filePath = getNodeFileUrl(node)
    MxFun.sendStringToExecute('Mx_Insert', {
      filePath,
      name: stripExt(node.name),
      isBlockLibrary: true,
    })
    floatingPopupRef.value?.snapTo(0)
  } else {
    // 图纸 → 打开
    await openDrawing(node)
  }
}

async function openDrawing(node: FileSystemNodeDto) {
  const fileUrl = getNodeFileUrl(node)

  // 未保存更改确认（E-22）：与 home/index.vue handleNewFile 同模式，
  // 确认须在 reset() 之前（reset 会清 isModified）
  if (editorState.state.isModified) {
    try {
      await showConfirmDialog({
        title: t('未保存的更改'),
        message: t('当前图纸有未保存的更改，是否保存？'),
        confirmButtonText: t('保存'),
        cancelButtonText: t('不保存'),
      })
      try {
        const success = await saveAction()
        if (!success) return
      } catch {
        return
      }
    } catch {
      // 用户选「不保存」→ 放弃修改继续打开
      editorState.setIsModified(false)
    }
  }

  // 拿到链接 → 抽屉收缩到最低
  floatingPopupRef.value?.snapTo(0)
  await nextTick()

  editorState.reset()
  editorState.setLoading(true)
  const ok = await openMxWeb(fileUrl)
  editorState.setLoading(false)

  if (ok) {
    editorState.setIsActive(true)
    editorState.setFileName(stripExt(node.name))
    editorState.setLibraryKey(props.libraryType)
    // 记录当前文件 id 与版本戳：库列表据此高亮当前图纸，保存/分享据此定位节点
    editorState.setFileId(node.id)
    if (node.updatedAt) editorState.setUpdatedAt(node.updatedAt)
    // 成功 → 重置记忆高度 → 关闭抽屉
    floatingPopupRef.value?.resetPreservedHeight()
    innerShow.value = false
  } else {
    showToast(t('打开图纸失败'))
    // 失败 → 展开到最高
    floatingPopupRef.value?.snapTo(2)
  }
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function getNodeFileUrl(node: FileSystemNodeDto): string {
  if (!node.path) return ''
  return buildLibraryFileUrl(props.libraryType, node.path, node.updatedAt)
}

// ── 多选（E-11） ──
const selecting = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const selectedNodes = computed(() =>
  library.nodes.value.filter((node) => selectedIds.value.has(node.id)),
)
const allSelected = computed(
  () => library.nodes.value.length > 0 && selectedNodes.value.length === library.nodes.value.length,
)

function isSelected(node: FileSystemNodeDto): boolean {
  return selectedIds.value.has(node.id)
}

function enterSelection(node: FileSystemNodeDto) {
  if (!selecting.value) {
    selectedIds.value = new Set()
    selecting.value = true
  }
  const next = new Set(selectedIds.value)
  next.add(node.id)
  selectedIds.value = next
}

function toggleSelect(node: FileSystemNodeDto) {
  const next = new Set(selectedIds.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  selectedIds.value = next
  if (next.size === 0) exitSelection()
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(library.nodes.value.map((node) => node.id))
}

function exitSelection() {
  selecting.value = false
  selectedIds.value = new Set()
}

// ── 长按进入多选 ──
// 只有持续按住足够久（明显长按）才进入多选，避免点击/滚动时误触。
// 已在多选态时长按无意义（短按即可勾选），不再计时。
const LONG_PRESS_THRESHOLD = 800
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const longPressTriggered = ref(false)

function onTouchStart(_e: TouchEvent, node: FileSystemNodeDto) {
  if (library.isFolder(node) || selecting.value) return
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  longPressTriggered.value = false
  longPressTimer.value = setTimeout(() => {
    longPressTriggered.value = true
    enterSelection(node)
  }, LONG_PRESS_THRESHOLD)
}

function onTouchMove() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

function onTouchEnd() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

// ── 图片加载失败 → 显示文件类型图标 ──
const failedImages = ref<Record<string, boolean>>({})

function onImgError(_e: Event, nodeId: string) {
  failedImages.value[nodeId] = true
}

// ── 重试 ──
function retry() {
  library.page.value = 1
  library.loadNodes()
}

// ── 上传（E-08） ──
const UPLOAD_ACCEPT =
  '.dwg,.dxf,.dxl,.3ds,.x_t,.sat,.iges,.igs,.step,.stp,.smt,.dwt,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.tif,.pdf'
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function pickFiles() {
  if (!canManage.value) {
    showToast(t('当前角色无权管理此库'))
    return
  }
  fileInputRef.value?.click()
}

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return

  const parentId = library.resolveCategoryNodeId()
  if (!parentId) {
    showToast(t('当前分类不可用'))
    return
  }

  uploading.value = true
  let okCount = 0
  for (const file of files) {
    try {
      const hash = await calculateFileHash(file)
      await uploadFile({ file, hash, nodeId: parentId })
      okCount++
    } catch (err) {
      console.error('[LibraryPanel] upload failed:', file.name, err)
    }
  }
  uploading.value = false

  if (okCount > 0) {
    showToast(t('已上传 {count} 个文件', { count: String(okCount) }))
    library.page.value = 1
    library.loadNodes()
  } else {
    showToast(t('上传失败'))
  }
}

// ── 条目操作（E-10 / E-11 / E-13） ──
const showActionSheet = ref(false)
const showRename = ref(false)
const renameText = ref('')
let renameTarget: FileSystemNodeDto | null = null

function openActionSheet() {
  if (selectedNodes.value.length === 0) return
  showActionSheet.value = true
}

const actionSheetActions = computed<LibraryActionItem[]>(() => {
  const single = selectedNodes.value.length === 1 ? selectedNodes.value[0] : null
  const actions: LibraryActionItem[] = []

  if (single) {
    actions.push({ name: t('预览') })
    actions.push({ name: t('下载原格式') })
    if (canExportDownloadGate(user.value, runtimeConfig.value.freeExportDownloadEnabled)) {
      actions.push(
        { name: t('导出 PDF') },
        { name: t('导出 DWG') },
        { name: t('导出 DXF') },
      )
    }
  } else {
    actions.push({ name: t('下载所选') })
  }

  if (single && canManage.value) actions.push({ name: t('重命名') })
  if (canManage.value) {
    actions.push({
      name: selectedNodes.value.length > 1 ? t('删除所选') : t('删除'),
      color: '#ee0a24',
    })
  }
  return actions
})

async function onActionSheetSelect(action: LibraryActionItem) {
  showActionSheet.value = false
  const single = selectedNodes.value.length === 1 ? selectedNodes.value[0] : null
  const name = action.name

  if (name === t('预览')) {
    if (single) showImagePreview({ images: [library.getThumbnailUrl(single.id)], showIndex: false })
    return
  }

  if (name === t('下载原格式')) {
    if (!single) return
    await downloadLibraryNode(props.libraryType, single.id, single.name, 'mxweb')
    return
  }

  if (name === t('导出 PDF') || name === t('导出 DWG') || name === t('导出 DXF')) {
    if (!single) return
    if (!canExportDownloadGate(user.value, runtimeConfig.value.freeExportDownloadEnabled)) return
    await downloadLibraryNode(
      props.libraryType,
      single.id,
      single.name,
      name === t('导出 PDF') ? 'pdf' : name === t('导出 DWG') ? 'dwg' : 'dxf',
    )
    return
  }

  if (name === t('下载所选')) {
    const nodes = selectedNodes.value
    showLoadingToast({ message: t('正在下载 {count} 个文件', { count: String(nodes.length) }), forbidClick: true })
    const results = await Promise.all(
      nodes.map((node) =>
        downloadLibraryNode(props.libraryType, node.id, node.name, 'mxweb', undefined, true),
      ),
    )
    closeToast()
    const failed = results.filter((ok) => !ok).length
    showToast(
      failed === 0
        ? t('已下载 {count} 个文件', { count: String(nodes.length) })
        : t('已下载 {ok} 个，{fail} 个失败', {
            ok: String(nodes.length - failed),
            fail: String(failed),
          }),
    )
    exitSelection()
    return
  }

  if (name === t('重命名')) {
    if (!single) return
    renameTarget = single
    renameText.value = stripExt(single.name)
    showRename.value = true
    return
  }

  if (name === t('删除') || name === t('删除所选')) {
    await confirmDelete()
  }
}

async function confirmDelete() {
  const nodes = selectedNodes.value
  if (nodes.length === 0) return
  try {
    await showConfirmDialog({
      title: nodes.length > 1 ? t('删除所选') : t('删除'),
      message:
        nodes.length > 1
          ? t('确定删除 {count} 个文件？删除后不可恢复。', { count: String(nodes.length) })
          : t('确定删除「{name}」？删除后不可恢复。', { name: nodes[0]?.name ?? '' }),
      confirmButtonText: t('删除'),
      cancelButtonText: t('取消'),
    })
  } catch {
    return
  }

  if (nodes.length === 1) {
    const ok = await deleteLibraryNode(props.libraryType, nodes[0].id)
    if (ok) refresh()
  } else {
    const ids = nodes.map((node) => node.id)
    const result = await batchDeleteLibraryNodes(props.libraryType, ids)
    if (result) {
      if (result.failedCount > 0) {
        showToast(t('已删除 {ok} 个，{fail} 个失败', {
          ok: String(result.successCount),
          fail: String(result.failedCount),
        }))
      } else {
        showToast(t('已删除 {count} 个文件', { count: String(ids.length) }))
      }
      refresh()
    }
  }
  exitSelection()
}

async function confirmRename() {
  const node = renameTarget
  const name = renameText.value.trim()
  if (!node || !name) return
  showRename.value = false
  const ok = await renameLibraryNode(props.libraryType, node.id, name)
  if (ok) refresh()
}


// ── 刷新（重拉分类 + 列表，对齐 CAD 侧边栏刷新语义）──
function refresh() {
  library.page.value = 1
  library.fetchRootAndCategories().then(() => library.loadNodes())
}

// ── 日期格式化（同年 MM-DD，跨年 YYYY-MM-DD）──
function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return sameYear ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`
}

// ── 标题 ──
const title = computed(() =>
  props.libraryType === 'drawing' ? t('图纸库') : t('图块库')
)

// ── 生命周期 ──
function onClose() {
  innerShow.value = false
  emit('close')
}

watch(
  () => props.show,
  async (val) => {
    if (val) {
      await library.fetchRootAndCategories()
      await library.loadNodes()
    }
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
/* ── 头部 ── */
.library-header {
  padding: var(--space-sm) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
}

.header-top {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.category-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}

.category-label {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-search {
  flex: 1;
  padding: 0;
}

/* ── 刷新按钮 ── */
.refresh-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;

  &:active {
    background: var(--bg-elevated);
  }

  &--spinning :deep(.van-icon) {
    animation: library-refresh-spin 0.8s linear infinite;
  }
}

@keyframes library-refresh-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── 总数 ── */
.header-meta {
  display: flex;
  align-items: center;
}

.total-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ── 列表 ── */
.library-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-lg);
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.state-text {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

/* ── 网格 ── */
.item-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.grid-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);

  &:active {
    opacity: 0.7;
  }

  /* 当前打开的图纸 */
  &--active {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  /* 多选已勾选 */
  &--selected {
    border-color: var(--primary);
    background: rgba(16, 174, 165, 0.08);
  }
}

.select-mark {
  position: absolute;
  top: 6px;
  right: 6px;
  color: var(--primary);
  z-index: 2;
}

.thumbnail {
  width: 100px;
  height: 100px;
  object-fit: cover;
  background: var(--bg-color);

  &--folder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
  }

  &--file {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated);
    color: var(--text-tertiary);
  }
}

.item-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
}

.item-name {
  max-width: 100%;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.item-date {
  font-size: 10px;
  color: var(--text-tertiary);
  line-height: 1;
}

/* ── 加载更多 ── */
.load-more {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 0;
}

.load-more-text {
  font-size: 12px;
  color: var(--text-tertiary);
}

.load-more-retry {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--warning, #ee0a24);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}

/* ── 分类弹窗 ── */
.category-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.category-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.category-popup-title {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
}

.category-popup-header :deep(.van-icon-cross) {
  color: var(--text-primary);
}

.category-levels {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.category-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);

  &:last-child {
    border-right: none;
  }
}

.category-column-title {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-align: center;
  border-bottom: 1px solid var(--border-color);
}

.category-column-list {
  flex: 1;
  overflow-y: auto;
}

.category-item {
  padding: 10px 12px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);

  &:active {
    background: var(--bg-elevated);
  }

  &--active {
    color: var(--primary);
    font-weight: 600;
    background: var(--bg-elevated);
  }
}

/* ── 多选操作栏（E-11） ── */
.select-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-color);
}

.select-bar-count {
  flex-shrink: 0;
  padding: 0 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* 次级按钮：多选栏与重命名弹窗共用 */
.select-bar-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;

  &:active {
    background: var(--bg-secondary, rgba(255, 255, 255, 0.06));
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--primary {
    color: #fff;
    background: var(--primary);
    border-color: var(--primary);

    &:active {
      opacity: 0.85;
      background: var(--primary);
    }
  }
}

/* ── 重命名弹窗（E-10） ── */
.rename-popup {
  padding: var(--space-md) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom));
}

.rename-popup-title {
  margin-bottom: var(--space-md);
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

.rename-popup-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

/* ── 上传用隐藏 file input（E-08） ── */
.file-input-hidden {
  display: none;
}
</style>

<style>
:global(.van-image-preview) {
  z-index: 2100 !important;
}
</style>
