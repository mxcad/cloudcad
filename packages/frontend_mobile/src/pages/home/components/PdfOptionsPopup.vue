<script setup lang="ts">
import { reactive, ref } from 'vue'

export interface PdfOptions {
  width: string
  height: string
  colorPolicy: 'mono' | 'color'
}

const emit = defineEmits<{
  confirm: [options: PdfOptions]
  cancel: []
}>()

const show = ref(true)
const options = reactive<PdfOptions>({
  width: '2000',
  height: '2000',
  colorPolicy: 'mono',
})

function onConfirm() {
  show.value = false
  emit('confirm', { ...options })
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
      <div class="export-title">导出 PDF</div>

      <div class="export-body">
        <div class="input-row">
          <div class="input-group">
            <label class="input-label">宽度（像素）</label>
            <input
              v-model="options.width"
              class="text-input"
              type="number"
              placeholder="2000"
            />
          </div>
          <div class="input-group">
            <label class="input-label">高度（像素）</label>
            <input
              v-model="options.height"
              class="text-input"
              type="number"
              placeholder="2000"
            />
          </div>
        </div>

        <div class="toggle-group">
          <label class="input-label">颜色策略</label>
          <div class="toggle-row">
            <button
              :class="['toggle-btn', { active: options.colorPolicy === 'mono' }]"
              @click="options.colorPolicy = 'mono'"
            >
              黑白
            </button>
            <button
              :class="['toggle-btn', { active: options.colorPolicy === 'color' }]"
              @click="options.colorPolicy = 'color'"
            >
              彩色
            </button>
          </div>
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

.input-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.input-group {
  flex: 1;
}

.input-label {
  display: block;
  font-size: 14px;
  color: #969799;
  margin-bottom: 8px;
}

.text-input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #ebedf0;
  background: #f7f8fa;
  font-size: 15px;
  color: #323233;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: #1989fa;
  }
}

.toggle-group {
  margin-bottom: 16px;
}

.toggle-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.toggle-btn {
  flex: 1;
  height: 44px;
  border-radius: 8px;
  border: 1px solid #ebedf0;
  background: #f7f8fa;
  font-size: 15px;
  color: #646566;
  transition: all 0.2s;

  &.active {
    background: #1989fa;
    color: #fff;
    border-color: #1989fa;
  }
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
