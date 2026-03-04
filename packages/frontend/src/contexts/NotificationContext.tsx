import React, { useState, useCallback, useRef, createContext, useContext, useEffect } from 'react';
import { Toast, ToastContainer } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ToastType } from '../components/ui/Toast';

// Toast 接口
interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

// Confirm 选项
interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

// Context 值类型
interface NotificationContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

// 全局事件名称
export const TOAST_EVENT = 'cloudcad:toast';
export const CONFIRM_EVENT = 'cloudcad:confirm';

// 全局 Toast 触发函数（供非 React 代码使用）
export const globalShowToast = (message: string, type: ToastType = 'info') => {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }));
};

// 全局 Confirm 触发函数（供非 React 代码使用）
export const globalShowConfirm = (options: ConfirmOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{ confirmed: boolean }>;
      resolve(customEvent.detail.confirmed);
      window.removeEventListener('cloudcad:confirm-response', handleResponse as EventListener);
    };
    window.addEventListener('cloudcad:confirm-response', handleResponse as EventListener);
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: options }));
  });
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    type: 'warning',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const timerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  // 显示 Toast
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);

    const timerId = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timerRefs.current.delete(timerId);
    }, 5000);
    timerRefs.current.add(timerId);
  }, []);

  // 移除 Toast
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 显示确认对话框
  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        type: options.type || 'warning',
        onConfirm: () => {
          resolve(true);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        },
        onCancel: () => {
          resolve(false);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        },
      });
    });
  }, []);

  // 监听全局 Toast 事件（供非 React 代码使用）
  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: ToastType }>;
      showToast(customEvent.detail.message, customEvent.detail.type);
    };

    const handleConfirmEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ConfirmOptions>;
      showConfirm(customEvent.detail).then((confirmed) => {
        window.dispatchEvent(new CustomEvent('cloudcad:confirm-response', {
          detail: { confirmed },
        }));
      });
    };

    window.addEventListener(TOAST_EVENT, handleToastEvent as EventListener);
    window.addEventListener(CONFIRM_EVENT, handleConfirmEvent as EventListener);

    return () => {
      window.removeEventListener(TOAST_EVENT, handleToastEvent as EventListener);
      window.removeEventListener(CONFIRM_EVENT, handleConfirmEvent as EventListener);
    };
  }, [showToast, showConfirm]);

  // 清理定时器
  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, showConfirm }}>
      {children}
      
      {/* 全局 Toast 容器 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* 全局确认对话框 */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={confirmState.onConfirm}
        onCancel={confirmState.onCancel}
      />
    </NotificationContext.Provider>
  );
};

// Hook
export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

// 便捷导出
export const useToast = () => {
  const { showToast } = useNotification();
  return { showToast };
};

export const useConfirmDialog = () => {
  const { showConfirm } = useNotification();
  return { showConfirm };
};