import { useState, useCallback, useRef, useEffect } from 'react';
import { Toast } from '../../components/ui/Toast';
import { useCADEditorStore } from '../../stores/useCADEditorStore';

export const useFileSystemUI = () => {
  const { isActive } = useCADEditorStore();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const timerRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();
    };
  }, []);

  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      if (isActive) {
        // 间接调用 mxcad 全局插件上下文 API，避免被误判为 React Hook
        const mx = (
          window as typeof window & {
            MxPluginContext?: {
              useMessage?: () => Record<string, (msg: string) => void>;
            };
          }
        ).MxPluginContext?.useMessage;
        if (mx) {
          const messageApi = mx();
          messageApi[type]?.(message);
          return;
        }
      }
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, type, message }]);

      const timerId = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timerRefs.current.delete(timerId);
      }, 5000);
      timerRefs.current.add(timerId);
    },
    [isActive]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return {
    toasts,
    showToast,
    removeToast,
  };
};
