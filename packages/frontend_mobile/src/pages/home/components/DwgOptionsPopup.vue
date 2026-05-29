<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  format: 'dwg' | 'dxf'
}>()

const emit = defineEmits<{
  confirm: [dwgVersion: number]
  cancel: []
}>()

const VERSIONS = [
  { label: 'CAD2000', value: 23 },
  { label: 'CAD2004', value: 25 },
  { label: 'CAD2007', value: 27 },
  { label: 'CAD2010', value: 29 },
  { label: 'CAD2018', value: 33 },
]

const selectedVersion = ref(33)

const title = computed(() =>
  props.format === 'dwg' ? '导出 DWG' : '导出 DXF'
)

function onConfirm() {
  emit('confirm', selectedVersion.value)
}

function onCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="dwg-options-overlay" @click.self="onCancel">
    <div class="dwg-options-popup">
      <div class="popup-header">
        <span class="popup-title">{{ title }}</span>
        <button class="popup-close" @click="onCancel">
          <van-icon name="cross" />
        </button>
      </div>
      <div class="popup-body">
        <div class="option-group">
          <label class="option-label">AutoCAD 版本</label>
          <van-radio-group v-model="selectedVersion" direction="vertical">
            <van-radio
              v-for="v in VERSIONS"
              :key="v.value"
              :name="v.value"
              class="version-radio"
            >
              {{ v.label }}（v{{ v.value }}）
            </van-radio>
          </van-radio-group>
        </div>
      </div>
      <div class="popup-footer">
        <van-button plain type="default" size="small" @click="onCancel">取消</van-button>
        <van-button type="primary" size="small" @click="onConfirm">确认导出</van-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dwg-options-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dwg-options-popup {
  width: 85%;
  max-width: 400px;
  background: #2a2a2a;
  border-radius: 12px;
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #3a3a3a;
}

.popup-title {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.popup-close {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  padding: 4px;
}

.popup-body {
  padding: 16px;
}

.option-group {
  flex: 1;
}

.option-label {
  display: block;
  color: #ccc;
  font-size: 13px;
  margin-bottom: 8px;
}

:deep(.van-radio-group) {
  .version-radio {
    padding: 8px 0;
  }

  .van-radio__label {
    color: #ccc;
    font-size: 14px;
  }
}

.popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 16px 16px;
  border-top: 1px solid #3a3a3a;
}
</style>
