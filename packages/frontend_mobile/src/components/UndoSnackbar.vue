<script setup lang="ts">
// 操作后撤销浮条（配合 useUndoSnackbar）：底部固定，文案 + 「撤销」按钮。
// Teleport 到 body 避免父级 transform/overflow 影响定位；限时收起由 composable 计时。
import { t } from '@/languages'

defineProps<{
  visible: boolean
  message: string
}>()
const emit = defineEmits<{ undo: [] }>()
</script>

<template>
  <Teleport to="body">
    <transition name="undo-snackbar">
      <div v-if="visible" class="undo-snackbar">
        <span class="undo-snackbar__text">{{ message }}</span>
        <button type="button" class="undo-snackbar__btn" @click="emit('undo')">
          {{ t('撤销') }}
        </button>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.undo-snackbar {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom));
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--divider);
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.undo-snackbar__text {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-primary);
}

.undo-snackbar__btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.undo-snackbar-enter-active,
.undo-snackbar-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.undo-snackbar-enter-from,
.undo-snackbar-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
