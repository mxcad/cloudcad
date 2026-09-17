<script setup lang="ts">
/**
 * 移动端 App 壳 —— PersistentEditorShell（M1 实施）
 *
 * 架构：
 *  - 编辑器根（Home）恒渲染不卸载，由路由容器 App.vue 挂载
 *  - 子页通过 <router-view> 门控渲染，带 page-slide 右滑转场
 *  - 壳顶栏（44px）+ 编辑器原顶栏分两条（T1 定案 A）
 *  - 「+」按钮 → 底部 action sheet（T7 定案）
 *
 * 栈同步：useShellStack 从 router.currentRoute 同步，不手动维护。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useShellStack } from '../../stores/shellStack'
import Home from '../home/index.vue'
import FileBrowserPage from './sub-pages/FileBrowserPage.vue'
import ProfilePage from './sub-pages/ProfilePage.vue'
import ShareManagePage from './sub-pages/ShareManagePage.vue'
import ProjectDetailPage from './sub-pages/ProjectDetailPage.vue'
import LibraryPanel from '../home/components/LibraryPanel.vue'
import type { LibraryType } from '../../composables/useLibrary'

interface SheetItem {
  name: string
  icon: string
  route?: string
}

const SHEET_ITEMS: SheetItem[] = [
  { name: '文件', icon: 'folder-o', route: '/shell/file' },
  { name: '分享', icon: 'share-o', route: '/shell/share' },
  { name: '我的', icon: 'user-o', route: '/shell/profile' },
]

const route = useRoute()
const router = useRouter()
const store = useShellStack()

// 由 store 驱动的子页名称
const topPage = computed(() => store.topPage)
const hasSubpage = computed(() => store.hasSubpage)

// 路由变化时同步栈状态
watch(
  () => route.path,
  () => store.syncFromRoute(route.path),
  { immediate: true }
)

// ── 图纸库/图块库抽屉 ──
const libraryOpen = ref(false)
const libraryType = ref<LibraryType | null>(null)

function openLibrary(type: LibraryType) {
  libraryType.value = type
  libraryOpen.value = true
  showSheet.value = false
}

function closeLibrary() {
  libraryOpen.value = false
  libraryType.value = null
}

function pushRoute(target: string) {
  showSheet.value = false
  router.push(target)
}

function onSheetSelect(action: SheetItem) {
  if (action.route) pushRoute(action.route)
}

function pop() {
  router.back()
}

const showSheet = ref(false)

function openSheet() {
  showSheet.value = true
}
function closeSheet() {
  showSheet.value = false
}

/**
 * M7 壳模式命令重定向：编辑器命令（库/打开图纸）通过 mxcad-shell-navigate 事件
 * 通知壳导航到对应子页，而非在编辑器内打开面板。
 * 库例外：抽屉浮在画布上，不占路由。
 */
function handleShellNavigate(e: Event) {
  const target = (e as CustomEvent).detail as string
  if (target && target.startsWith('/shell/library/')) {
    openLibrary(target.endsWith('/block') ? 'block' : 'drawing')
    return
  }
  if (target && target.startsWith('/shell')) {
    router.push(target)
  }
}

onMounted(() => {
  window.addEventListener('mxcad-shell-navigate', handleShellNavigate)
})

onUnmounted(() => {
  window.removeEventListener('mxcad-shell-navigate', handleShellNavigate)
})

/**
 * 向编辑器暴露壳的路由器，供编辑器菜单在壳模式下跳转到壳子页。
 * 编辑器侧（home/index.vue）通过 ref 读取此值执行 router.push。
 */
defineExpose({
  getShellRouter() {
    return router
  },
})
</script>

