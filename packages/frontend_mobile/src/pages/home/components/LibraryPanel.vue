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
        </div>
        <div v-if="library.breadcrumbs.value.length > 0" class="breadcrumb">
          <span class="breadcrumb-item" @click="library.goBackTo(-1)">
            {{ library.rootName.value }}
          </span>
          <template v-for="(crumb, idx) in library.breadcrumbs.value" :key="crumb.id">
            <span class="breadcrumb-sep">›</span>
            <span
              class="breadcrumb-item"
              :class="{ 'breadcrumb-item--last': idx === library.breadcrumbs.value.length - 1 }"
              @click="idx < library.breadcrumbs.value.length - 1 ? library.goBackTo(idx) : undefined"
            >
              {{ crumb.name }}
            </span>
          </template>
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

      <!-- 错误 -->
      <div v-else-if="library.error.value" class="state-box">
        <span class="state-text">{{ library.error.value }}</span>
        <van-button size="small" round @click="retry">{{ t('重试') }}</van-button>
      </div>

      <!-- 空 -->
      <div v-else-if="library.isEmpty.value" class="state-box">
        <span class="state-text">{{ t('暂无内容') }}</span>
      </div>

      <!-- 网格 -->
      <div v-else class="item-grid">
        <div
          v-for="node in library.nodes.value"
          :key="node.id"
          class="grid-item"
          @click="onItemClick(node)"
          @touchstart="onTouchStart($event, node)"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
        >
          <div v-if="library.isFolder(node)" class="thumbnail thumbnail--folder">
            <van-icon name="folder-o" size="28" />
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
          <span class="item-name">{{ stripExt(node.name) }}</span>
        </div>
      </div>

      <!-- 加载更多 -->
      <div
        v-if="library.nodes.value.length > 0"
        ref="sentinelRef"
        class="load-more"
      >
        <van-loading v-if="library.loading.value" size="20" />
        <span v-else-if="!library.hasMore.value" class="load-more-text">{{ t('没有更多了') }}</span>
      </div>
    </div>
  </FloatingPopup>

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
import { showToast, showImagePreview } from 'vant'
import { t } from '@/languages'
import { MxFun } from 'mxdraw'
import FloatingPopup from '@/components/FloatingPopup.vue'
import { useLibrary, LibraryType } from '@/composables/useLibrary'
import { openMxWeb } from '@/plugins/mxcad/openMxWeb'
import { useEditorState } from '@/composables/useEditorState'
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
  closePreview()
  if (longPressTriggered.value) {
    longPressTriggered.value = false
    return
  }
  if (library.isFolder(node)) {
    library.enterFolder(node)
    return
  }

  if (props.libraryType === 'block') {
    // 图块 → 插入（LibraryPanel 保持打开，InsertBlockPopup 覆盖在上层）
    const filePath = getNodeFileUrl(node)
    MxFun.sendStringToExecute('Mx_Insert', {
      filePath,
      name: stripExt(node.name),
      isBlockLibrary: true,
    })
  } else {
    // 图纸 → 打开
    await openDrawing(node)
  }
}

async function openDrawing(node: FileSystemNodeDto) {
  const fileUrl = getNodeFileUrl(node)
  const editorState = useEditorState()

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
  return `/api/v1/library/${props.libraryType}/filesData/${node.path}?t=${Date.now()}`
}

// ── 长按预览 ──
// 只有持续按住足够久（明显长按）才弹出放大缩略图，避免点击/滚动时误触
const LONG_PRESS_THRESHOLD = 1000
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const longPressTriggered = ref(false)
const previewInstance = ref<any>(null)

function closePreview() {
  if (previewInstance.value) {
    try { previewInstance.value.close() } catch {}
    previewInstance.value = null
  }
}

function onTouchStart(_e: TouchEvent, node: FileSystemNodeDto) {
  if (library.isFolder(node)) return
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  closePreview()
  longPressTriggered.value = false
  longPressTimer.value = setTimeout(() => {
    longPressTriggered.value = true
    const url = library.getThumbnailUrl(node.id)
    previewInstance.value = showImagePreview({ images: [url], showIndex: false })
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

/* ── 面包屑 ── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  overflow-x: auto;
  white-space: nowrap;
}

.breadcrumb-item {
  color: var(--primary);
  cursor: pointer;

  &--last {
    color: var(--text-primary);
    cursor: default;
  }
}

.breadcrumb-sep {
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

.item-name {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
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
</style>

<style>
:global(.van-image-preview) {
  z-index: 2100 !important;
}
</style>
