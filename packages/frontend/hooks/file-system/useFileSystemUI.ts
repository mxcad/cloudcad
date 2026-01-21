import { useState, useCallback, useRef, useEffect } from 'react';
import { Toast } from '../../components/ui/Toast';

export const useFileSystemUI = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning',
  });

  const timerRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();
    };
  }, []);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);

    const timerId = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timerRefs.current.delete(timerId);
    }, 5000);
    timerRefs.current.add(timerId);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      type: 'danger' | 'warning' | 'info' = 'warning'
    ) => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          onConfirm();
          closeConfirm();
        },
        type,
      });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    toasts,
    confirmDialog,
    showToast,
    removeToast,
    showConfirm,
    closeConfirm,
  };
};