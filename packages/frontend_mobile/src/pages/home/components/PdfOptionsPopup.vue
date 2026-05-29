<script setup lang="ts">
import { reactive } from 'vue'

export interface PdfOptions {
  width: string
  height: string
  colorPolicy: 'mono' | 'color'
}

const emit = defineEmits<{
  confirm: [options: PdfOptions]
  cancel: []
}>()

const options = reactive<PdfOptions>({
  width: '2000',
  height: '2000',
  colorPolicy: 'mono',
})

function onConfirm() {
  emit('confirm', { ...options })
}

function onCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="pdf-options-overlay" @click.self="onCancel">
    <div class="pdf-options-popup">
      <div class="popup-header">
        <span class="popup-title">PDF 导出参数</span>
        <button class="popup-close" @click="onCancel">
          <van-icon name="cross" />
        </button>
      </div>
      <div class="popup-body">
        <div class="option-row">
          <div class="option-group">
            <label class="option-label">宽度（像素）</label>
            <van-field
              v-model="options.width"
              placeholder="2000"
              type="digit"
              clearable
            />
          </div>
          <div class="option-group">
            <label class="option-label">高度（像素）</label>
            <van-field
              v-model="options.height"
              placeholder="2000"
              type="digit"
              clearable
            />
          </div>
        </div>
        <div class="option-group">
          <label class="option-label">颜色策略</label>
          <van-radio-group v-model="options.colorPolicy" direction="horizontal">
            <van-radio name="mono">黑白（单色）</van-radio>
            <van-radio name="color">彩色</van-radio>
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
.pdf-options-overlay {
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

.pdf-options-popup {
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

.option-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.option-group {
  flex: 1;
}

.option-label {
  display: block;
  color: #ccc;
  font-size: 13px;
  margin-bottom: 6px;
}

:deep(.van-field) {
  background: #3a3a3a;
  border-radius: 6px;
  padding: 8px 12px;

  .van-field__control {
    color: #fff;
    font-size: 14px;
  }
}

:deep(.van-radio-group) {
  .van-radio {
    margin-right: 16px;
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
