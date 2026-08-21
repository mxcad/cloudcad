<template>
  <FloatingPopup
    v-model:show="innerShow"
    :title="title"
    :anchors="[0.3, 0.5, 0.92]"
    :initial-height-index="2"
    :draggable="true"
    :lazy-render="false"
    :z-index="2007"
    :overlay="true"
    @close="onClose"
  >
    <div class="insert-block-popup">
      <!-- ═══ 块名称 + 浏览 ═══ -->
      <div class="section">
        <div class="name-row">
          <van-field
            v-model="editableName"
            :label="t('名称')"
            :placeholder="t('请选择图块')"
            :readonly="!hasFile && list.length === 0"
            :is-link="!isLibraryMode"
            @click-field="onTapNameField"
            class="name-field"
          />
          <van-button
            v-if="!isLibraryMode"
            class="browse-btn"
            size="small"
            round
            @click.stop="onBrowse"
          >
            {{ t('浏览') }}
          </van-button>
        </div>
        <p v-if="filePathDisplay" class="file-path">{{ t('路径') }}: {{ filePathDisplay }}</p>
      </div>

      <div class="divider" />

      <!-- ═══ 插入点 ═══ -->
      <fieldset class="fieldset">
        <legend class="fieldset-legend">{{ t('插入点') }}</legend>
        <div class="switch-row">
          <span>{{ t('在屏幕上指定') }}</span>
          <van-switch v-model="isGetInsertionPoint" size="20" />
        </div>
        <div class="coords-row">
          <div class="coord-item">
            <label>X:</label>
            <input
              v-model.number="insertionPoint.x"
              type="number"
              step="any"
              :disabled="isGetInsertionPoint"
            />
          </div>
          <div class="coord-item">
            <label>Y:</label>
            <input
              v-model.number="insertionPoint.y"
              type="number"
              step="any"
              :disabled="isGetInsertionPoint"
            />
          </div>
          <div class="coord-item">
            <label>Z:</label>
            <input
              v-model.number="insertionPoint.z"
              type="number"
              step="any"
              :disabled="isGetInsertionPoint"
            />
          </div>
        </div>
      </fieldset>

      <!-- ═══ 比例 ═══ -->
      <fieldset class="fieldset">
        <legend class="fieldset-legend">{{ t('比例') }}</legend>
        <div class="switch-row">
          <span>{{ t('在屏幕上指定') }}</span>
          <van-switch v-model="isGetProportion" size="20" />
        </div>
        <div class="coords-row">
          <div class="coord-item">
            <label>X:</label>
            <input
              v-model.number="proportion.x"
              type="number"
              step="0.001"
              :disabled="isGetProportion"
            />
          </div>
          <div class="coord-item">
            <label>Y:</label>
            <input
              v-model.number="proportion.y"
              type="number"
              step="0.001"
              :disabled="isGetProportion || isUniformProportion"
            />
          </div>
          <div class="coord-item">
            <label>Z:</label>
            <input
              v-model.number="proportion.z"
              type="number"
              step="0.001"
              :disabled="isGetProportion || isUniformProportion"
            />
          </div>
        </div>
        <div class="switch-row switch-row--indent">
          <span>{{ t('统一比例') }}</span>
          <van-switch v-model="isUniformProportion" size="20" />
        </div>
      </fieldset>

      <!-- ═══ 旋转 ═══ -->
      <fieldset class="fieldset">
        <legend class="fieldset-legend">{{ t('旋转') }}</legend>
        <div class="switch-row">
          <span>{{ t('在屏幕上指定') }}</span>
          <van-switch v-model="isGetRotation" size="20" />
        </div>
        <div class="coord-item coord-item--single">
          <label>{{ t('角度') }}:</label>
          <input
            v-model.number="rotation"
            type="number"
            step="any"
            :disabled="isGetRotation"
          />
        </div>
      </fieldset>

      <div class="divider" />

      <!-- ═══ 开关选项（和整体风格一致） ═══ -->
      <div class="switch-options">
        <div class="switch-row">
          <span>{{ t('分解') }}</span>
          <van-switch v-model="effectiveDecomposition" size="20" />
        </div>
        <div class="switch-row">
          <span>{{ t('插入图纸中的唯一块') }}</span>
          <van-switch v-model="isExtractBlock" size="20" />
        </div>
        <div class="switch-row">
          <span>{{ t('自动计算原点') }}</span>
          <van-switch v-model="effectiveAutoComputeOrigin" size="20" />
        </div>
      </div>
    </div>

    <template #footer>
      <van-button
        class="confirm-btn"
        round
        block
        size="large"
        type="primary"
        @click="onConfirm"
      >
        {{ t('确定') }}
      </van-button>
    </template>
  </FloatingPopup>

  <!-- ═══ 块名称搜索选择弹窗 ═══ -->
  <van-popup
    v-model:show="showBlockSearch"
    position="bottom"
    :style="{ height: '50%' }"
    round
  >
    <div class="block-search-popup">
      <div class="block-search-header">
        <span class="block-search-title">{{ t('选择图块') }}</span>
        <van-icon name="cross" size="18" @click="showBlockSearch = false" />
      </div>
      <van-search
        v-model="searchText"
        :placeholder="t('搜索图块名称')"
        shape="round"
      />
      <div class="block-search-list">
        <div
          v-for="item in filteredBlockList"
          :key="item.id"
          class="block-search-item"
          @click="onSelectBlockFromSearch(item)"
        >
          <span class="block-search-item-name">{{ item.name }}</span>
          <van-icon
            v-if="item.id === currentItem?.id"
            name="success"
            color="var(--primary)"
            size="16"
          />
        </div>
        <div v-if="filteredBlockList.length === 0" class="block-search-empty">
          {{ searchText ? t('无匹配图块') : t('暂无图块') }}
        </div>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { showToast } from 'vant'
