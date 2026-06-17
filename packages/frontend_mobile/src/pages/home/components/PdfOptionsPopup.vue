<script setup lang="ts">
import { reactive, ref } from 'vue'
import { t } from '@/languages'
import FloatingPopup from "../../../components/FloatingPopup.vue"
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
  <FloatingPopup v-model:show="show" :title="t('导出 PDF')" @close="emit('cancel')">
    <div class="pdf-options">
      <div class="input-row">
        <div class="input-group">
          <label class="input-label">{{t('宽度（像素）')}}</label>
          <input v-model="options.width" class="text-input" type="number" placeholder="2000" />
        </div>
        <div class="input-group">
          <label class="input-label">{{t('高度（像素）')}}</label>
          <input v-model="options.height" class="text-input" type="number" placeholder="2000" />
        </div>
      </div>
      <div class="toggle-group">
        <label class="input-label">{{t('颜色策略')}}</label>
        <div class="toggle-row">
          <button :class="['toggle-btn', { active: options.colorPolicy === 'mono' }]"
            @click="options.colorPolicy = 'mono'">
            {{t('黑白')}}
          </button>
          <button :class="['toggle-btn', { active: options.colorPolicy === 'color' }]"
            @click="options.colorPolicy = 'color'">
            {{t('彩色')}}
          </button>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="container-footer">
        <van-button type="primary" size="large" @click="onConfirm">
          {{ t('确认') }}
        </van-button>
      </div>
    </template>
  </FloatingPopup>
</template>

<style scoped lang="scss">
.input-row {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.input-group {
  flex: 1;
}

.input-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin-bottom: var(--space-sm);
}

.text-input {
  width: 100%;
  height: 44px;
  padding: 0 var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  font-size: var(--font-size-body);
  color: var(--text-primary);
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: var(--primary);
  }
}

.toggle-group {
  margin-bottom: var(--space-lg);
}

.toggle-row {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-sm);
}

.toggle-btn {
  flex: 1;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  font-size: var(--font-size-body);
  color: var(--text-secondary);
  transition: all 0.2s;

  &.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }
}
</style>
