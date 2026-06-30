<script setup lang="ts">
import { t } from '@/languages';

defineProps<{
  show: boolean
  title?: string
  showCancelButton?: boolean
  confirmText?: string
  cancelText?: string
  closeable?: boolean
  confirmLoading?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
  close: []
}>()

function onCancel() {
  emit('cancel')
}

function onConfirm() {
  emit('confirm')
}
</script>

<template>
  <van-dialog
    :show="show"
    :title="title"
    :show-confirm-button="false"
    :show-cancel-button="false"
    :closeable="closeable ?? false"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
    @close="emit('close')"
    @update:show="emit('close')"
  >
    <div class="dialog-body">
      <slot />
    </div>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
    <template v-if="!$slots.footer && showCancelButton">
      <div class="dialog-footer">
        <van-button plain block @click="onCancel">
          {{ cancelText || t('取消') }}
        </van-button>
        <van-button type="primary" block :loading="confirmLoading" @click="onConfirm">
          {{ confirmText || t('确认') }}
        </van-button>
      </div>
    </template>
  </van-dialog>
</template>

<style scoped lang="scss">
.dialog-body {
  padding: var(--space-lg);
  font-size: var(--font-size-body);
  color: var(--text-primary);
}

.dialog-footer {
  display: flex;
  gap: var(--space-md);
  padding: 0 var(--space-lg) var(--space-lg);
  padding-bottom: calc(var(--space-lg) + env(safe-area-inset-bottom, 0px));

  :deep(.van-button) {
    font-size: var(--font-size-body);
  }
}
</style>
