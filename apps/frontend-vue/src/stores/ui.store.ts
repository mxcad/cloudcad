import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * UI Store
 *
 * 从 useUIStore (Zustand) 迁移。
 * 职责：Toast 通知、Modal 状态、全局加载、侧边栏
 */
export const useUIStore = defineStore('ui', () => {
  // ===== Toast =====
  const toasts = ref<Toast[]>([]);

  function addToast(message: string, type: Toast['type'] = 'info'): void {
    const id = Date.now().toString();
    toasts.value.push({ id, type, message });
    setTimeout(() => removeToast(id), 5000);
  }

  function removeToast(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  // ===== Modal =====
  const activeModal = ref<string | null>(null);

  function openModal(modalId: string): void {
    activeModal.value = modalId;
  }

  function closeModal(): void {
    activeModal.value = null;
  }

  // ===== 全局加载 =====
  const globalLoading = ref(false);
  const loadingMessage = ref('');
  const loadingProgress = ref(0);
  const loadingKey = ref<string | null>(null);
  const loadingBlock = ref(false);

  function setGlobalLoading(loading: boolean, message = ''): void {
    globalLoading.value = loading;
    loadingMessage.value = message;
    loadingProgress.value = 0;
    loadingKey.value = null;
    loadingBlock.value = false;
  }

  function showLoading(key: string, message: string, block = false): void {
    if (globalLoading.value && loadingKey.value !== null && loadingKey.value !== key) return;
    globalLoading.value = true;
    loadingKey.value = key;
    loadingMessage.value = message;
    loadingProgress.value = 0;
    loadingBlock.value = block;
  }

  function updateLoading(key: string, message: string, pct = 0): void {
    if (loadingKey.value !== key) return;
    loadingMessage.value = message;
    loadingProgress.value = Math.min(100, Math.max(0, pct));
  }

  function hideLoading(key: string): void {
    if (loadingKey.value !== key) return;
    globalLoading.value = false;
    loadingMessage.value = '';
    loadingProgress.value = 0;
    loadingKey.value = null;
    loadingBlock.value = false;
  }

  function resetLoading(): void {
    globalLoading.value = false;
    loadingMessage.value = '';
    loadingProgress.value = 0;
    loadingKey.value = null;
    loadingBlock.value = false;
  }

  // ===== 侧边栏 =====
  const sidebarOpen = ref(false);

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value;
  }

  return {
    toasts,
    addToast,
    removeToast,
    activeModal,
    openModal,
    closeModal,
    globalLoading,
    loadingMessage,
    loadingProgress,
    loadingKey,
    loadingBlock,
    setGlobalLoading,
    showLoading,
    updateLoading,
    hideLoading,
    resetLoading,
    sidebarOpen,
    toggleSidebar,
  };
});

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}