<template>
  <div class="shell">
    <header v-show="!hasSubpage" class="shell-topbar">
      <span class="shell-spacer" aria-hidden="true" />
      <h1 class="shell-title">CloudCAD</h1>
      <nav class="shell-entries">
        <button class="entry-plus" aria-label="更多" @click="openSheet">
          <van-icon name="plus" size="24" />
        </button>
      </nav>
    </header>

    <div class="editor-root">
      <Home />
    </div>

    <!-- 图纸库/图块库：FloatingPopup 可拖拽抽屉，浮在 CAD 画布上（沿用旧 LibraryPanel 的展示方式），
         不占路由子页，画布保持可见可交互 -->
    <LibraryPanel
      v-if="libraryType"
      :key="libraryType"
      v-model:show="libraryOpen"
      :library-type="libraryType"
      preserve-height-on-reopen
      @close="closeLibrary"
    />

    <transition name="page-slide">
      <div v-if="hasSubpage" class="subpage-overlay">
        <router-view :key="route.fullPath" />
      </div>
    </transition>

    <van-action-sheet
      v-model:show="showSheet"
      :actions="SHEET_ITEMS"
      :close-on-click-overlay="true"
      @select="onSheetSelect"
      @cancel="closeSheet"
    >
      <template #title>
        <div class="sheet-title">导航</div>
      </template>
    </van-action-sheet>
  </div>
</template>

<style lang="scss">
:root {
  --bg-primary: #000000;
  --bg-secondary: #161616;
  --bg-tertiary: #1f1f1f;
  --text-primary: #f2f2f2;
  --text-secondary: #c8c8c8;
  --text-tertiary: #8e8e8e;
  --divider: rgba(255, 255, 255, 0.08);
  --divider-soft: rgba(255, 255, 255, 0.06);
  --icon-muted: #8e8e8e;
  --list-hover: rgba(255, 255, 255, 0.06);
  --accent: #00a99e;
}

:root {
  --van-primary-color: #00a99e !important;
  --van-success-color: #00a99e !important;
  --van-danger-color: #ff4444 !important;
  --van-warning-color: #ff976a !important;
  --van-background: var(--bg-primary) !important;
  --van-background-2: var(--bg-secondary) !important;
  --van-background-3: var(--bg-tertiary) !important;
  --van-text-color: var(--text-primary) !important;
  --van-text-color-2: var(--text-secondary) !important;
  --van-text-color-3: var(--text-tertiary) !important;
  --van-border-color: var(--divider) !important;
  --van-active-color: var(--list-hover) !important;
  --van-nav-bar-background: var(--bg-primary) !important;
  --van-nav-bar-title-font-size: 17px !important;
  --van-nav-bar-icon-color: var(--text-primary) !important;
  --van-nav-bar-text-color: var(--text-primary) !important;
  --van-nav-bar-height: 44px !important;
  --van-cell-background: transparent !important;
  --van-cell-border-color: var(--divider-soft) !important;
  --van-cell-font-size: 15px !important;
  --van-cell-line-height: 24px !important;
  --van-cell-label-color: var(--text-tertiary) !important;
  --van-cell-group-inset-border-radius: 12px !important;
  --van-cell-group-inset-padding: 0 12px !important;
  --van-tabbar-height: 50px !important;
  --van-tabs-bottom-bar-color: #00a99e !important;
  --van-tabs-bottom-bar-width: 28px !important;
  --van-tab-active-text-color: var(--text-primary) !important;
  --van-tab-text-color: var(--text-tertiary) !important;
  --van-search-background: var(--bg-secondary) !important;
  --van-search-content-background: var(--bg-secondary) !important;
  --van-search-input-text-color: var(--text-primary) !important;
  --van-search-input-icon-color: var(--text-tertiary) !important;
  --van-tag-default-color: var(--text-tertiary) !important;
  --van-action-sheet-background: var(--bg-secondary) !important;
  --van-action-sheet-text-color: var(--text-primary) !important;
  --van-action-sheet-cancel-color: var(--text-tertiary) !important;
}
</style>

<style scoped lang="scss">
.shell {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.shell-topbar {
  flex: none;
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: var(--bg-primary);
  border-bottom: 0.5px solid var(--divider);
  z-index: 60;
}

.shell-spacer {
  width: 48px;
}

.shell-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--text-primary);
}

.shell-entries {
  display: flex;
  gap: 2px;
  width: 48px;
  justify-content: flex-end;
}

.entry-plus {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 24px;

  &:active {
    background: var(--list-hover);
  }
}

.editor-root {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;

  :deep(.mxCanvasBox) {
    height: 100% !important;
  }
}

.subpage-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: var(--bg-primary);
  will-change: transform;
}

.page-slide-enter-active,
.page-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.page-slide-enter-from,
.page-slide-leave-to {
  transform: translateX(100%);
}

.sheet-title {
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  padding: 6px 0;
}
</style>
