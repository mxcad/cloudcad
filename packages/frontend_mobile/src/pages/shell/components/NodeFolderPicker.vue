<script setup lang="ts">
/**
 * 文件夹选择底部弹窗（A-05 移动/复制目标选择 + 二期 g 跨项目）。
 *
 * 单根：从 rootId 开始逐级下钻（nodeControllerGetChildren 只取文件夹）。
 * 多根（roots）：顶部根切换器（个人空间 + 我的项目），切根即重置下钻——跨项目移动/复制用。
 * 面包屑回退；「选择当前文件夹」emit select 目标文件夹（带 rootId 供父组件判定目标域）。
 * excludeIds 中的文件夹（如正在移动/复制的源文件夹）不可被选为目标；
 * disabledReason 非空时（跨项目策略被拒）禁用确认并底部红字提示。
 */
import { ref, watch, computed } from 'vue'
import { nodeControllerGetChildren } from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'

const props = withDefaults(
  defineProps<{
    show: boolean
    rootId: string
    rootName: string
    excludeIds?: string[]
    /** 多根列表（二期 g 跨项目）：传了则显示根切换器 */
    roots?: Array<{ id: string; name: string }>
    /** 跨项目策略被拒原因（二期 g）：非空时禁用确认 + 底部红字 */
    disabledReason?: string
  }>(),
  {
    excludeIds: () => [],
    roots: () => [],
    disabledReason: '',
  }
)

const emit = defineEmits<{
  'update:show': [val: boolean]
  select: [folder: { id: string; name: string; rootId: string }]
  /** 切换目标根（二期 g）：父组件据此重算跨项目策略判定 */
  'root-change': [rootId: string]
}>()

const show = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
})

const isMultiRoot = computed(() => props.roots.length > 0)
// 当前选中的根（多根模式）；单根模式恒等于 props.rootId
const activeRootId = ref(props.rootId)
const activeRootName = computed(() =>
  isMultiRoot.value
    ? props.roots.find((r) => r.id === activeRootId.value)?.name ?? props.rootName
    : props.rootName
)

const currentId = ref<string | null>(null)
const crumbs = ref<Array<{ id: string; name: string }>>([])
const folders = ref<FileSystemNodeDto[]>([])
const loading = ref(false)

async function loadFolders() {
  const root = activeRootId.value
  if (!root) {
    folders.value = []
    return
  }
  loading.value = true
  try {
    const res = await nodeControllerGetChildren({
      path: { nodeId: currentId.value ?? root },
      query: { page: 1, limit: 100 },
    })
    if (res.error) return
    const nodes = (res.data?.nodes ?? []) as FileSystemNodeDto[]
    folders.value = nodes.filter((n) => n.isFolder || n.nodeType === 'FOLDER')
  } catch {
    folders.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      activeRootId.value = props.rootId
      currentId.value = null
      crumbs.value = []
      loadFolders()
    }
  }
)

function switchRoot(rootId: string) {
  if (rootId === activeRootId.value) return
  activeRootId.value = rootId
  currentId.value = null
  crumbs.value = []
  loadFolders()
  emit('root-change', rootId)
}

function enterFolder(f: FileSystemNodeDto) {
  crumbs.value = [...crumbs.value, { id: f.id, name: f.name }]
  currentId.value = f.id
  loadFolders()
}

function backTo(index: number) {
  if (index < 0) {
    currentId.value = null
    crumbs.value = []
  } else {
    currentId.value = crumbs.value[index].id
    crumbs.value = crumbs.value.slice(0, index)
  }
  loadFolders()
}

const currentFolderId = computed(() => currentId.value ?? activeRootId.value)
const currentFolderName = computed(() =>
  currentId.value ? crumbs.value[crumbs.value.length - 1]?.name ?? activeRootName.value : activeRootName.value
)
const isCurrentExcluded = computed(() => props.excludeIds.includes(currentFolderId.value))
const isDisabled = computed(() => isCurrentExcluded.value || !!props.disabledReason)

function onConfirm() {
  if (isDisabled.value) return
  emit('select', { id: currentFolderId.value, name: currentFolderName.value, rootId: activeRootId.value })
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '60%' }">
    <div class="picker-panel">
      <div class="picker-header">
        <span class="picker-title">{{ t('选择文件夹') }}</span>
        <van-icon name="cross" size="18" class="picker-close" @click="show = false" />
      </div>
      <!-- 二期 g 跨项目：目标根切换器（个人空间 + 我的项目） -->
      <div v-if="isMultiRoot" class="picker-roots">
        <button
          v-for="r in roots"
          :key="r.id"
          :class="['picker-root', { active: activeRootId === r.id }]"
          @click="switchRoot(r.id)"
        >
          {{ r.name }}
        </button>
      </div>
      <div class="picker-breadcrumb">
        <span class="crumb" :class="{ 'crumb--last': crumbs.length === 0 }" @click="backTo(-1)">
          {{ activeRootName }}
        </span>
        <template v-for="(c, i) in crumbs" :key="c.id">
          <span class="crumb-sep">›</span>
          <span class="crumb" :class="{ 'crumb--last': i === crumbs.length - 1 }" @click="backTo(i)">
            {{ c.name }}
          </span>
        </template>
      </div>
      <div class="picker-list">
        <div v-if="loading" class="picker-loading">
          <van-loading size="24" />
        </div>
        <div v-else-if="folders.length === 0" class="picker-empty">{{ t('暂无子文件夹') }}</div>
        <div v-for="f in folders" :key="f.id" class="picker-item" @click="enterFolder(f)">
          <van-icon name="bag-o" size="18" class="picker-item-icon" />
          <span class="picker-item-name">{{ f.name }}</span>
          <van-icon name="arrow" size="14" class="picker-item-arrow" />
        </div>
      </div>
      <div class="picker-footer">
        <!-- 二期 g 跨项目策略被拒：红字原因 + 确认禁用 -->
        <div v-if="disabledReason" class="picker-reason">{{ disabledReason }}</div>
        <button class="picker-confirm" :disabled="isDisabled" @click="onConfirm">
          {{ t('选择当前文件夹') }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.picker-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.picker-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.picker-close {
  color: var(--text-tertiary);
  cursor: pointer;
}

.picker-roots {
  display: flex;
  gap: 8px;
  padding: 0 16px 10px;
  overflow-x: auto;
}

.picker-root {
  flex-shrink: 0;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  cursor: pointer;

  &.active {
    color: var(--primary);
    border-color: var(--primary);
    font-weight: 600;
  }
}

.picker-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 16px 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.crumb {
  cursor: pointer;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--last {
    color: var(--text-primary);
    font-weight: 500;
  }
}

.crumb-sep {
  color: var(--text-tertiary);
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.picker-loading,
.picker-empty {
  display: flex;
  justify-content: center;
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;

  &:active {
    background: var(--bg-tertiary, rgba(0, 0, 0, 0.04));
  }
}

.picker-item-icon {
  color: #ff976a;
  flex-shrink: 0;
}

.picker-item-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-item-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.picker-footer {
  padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--divider);
}

.picker-reason {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--error, #ef4444);
  text-align: center;
}

.picker-confirm {
  width: 100%;
  height: 42px;
  border: none;
  border-radius: 21px;
  background: var(--accent, #00a99e);
  color: #fff;
  font-size: 15px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
