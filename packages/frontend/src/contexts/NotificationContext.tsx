import React, {
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
  useEffect,
} from 'react';
import { t } from '@/languages';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import type { ToastType } from '../components/ui/Toast';
import {
  ToastStack,
  ConfirmDialog,
  ThreeButtonDialog,
  PromptDialog,
} from '../components/notification';
import type {
  ConfirmDialogState,
  ThreeButtonDialogState,
  PromptDialogState,
  ToastItem,
} from '../components/notification';
import {
  TOAST_EVENT,
  CONFIRM_EVENT,
  THREE_BUTTON_CONFIRM_EVENT,
  PROMPT_EVENT,
  CONFIRM_RESPONSE_EVENT,
  THREE_BUTTON_CONFIRM_RESPONSE_EVENT,
  PROMPT_RESPONSE_EVENT,
  type ConfirmOptions,
  type PromptOptions,
  type ThreeButtonConfirmOptions,
} from '../utils/notificationEvents';

interface NotificationContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

function routeToCadMessage(message: string, type: ToastType) {
  const mx = window.MxPluginContext?.useMessage;
  if (!mx) return false;
  const m = mx();
  switch (type) {
    case 'success':
      m.success(message);
      break;
    case 'error':
      m.error(message);
      break;
    case 'warning':
      m.warning(message);
      break;
    default:
      m.info(message);
      break;
  }
  return true;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null
);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const isCadActive = useCADEditorStore((s) => s.isActive);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const threeButtonResolveRef = useRef<
    ((value: 'confirm' | 'discard' | 'cancel') => void) | null
  >(null);
  const promptResolveRef = useRef<((value: string | null) => void) | null>(
    null
  );

  const [confirmState, setConfirmState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: t('确定'),
    cancelText: t('取消'),
    dialogType: 'warning',
  });

  const [threeButtonState, setThreeButtonState] =
    useState<ThreeButtonDialogState>({
      isOpen: false,
      title: '',
      message: '',
      confirmText: t('保存'),
      discardText: t('不保存'),
      cancelText: t('取消'),
      dialogType: 'warning',
    });

  const [promptState, setPromptState] = useState<PromptDialogState>({
    isOpen: false,
    title: '',
    label: '',
    defaultValue: '',
    confirmText: t('确定'),
    cancelText: t('取消'),
    multiline: false,
  });
  const [promptInputValue, setPromptInputValue] = useState('');

  const handleConfirm = useCallback(() => {
    const resolve = confirmResolveRef.current;
    if (resolve) {
      resolve(true);
      confirmResolveRef.current = null;
    }
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    const resolve = confirmResolveRef.current;
    if (resolve) {
      resolve(false);
      confirmResolveRef.current = null;
    }
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleThreeButtonConfirm = useCallback(() => {
    const resolve = threeButtonResolveRef.current;
    if (resolve) {
      resolve('confirm');
      threeButtonResolveRef.current = null;
    }
    setThreeButtonState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleThreeButtonDiscard = useCallback(() => {
    const resolve = threeButtonResolveRef.current;
    if (resolve) {
      resolve('discard');
      threeButtonResolveRef.current = null;
    }
    setThreeButtonState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleThreeButtonCancel = useCallback(() => {
    const resolve = threeButtonResolveRef.current;
    if (resolve) {
      resolve('cancel');
      threeButtonResolveRef.current = null;
    }
    setThreeButtonState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handlePromptConfirm = useCallback(() => {
    const resolve = promptResolveRef.current;
    if (resolve) {
      resolve(promptInputValue);
      promptResolveRef.current = null;
    }
    setPromptState((prev) => ({ ...prev, isOpen: false }));
  }, [promptInputValue]);

  const handlePromptCancel = useCallback(() => {
    const resolve = promptResolveRef.current;
    if (resolve) {
      resolve(null);
      promptResolveRef.current = null;
    }
    setPromptState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (isCadActive && routeToCadMessage(message, type)) return;
      const id =
        Date.now().toString() + Math.random().toString(36).substr(2, 9);
      setToasts((prev) => [...prev, { id, type, message }]);

      const timerId = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timerRefs.current.delete(timerId);
      }, 5000);
      timerRefs.current.add(timerId);
    },
    [isCadActive]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showConfirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmState({
          isOpen: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText || t('确定'),
          cancelText: options.cancelText || t('取消'),
          dialogType: options.type || 'warning',
        });
      });
    },
    []
  );

  const showPrompt = useCallback(
    (options: PromptOptions): Promise<string | null> => {
      return new Promise((resolve) => {
        promptResolveRef.current = resolve;
        const defaultValue = options.defaultValue || '';
        setPromptState({
          isOpen: true,
          title: options.title,
          label: options.label,
          defaultValue,
          confirmText: options.confirmText || t('确定'),
          cancelText: options.cancelText || t('取消'),
          multiline: options.multiline || false,
        });
        setPromptInputValue(defaultValue);
      });
    },
    []
  );

  const showThreeButtonConfirm = useCallback(
    (
      options: ThreeButtonConfirmOptions
    ): Promise<'confirm' | 'discard' | 'cancel'> => {
      return new Promise((resolve) => {
        threeButtonResolveRef.current = resolve;
        setThreeButtonState({
          isOpen: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText,
          discardText: options.discardText,
          cancelText: options.cancelText,
          dialogType: options.dialogType || 'warning',
        });
      });
    },
    []
  );

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        message: string;
        type: ToastType;
      }>;
      showToast(customEvent.detail.message, customEvent.detail.type);
    };

    const handleConfirmEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ConfirmOptions>;
      showConfirm(customEvent.detail).then((confirmed) => {
        window.dispatchEvent(
          new CustomEvent(CONFIRM_RESPONSE_EVENT, {
            detail: { confirmed },
          })
        );
      });
    };

    const handleThreeButtonConfirmEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ThreeButtonConfirmOptions>;
      showThreeButtonConfirm(customEvent.detail).then((value) => {
        window.dispatchEvent(
          new CustomEvent(THREE_BUTTON_CONFIRM_RESPONSE_EVENT, {
            detail: { value },
          })
        );
      });
    };

    const handlePromptEvent = (e: Event) => {
      const customEvent = e as CustomEvent<PromptOptions>;
      showPrompt(customEvent.detail).then((value) => {
        window.dispatchEvent(
          new CustomEvent(PROMPT_RESPONSE_EVENT, {
            detail: { value },
          })
        );
      });
    };

    window.addEventListener(TOAST_EVENT, handleToastEvent as EventListener);
    window.addEventListener(CONFIRM_EVENT, handleConfirmEvent as EventListener);
    window.addEventListener(
      THREE_BUTTON_CONFIRM_EVENT,
      handleThreeButtonConfirmEvent as EventListener
    );
    window.addEventListener(PROMPT_EVENT, handlePromptEvent as EventListener);

    return () => {
      window.removeEventListener(
        TOAST_EVENT,
        handleToastEvent as EventListener
      );
      window.removeEventListener(
        CONFIRM_EVENT,
        handleConfirmEvent as EventListener
      );
      window.removeEventListener(
        THREE_BUTTON_CONFIRM_EVENT,
        handleThreeButtonConfirmEvent as EventListener
      );
      window.removeEventListener(
        PROMPT_EVENT,
        handlePromptEvent as EventListener
      );
    };
  }, [showToast, showConfirm, showThreeButtonConfirm, showPrompt]);

  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, showConfirm }}>
      {children}

      <ToastStack toasts={toasts} onRemove={removeToast} />

      <ConfirmDialog
        state={confirmState}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <ThreeButtonDialog
        state={threeButtonState}
        onConfirm={handleThreeButtonConfirm}
        onDiscard={handleThreeButtonDiscard}
        onCancel={handleThreeButtonCancel}
      />

      <PromptDialog
        state={promptState}
        value={promptInputValue}
        onChange={setPromptInputValue}
        onConfirm={handlePromptConfirm}
        onCancel={handlePromptCancel}
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotification must be used within a NotificationProvider'
    );
  }
  return context;
};

export const useConfirmDialog = () => {
  const { showConfirm } = useNotification();
  return { showConfirm };
};
