<script setup lang="ts">
/**
 * 引用图纸选择底部弹窗（移动端，对齐 PC SelectFileModal 的空间树部分）。
 *
 * 根切换器：个人空间 + 我的项目；文件夹逐级下钻（nodeControllerGetChildren），
 * 列出 CAD 图纸（.dwg/.dxf/.mxweb，isCadFileName 同口径），点选 emit select
 * （带节点缩略图 URL，父组件转 dataURL 后调 registerDrawing 转真实附件副本）。
 *
 * 移动端无「当前图纸」快捷项：反馈入口在壳子页，无引擎实例。
 */
import { computed, ref, watch } from 'vue'
import {
  nodeControllerGetChildren,
  projectControllerGetPersonalSpace,
  projectControllerGetProjects,
} from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto, ProjectListResponseDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { unwrap, errMsg } from '@/utils/apiError'
import { isCadFileName } from '@/utils/cadFile'

export interface PickedDrawing {
  nodeId: string
  fileName: string
  /** 节点缩略图 URL（父组件转 dataURL 传给 registerDrawing） */
  thumbnailUrl: string
}

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'select', file: PickedDrawing): void
}>()

interface RootOption {
  id: string
  name: string
}

const roots = ref<RootOption[]>([])
const activeRootId = ref('')
const currentId = ref<string | null>(null)
const crumbs = ref<Array<{ id: string; name: string }>>([])
const folders = ref<FileSystemNodeDto[]>([])
const files = ref<FileSystemNodeDto[]>([])
const loading = ref(false)
const loadError = ref('')

const show = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
})

const activeRootName = computed(
  () => roots.value.find((r) => r.id === activeRootId.value)?.name ?? ''
)

async function loadRoots() {
  roots.value = []
  try {
    const res = await projectControllerGetPersonalSpace()
    unwrap(res)
    const space = res.data as { id?: string } | undefined
    if (space?.id) roots.value.push({ id: space.id, name: t('个人空间') })
  } catch {
    // 个人空间加载失败不阻塞项目根
  }
  try {
    const res = await projectControllerGetProjects({
      query: { page: 1, limit: 50, filter: 'all' },
    })
    unwrap(res)
    const data = (res.data ?? {}) as ProjectListResponseDto
    for (const n of data.nodes ?? []) {
      roots.value.push({ id: n.id, name: n.name })
    }
  } catch {
    // 项目加载失败不阻塞个人空间根
  }
  if (roots.value.length && !activeRootId.value) {
    activeRootId.value = roots.value[0].id
  }
}

async function loadChildren() {
  const root = activeRootId.value
  if (!root) {
    folders.value = []
    files.value = []
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const res = await nodeControllerGetChildren({
      path: { nodeId: currentId.value ?? root },
      query: { page: 1, limit: 100 },
    })
    unwrap(res)
    const nodes = (res.data?.nodes ?? []) as FileSystemNodeDto[]
    folders.value = nodes.filter((n) => n.isFolder)
    files.value = nodes.filter((n) => !n.isFolder && isCadFileName(n.name))
  } catch (e) {
    folders.value = []
    files.value = []
    loadError.value = errMsg(e, t('加载失败'))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.show,
  (val) => {
    if (!val) return
    currentId.value = null
    crumbs.value = []
    roots.value = []
    activeRootId.value = ''
    void (async () => {
      await loadRoots()
      if (activeRootId.value) await loadChildren()
    })()
  }
)

function switchRoot(id: string) {
  if (id === activeRootId.value) return
  activeRootId.value = id
  currentId.value = null
  crumbs.value = []
  void loadChildren()
}

function enterFolder(f: FileSystemNodeDto) {
  crumbs.value = [...crumbs.value, { id: f.id, name: f.name }]
  currentId.value = f.id
  void loadChildren()
}

function backTo(index: number) {
  if (index < 0) {
    currentId.value = null
    crumbs.value = []
  } else {
    currentId.value = crumbs.value[index].id
    crumbs.value = crumbs.value.slice(0, index)
  }
  void loadChildren()
}

function onPickFile(f: FileSystemNodeDto) {
  emit('select', {
    nodeId: f.id,
    fileName: f.name,
    thumbnailUrl: `/api/v1/file-system/nodes/${f.id}/thumbnail`,
  })
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round :style="{ height: '64%' }">
    <div class="fdp-panel">
      <div class="fdp-header">
        <span class="fdp-title">{{ t('选择要引用的图纸') }}</span>
        <van-icon name="cross" size="18" class="fdp-close" @click="show = false" />
      </div>

      <!-- 根切换器：个人空间 + 我的项目 -->
      <div v-if="roots.length" class="fdp-roots">
        <button
          v-for="r in roots"
          :key="r.id"
          :class="['fdp-root', { active: activeRootId === r.id }]"
          @click="switchRoot(r.id)"
        >
          {{ r.name }}
        </button>
      </div>

      <div class="fdp-breadcrumb">
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

      <div class="fdp-list">
        <div v-if="loading" class="fdp-state">
          <van-loading size="20" />
        </div>
        <div v-else-if="loadError" class="fdp-state">
          <span class="fdp-state-text">{{ loadError }}</span>
        </div>
        <div v-else-if="!folders.length && !files.length" class="fdp-state">
          <van-icon name="search" size="32" color="var(--text-tertiary)" />
          <span class="fdp-state-text">{{ t('暂无可引用的图纸') }}</span>
        </div>
        <template v-else>
          <div v-for="f in folders" :key="f.id" class="fdp-item" @click="enterFolder(f)">
            <van-icon name="folder-o" size="18" color="var(--text-secondary)" />
            <span class="fdp-item-name">{{ f.name }}</span>
            <van-icon name="arrow" size="14" color="var(--text-tertiary)" />
          </div>
          <div v-for="f in files" :key="f.id" class="fdp-item" @click="onPickFile(f)">
            <van-icon name="description" size="18" color="var(--accent)" />
            <span class="fdp-item-name">{{ f.name }}</span>
          </div>
        </template>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.fdp-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 16px 0;
  box-sizing: border-box;
}

.fdp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 0.5px solid var(--divider);
}

.fdp-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.fdp-close {
  color: var(--text-tertiary);
  cursor: pointer;
}

.fdp-roots {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 12px 0;
  flex-shrink: 0;
}

.fdp-root {
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid var(--divider);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
}

.fdp-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding-bottom: 10px;
  flex-shrink: 0;
}

.crumb {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--last {
    color: var(--text-primary);
    font-weight: 600;
  }
}

.crumb-sep {
  font-size: 13px;
  color: var(--text-tertiary);
}

.fdp-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 16px;
}

.fdp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 0;
}

.fdp-state-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.fdp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-radius: 8px;
  cursor: pointer;

  &:active {
    background: var(--bg-secondary);
  }
}

.fdp-item-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
