<script setup lang="ts">
/**
 * 回收站视图（我的文件 / 项目详情页共用）—— 概念对齐 PC 回收站：
 *   回收站 = 当前上下文的视图，scope 由入口上下文决定（不再有手动选 scope 的下拉）：
 *     传 projectId       → project scope（项目详情页入口，项目子树已删条目）
 *     传 personalSpaceId → personal scope（个人空间 tab 入口，个人空间已删条目）
 *     都不传             → projects scope（项目列表 tab 入口，全局回收站：
 *                          已删项目根 + 可访问项目内已删条目 + 个人空间已删条目）
 *
 * 交互对齐 PC：
 *   - 顶行：上下文面包屑（项目名/个人空间 › 回收站）+ 共 N 项 + 清空回收站（危险色，有项才显示）
 *   - 列表项仅两个动作：恢复 / 彻底删除（点按出菜单，长按多选后批量）
 *   - 项展示 ancestorPath（原位置）；支持搜索 / 排序 / 文件格式筛选
 *   - 确认流：单条恢复 / 批量恢复 / 彻底删除 / 清空回收站（scope 专属文案，对齐 PC）
 *   - 动作成功后 emit('changed')，父页面关闭回收站时据此刷新文件列表
 *
 * scope 判定按「prop 是否传入」而非「值是否非空」：个人空间入口恒传
 * personalSpaceId（id 未就绪时为 null）——若按真值回退到 projects，id 未就绪
 * （或取数失败）时个人 tab 会误显示全局回收站，用户可能误清空全局回收站。
 */
import { ref, computed, watch } from 'vue'
import { showDialog, showConfirmDialog } from 'vant'
import { t } from '@/languages'
import { useTrashList, resolveTrashScope, type TrashScope } from '@/composables/useTrashList'
import { formatNodeAsItems } from '@/composables/useNodeFormatter'
import type { FileListItem } from '@/composables/useNodeFormatter'
import type { FileListFilters } from '@/composables/useUnifiedFileList'
import UnifiedFileList from './UnifiedFileList.vue'
import type { SelectionActionKey } from './UnifiedFileList.vue'
import FileFilterPopup from './FileFilterPopup.vue'

const props = withDefaults(
  defineProps<{
    /** project scope：项目详情页传路由 projectId */
    projectId?: string
    /** personal scope：个人空间 tab 传个人空间根 id */
    personalSpaceId?: string | null
    /** 面包屑前缀（项目名）；personal scope 固定显示「个人空间」，projects scope 无前缀 */
    scopeLabel?: string
  }>(),
  { projectId: undefined, personalSpaceId: undefined, scopeLabel: undefined },
)

const emit = defineEmits<{
  /** 恢复/彻底删除/清空成功后通知父页面（关闭回收站时刷新文件列表） */
  changed: []
}>()

// 按 prop 是否传入判定（非真值）：personal 入口恒传该 prop，id 未就绪时为 null，
// 此时仍应停留在 personal scope（load 会等 id 就绪再发请求），不得回退到全局回收站
const scope = computed<TrashScope>(() => resolveTrashScope(props.projectId, props.personalSpaceId))
const scopeName = computed(() =>
  scope.value === 'personal' ? t('个人空间') : props.scopeLabel ?? '',
)

const trashList = useTrashList(computed(() => props.personalSpaceId ?? null))

// 挂载即打开当前上下文的回收站（openTrash 总是触发加载）；
// 父页面按上下文 v-if 切换，props 变化时同步重开
watch(
  scope,
  (s) => {
    trashList.openTrash(s, props.projectId)
  },
  { immediate: true },
)

const items = computed(() => formatNodeAsItems(trashList.nodes.value))
const loading = computed(() => trashList.loading.value)
const hasMore = computed(() => trashList.hasMore.value)
const loadMoreFailed = computed(() => trashList.loadMoreFailed.value)
const sortBy = computed(() => trashList.sortBy.value)
const sortOrder = computed(() => trashList.sortOrder.value)
const total = computed(() => trashList.total.value)
const actionBusy = computed(() => trashList.actionBusy.value)

// 高级筛选：仅文件格式（回收站接口不支持大小/时间，避免误导）
const showFilterPopup = ref(false)
const filterActive = trashList.filterActive
function onFilterApply(filters: FileListFilters) {
  trashList.setFilters({ extension: filters.extension })
}

// 多选操作项：恢复 / 彻底删除（危险色）
const selectionActions = computed(() => [
  { key: 'restore' as const, label: t('恢复') },
  { key: 'permanentDelete' as const, label: t('彻底删除'), danger: true },
])

// 动作成功统一出口：通知父页面关闭回收站后刷新文件列表
function runAction(fn: () => Promise<void>) {
  return fn().then(() => emit('changed'))
}

function onSelectionAction(action: SelectionActionKey, list: FileListItem[]) {
  if (action === 'restore') {
    // 批量恢复加确认（对齐 PC trashActions.batchRestore）
    void showConfirmDialog({
      title: t('批量恢复'),
      message: t('确定要恢复选中的 {count} 个项目吗？', { count: String(list.length) }),
    })
      .then(() => void runAction(() => trashList.restoreBatch(list.map((i) => i.id))))
      .catch(() => {})
  } else if (action === 'permanentDelete') {
    void confirmPermanentDelete(list)
  }
}