import { t } from '@/languages'
import FloatingPopup from '@/components/FloatingPopup.vue'
import {
  BlockInfoItem,
  useInsertBlock,
  currentItem,
  isBlockLibrary,
} from '@/composables/useInsertBlock'

const props = withDefaults(
  defineProps<{
    show?: boolean
    presetItem?: BlockInfoItem | null
  }>(),
  {
    show: false,
    presetItem: null,
  }
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'close'): void
  (e: 'confirm'): void
  (e: 'insert-complete'): void
}>()

const innerShow = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const {
  list,
  isGetInsertionPoint,
  insertionPoint,
  isGetProportion,
  proportion,
  isUniformProportion,
  isGetRotation,
  rotation,
  isDecomposition,
  isAutoComputeOrigin,
  isBlockLibraryDecomposition,
  isBlockLibraryAutoComputeOrigin,
  isExtractBlock,
  init,
  openFile,
  insertBlock,
} = useInsertBlock()

const isLibraryMode = computed(() => isBlockLibrary.value)

// ── 分解/自动计算原点: 跨模式共用 ──
const effectiveDecomposition = computed({
  get: () =>
    isBlockLibrary.value
      ? isBlockLibraryDecomposition.value
      : isDecomposition.value,
  set: (v: boolean) => {
    if (isBlockLibrary.value) {
      isBlockLibraryDecomposition.value = v
    } else {
      isDecomposition.value = v
    }
  },
})

const effectiveAutoComputeOrigin = computed({
  get: () =>
    isBlockLibrary.value
      ? isBlockLibraryAutoComputeOrigin.value
      : isAutoComputeOrigin.value,
  set: (v: boolean) => {
    if (isBlockLibrary.value) {
      isBlockLibraryAutoComputeOrigin.value = v
    } else {
      isAutoComputeOrigin.value = v
    }
  },
})

// ── 文件路径 ──
const filePathDisplay = computed(() => {
  if (!currentItem.value?.filePath) return ''
  try {
    const url = new URL(currentItem.value.filePath, window.location.origin)
    return url.pathname.split('/').pop() || ''
  } catch {
    return currentItem.value.filePath
  }
})

// ── 是否已选择文件（浏览上传后） ──
const hasFile = computed(() => !!currentItem.value?.filePath)

