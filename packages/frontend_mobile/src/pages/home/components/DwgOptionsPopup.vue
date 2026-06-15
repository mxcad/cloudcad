<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  format: 'dwg' | 'dxf'
}>()

const emit = defineEmits<{
  confirm: [dwgVersion: number]
  cancel: []
}>()

const show = ref(true)

const VERSIONS = [
  { label: 'CAD 2000', value: 23 },
  { label: 'CAD 2004', value: 25 },
  { label: 'CAD 2007', value: 27 },
  { label: 'CAD 2010', value: 29 },
  { label: 'CAD 2018', value: 33 },
]

const selectedVersion = ref(23)

const title = computed(() =>
  props.format === 'dwg' ? '导出 DWG' : '导出 DXF'
)

function onConfirm() {
  show.value = false
  emit('confirm', selectedVersion.value)
}

function onCancel() {
  show.value = false
  emit('cancel')
}
</script>

<template>
  <van-popup
    v-model:show="show"
    position="bottom"
    round
    :style="{ maxHeight: '70vh' }"
    closeable
    @close="emit('cancel')"
  >
    <div class="export-popup">
      <div class="export-title">{{ title }}</div>

      <div class="export-body">
        <label class="input-label">AutoCAD 版本</label>
        <div class="version-list">
          <button
            v-for="v in VERSIONS"
            :key="v.value"
            :class="['version-item', { active: selectedVersion === v.value }]"
            @click="selectedVersion = v.value"
          >
            <span class="version-name">{{ v.label }}</span>
            <van-icon
              v-if="selectedVersion === v.value"
              name="success"
              color="#1989fa"
            />
          </button>
        </div>
      </div>

      <div class="export-footer">
        <van-button plain block round @click="onCancel">取消</van-button>
        <van-button type="primary" block round @click="onConfirm">确认导出</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.export-popup {
  display: flex;
  flex-direction: column;
  min-height: 40vh;
  max-height: 70vh;
}

.export-title {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  padding: 20px 16px 0;
}

.export-body {
  flex: 1;
  padding: 24px 20px 8px;
  overflow-y: auto;
}

.input-label {
  display: block;
  font-size: 14px;
  color: #969799;
  margin-bottom: 12px;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid #ebedf0;
  background: #f7f8fa;
  font-size: 15px;
  color: #323233;
  transition: all 0.2s;

  &.active {
    border-color: #1989fa;
    background: #ecf5ff;
    color: #1989fa;
    font-weight: 600;
  }
}

.version-name {
  font-size: 15px;
}

.export-footer {
  display: flex;
  gap: 12px;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #ebedf0;

  :deep(.van-button) {
    font-size: 15px;
    height: 44px;
  }
}
</style>
