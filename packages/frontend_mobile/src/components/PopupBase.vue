<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  round?: boolean
  height?: string
  maxHeight?: string
  closeable?: boolean
  showFooter?: boolean
  confirmText?: string
  cancelText?: string
  confirmLoading?: boolean
  hideCancel?: boolean
  bodyPadding?: string
}>(), {
  position: 'bottom',
  round: true,
  closeable: true,
  showFooter: false,
  confirmText: '确认',
  cancelText: '取消',
  confirmLoading: false,
  hideCancel: false,
  bodyPadding: 'var(--space-lg)',
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: []
  cancel: []
  close: []
  opened: []
  closed: []
}>()

const popupStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.height) style.height = props.height
  if (props.maxHeight) style.maxHeight = props.maxHeight
  return style
})

function onClose() { emit('close') }
function onConfirm() { emit('confirm') }
function onCancel() { emit('cancel') }
</script>

<template>
  <van-popup
    :show="props.show"
    :title="props.title"
    :position="props.position"
    :round="props.round"
    :closeable="props.closeable"
    :style="popupStyle"
    safe-area-inset-bottom
    @close="onClose"
    @opened="emit('opened', $event)"
    @closed="emit('closed', $event)"
    @update:show="emit('update:show', $event)"
  >
    <div class="popup-body" :style="{ padding: bodyPadding }">
      <slot />
    </div>

    <div v-if="props.showFooter || $slots.footer" class="popup-footer">
      <slot name="footer">
        <div class="popup-footer-default">
          <van-button v-if="!props.hideCancel" plain block @click="onCancel">
            {{ props.cancelText }}
          </van-button>
          <van-button type="primary" block :loading="props.confirmLoading" @click="onConfirm">
            {{ props.confirmText }}
          </van-button>
        </div>
      </slot>
    </div>
  </van-popup>
</template>

<style scoped lang="scss">
.popup-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.popup-footer {
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.popup-footer-default {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom, 0px));
}
</style>
