import { ref, computed, onMounted, onUnmounted } from 'vue';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export function useFileSystemUI() {
  const toasts = ref<Toast[]>([]);
  const confirmDialog = ref<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: undefined,
    onConfirm: () => {},
    type: 'warning',
  });

  const timerRefs = ref<Set<ReturnType<typeof setTimeout>>>(new Set());

  onUnmounted(() => {
    timerRefs.value.forEach((timerId) => clearTimeout(timerId));
    timerRefs.value.clear();
  });

  function showToast(message: string, type: Toast['type'] = 'info'): void {
    const id = Date.now().toString();
    toasts.value.push({ id, type, message });

    const timerId = setTimeout(() => {
      toasts.value = toasts.value.filter((toast) => toast.id !== id);
      timerRefs.value.delete(timerId);
    }, 5000);
    timerRefs.value.add(timerId);
  }

  function removeToast(id: string): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function showConfirm(
    title: string,
    message: string,
    onConfirm: () => void,
    type: 'danger' | 'warning' | 'info' = 'warning',
    confirmText: string = '确定'
  ): void {
    confirmDialog.value = {
      isOpen: true,
      title,
      message,
      confirmText,
      onConfirm: () => {
        onConfirm();
        closeConfirm();
      },
      type,
    };
  }

  function closeConfirm(): void {
    confirmDialog.value.isOpen = false;
  }

  return {
    toasts,
    confirmDialog,
    showToast,
    removeToast,
    showConfirm,
    closeConfirm,
  };
}