// 单条目菜单：恢复 / 彻底删除（危险色）—— 回收站项仅此两动作（对齐 PC fileActionConfig）
const menuTarget = ref<FileListItem | null>(null)
const showMenuSheet = ref(false)
const menuActions = computed(() => [
  { name: t('恢复') },
  { name: t('彻底删除'), color: '#ee0a24' },
])

function onItemMenu(item: FileListItem) {
  menuTarget.value = item
  showMenuSheet.value = true
}

function onMenuAction(action: { name: string }) {
  showMenuSheet.value = false
  const target = menuTarget.value
  if (!target) return
  if (action.name === t('恢复')) {
    // 单条恢复加确认（对齐 PC trashActions.restore）
    void showConfirmDialog({
      title: t('确认恢复'),
      message: t('确定要恢复 "{name}" 吗？', { name: target.name }),
    })
      .then(() => void runAction(() => trashList.restore({ id: target.id, isRoot: target.isRoot })))
      .catch(() => {})
  } else if (action.name === t('彻底删除')) {
    void confirmPermanentDelete([target])
  }
}

// 彻底删除：强确认（危险色，说明不可恢复）
async function confirmPermanentDelete(list: FileListItem[]) {
  try {
    await showDialog({
      title: t('彻底删除'),
      message:
        list.length === 1
          ? t('确定彻底删除「{name}」？删除后不可恢复。', { name: list[0].name })
          : t('确定彻底删除 {count} 项？删除后不可恢复。', { count: String(list.length) }),
      showCancelButton: true,
      className: 'dialog-danger',
    })
  } catch {
    return
  }
  if (list.length === 1) {
    await runAction(() => trashList.permanentDelete({ id: list[0].id }))
  } else {
    await runAction(() => trashList.permanentDeleteBatch(list.map((i) => i.id)))
  }
}

// 清空回收站：作用范围与当前显示的列表一致，scope 专属文案（对齐 PC trashActions.clearTrash）
async function onClear() {
  const isScoped = scope.value !== 'projects'
  try {
    await showDialog({
      title: t('确认清空回收站'),
      message: isScoped
        ? t('确定要清空项目回收站吗？此操作将彻底删除所有已删除的文件和文件夹，且不可恢复。')
        : t('确定要清空回收站吗？此操作将彻底删除所有已删除的项目，且不可恢复。'),
      showCancelButton: true,
      className: 'dialog-danger',
    })
  } catch {
    return
  }
  await runAction(() => trashList.clear())
}
</script>

<template>
  <div class="trash-view">
    <!-- 上下文面包屑 + 项数 + 清空（危险色，有项才显示，对齐 PC 工具栏清空按钮） -->
    <div class="trash-head">
      <div class="trash-crumb">
        <span v-if="scopeName" class="trash-crumb-scope">{{ scopeName }}</span>
        <span v-if="scopeName" class="trash-crumb-sep">›</span>
        <span class="trash-crumb-current">{{ t('回收站') }}</span>
      </div>
      <div class="trash-head-right">
        <span class="trash-count">{{ t('共 {count} 项', { count: String(total) }) }}</span>
        <button v-if="total > 0" class="trash-clear" :disabled="actionBusy" @click="onClear">
          {{ t('清空回收站') }}
        </button>
      </div>
    </div>

    <UnifiedFileList
      domain="personal"
      :items="items"
      :loading="loading"
      :breadcrumb="[]"
      :has-more="hasMore"
      :load-more-failed="loadMoreFailed"
      :sort-by="sortBy"
      :sort-order="sortOrder"
      :show-fab="false"
      :empty-text="t('回收站是空的')"
      empty-icon="delete-o"
      :search-placeholder="t('搜索已删除的项目...')"
      :selection-actions="selectionActions"
      :filter-active="filterActive"
      @item-click="onItemMenu"
      @item-menu="onItemMenu"
      @selection-action="onSelectionAction"
      @search="trashList.setSearch"
      @filter="showFilterPopup = true"
      @load-more="trashList.loadMore"
      @load-more-retry="trashList.retryLoadMore"
      @refresh="trashList.refresh"
      @sort-change="trashList.setSort"
    />

    <!-- 回收站高级筛选：仅文件格式（回收站接口不支持大小/时间） -->
    <FileFilterPopup
      v-model:show="showFilterPopup"
      :sections="['extension']"
      @apply="onFilterApply"
    />

    <!-- 单条目操作菜单：恢复 / 彻底删除 -->
    <van-action-sheet
      v-model:show="showMenuSheet"
      :title="menuTarget?.name"
      :actions="menuActions"
      @select="onMenuAction"
    />
  </div>
</template>

<style scoped lang="scss">
.trash-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶行：面包屑（左）+ 项数/清空（右） */
.trash-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  flex: none;
}

.trash-crumb {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
}

.trash-crumb-scope {
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
}

.trash-crumb-sep {
  color: var(--text-tertiary);
}

.trash-crumb-current {
  color: var(--text-primary);
  font-weight: 600;
}

.trash-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.trash-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.trash-clear {
  border: none;
  background: transparent;
  color: var(--danger, #ff4444);
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 6px;

  &:active {
    opacity: 0.7;
  }

  &:disabled {
    opacity: 0.5;
  }
}
</style>