// ── 可编辑的名称 ──
const editableName = ref('')
watch(
  () => currentItem.value?.name,
  (name) => {
    editableName.value = name || ''
  },
  { immediate: true }
)
// 用户手动编辑名称 → 同步回 currentItem
watch(editableName, (val) => {
  if (currentItem.value) {
    currentItem.value.name = val
  }
})

// ── 块名称搜索弹窗 ──
const showBlockSearch = ref(false)
const searchText = ref('')
const filteredBlockList = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter((item) =>
    item.name.toLowerCase().includes(q)
  )
})

const onTapNameField = () => {
  if (isLibraryMode.value) return
  // 每次点击刷新图块列表并从当前图纸获取最新块定义
  init()
  showBlockSearch.value = true
}

const onSelectBlockFromSearch = (item: BlockInfoItem) => {
  currentItem.value = item
  editableName.value = item.name
  searchText.value = ''
  showBlockSearch.value = false
}

// ── 浏览文件 ──
const onBrowse = async () => {
  await openFile()
}

// ── 确定 ──
const onConfirm = async () => {
  if (!currentItem.value?.name) {
    showToast(t('请选择图块'))
    return
  }
  emit('confirm')
  innerShow.value = false
  const ok = await insertBlock()
  emit('insert-complete')
  if (ok) {
    init()
  }
}

// ── 关闭 ──
const onClose = () => {
  innerShow.value = false
  emit('close')
}

const title = computed(() => t('插入块'))

// ── 弹窗 lifecycle ──
watch(
  () => props.show,
  (val) => {
    if (val) {
      init()
      if (props.presetItem) {
        currentItem.value = { ...props.presetItem }
        isBlockLibrary.value = !!props.presetItem.isBlockLibrary
      } else {
        // 非图块库来源（菜单直接命令）→ 重置为普通模式，恢复「浏览」按钮
        isBlockLibrary.value = false
      }
    } else {
      list.value.forEach((item) => {
        if (item.filePath?.startsWith('blob:')) {
          URL.revokeObjectURL(item.filePath)
        }
      })
      list.value = []
      currentItem.value = undefined
      editableName.value = ''
    }
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.insert-block-popup {
  padding: var(--space-md) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-bottom: calc(var(--space-lg) * 2);
}

/* ── 名称行 ── */
.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;

  :deep(.van-cell) {
    padding: 8px 12px;
    flex: 1;
  }

  :deep(.van-field__label) {
    width: auto;
    margin-right: 8px;
  }
}

.name-field {
  flex: 1;
}

.browse-btn {
  flex-shrink: 0;
  min-width: 56px;
  height: 30px;
  margin: auto 0;
}

.file-path {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  padding-left: 14px;
}

/* ── 分隔线 ── */
.divider {
  height: 1px;
  background: var(--border-color);
  margin: 0 -4px;
}

/* ── fieldset ── */
.fieldset {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  margin: 0;
}

.fieldset-legend {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
  padding: 0 6px;
}

/* ── 开关行 ── */
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);

  &--indent {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px dashed var(--border-color);
  }
}

/* ── 开关选项组 ── */
.switch-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ── 坐标输入 ── */
.coords-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 6px;
}

.coord-item {
  display: flex;
  flex-direction: column;
  gap: 2px;

  label {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  input {
    width: 100%;
    padding: 6px 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    outline: none;

    &:disabled {
      opacity: 0.4;
    }

    &:focus {
      border-color: var(--primary);
    }
  }

  &--single {
    width: 100%;
    max-width: 160px;
    margin-top: 6px;
  }
}

/* ── 确定按钮 ── */
.confirm-btn {
  margin: var(--space-md) var(--space-lg);
  width: calc(100% - var(--space-lg) * 2);
}

/* ── 块搜索弹窗 ── */
.block-search-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.block-search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
}

.block-search-title {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
}

.block-search-header :deep(.van-icon-cross) {
  color: var(--text-primary);
}

.block-search-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-lg);
}

.block-search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  border-bottom: 1px solid var(--border-color);

  &:active {
    background: var(--bg-elevated);
  }
}

.block-search-item-name {
  font-size: var(--font-size-body);
  color: var(--text-primary);
}

.block-search-empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px 0;
  font-size: var(--font-size-sm);
}
</style>
