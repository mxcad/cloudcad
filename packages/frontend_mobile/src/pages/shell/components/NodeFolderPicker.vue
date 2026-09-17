<script setup lang="ts">
/**
 * 文件夹选择底部弹窗（A-05 移动/复制目标选择）。
 *
 * 从 rootId 开始逐级下钻（nodeControllerGetChildren 只取文件夹），
 * 面包屑回退；「选择当前文件夹」emit select 目标文件夹。
 * excludeIds 中的文件夹（如正在移动/复制的源文件夹）不可被选为目标。
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
  }>(),
  {
    excludeIds: () => [],
  }
)

const emit = defineEmits<{
  'update:show': [val: boolean]
  select: [folder: { id: string; name: string }]
}>()

const show = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
})

const currentId = ref<string | null>(null)
const crumbs = ref<Array<{ id: string; name: string }>>([])
const folders = ref<FileSystemNodeDto[]>([])
const loading = ref(false)

async function loadFolders() {
  if (!props.rootId) {
    folders.value = []
    return
  }
  loading.value = true
  try {
    const res = await nodeControllerGetChildren({
      path: { nodeId: currentId.value ?? props.rootId },
      query: { page: 1, limit: 100 },
    } as any)
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
      currentId.value = null
      crumbs.value = []
      loadFolders()
    }
  }
)

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

const currentFolderId = computed(() => currentId.value ?? props.rootId)
const currentFolderName = computed(() =>
  currentId.value ? crumbs.value[crumbs.value.length - 1]?.name ?? props.rootName : props.rootName
)
const isCurrentExcluded = computed(() => props.excludeIds.includes(currentFolderId.value))

function onConfirm() {
  if (isCurrentExcluded.value) return
  emit('select', { id: currentFolderId.value, name: currentFolderName.value })
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '60%' }">
    <div class="picker-panel">
      <div class="picker-header">
        <span class="picker-title">{{ t('选择文件夹') }}</span>
        <van-icon name="cross" size="18" class="picker-close" @click="show = false" />
      </div>
      <div class="picker-breadcrumb">
        <span class="crumb" :class="{ 'crumb--last': crumbs.length === 0 }" @click="backTo(-1)">
          {{ rootName }}
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
        <button class="picker-confirm" :disabled="isCurrentExcluded" @click="onConfirm">
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
