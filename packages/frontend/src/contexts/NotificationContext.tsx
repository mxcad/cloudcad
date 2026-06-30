import React, {
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Z_LAYERS } from '../constants/layers';
import { t } from '@/languages';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import type { ToastType } from '../components/ui/Toast';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

interface ThreeButtonConfirmOptions {
  title: string;
  message: string;
  confirmText: string;
  discardText: string;
  cancelText: string;
  dialogType?: 'danger' | 'warning' | 'info';
}

interface AlertOptions {
  title: string;
  message: string;
  confirmText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
}

interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
}

interface NotificationContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
  showAlert: (options: AlertOptions) => Promise<void>;
  showPrompt: (options: PromptOptions) => Promise<string | null>;
}

export const TOAST_EVENT = 'cloudcad:toast';
export const CONFIRM_EVENT = 'cloudcad:confirm';
export const THREE_BUTTON_CONFIRM_EVENT = 'cloudcad:three-button-confirm';
export const ALERT_EVENT = 'cloudcad:alert';
export const PROMPT_EVENT = 'cloudcad:prompt';
const CONFIRM_RESPONSE_EVENT = 'cloudcad:confirm-response';
const THREE_BUTTON_CONFIRM_RESPONSE_EVENT = 'cloudcad:three-button-confirm-response';
const ALERT_RESPONSE_EVENT = 'cloudcad:alert-response';
const PROMPT_RESPONSE_EVENT = 'cloudcad:prompt-response';

function routeToCadMessage(message: string, type: ToastType) {
  const mx = window.MxPluginContext?.useMessage;
  if (!mx) return false;
  const m = mx();
  switch (type) {
    case 'success': m.success(message); break;
    case 'error': m.error(message); break;
    case 'warning': m.warning(message); break;
    default: m.info(message); break;
  }
  return true;
}

export const globalShowToast = (message: string, type: ToastType = 'info') => {
  const { isActive } = useCADEditorStore.getState();
  if (isActive && routeToCadMessage(message, type)) return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, type } })
  );
};

export const globalShowConfirm = (
  options: ConfirmOptions
): Promise<boolean> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{ confirmed: boolean }>;
      resolve(customEvent.detail.confirmed);
      window.removeEventListener(
        CONFIRM_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      CONFIRM_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: options }));
  });
};

export const globalShowThreeButtonConfirm = (
  options: ThreeButtonConfirmOptions
): Promise<'confirm' | 'discard' | 'cancel'> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{ value: 'confirm' | 'discard' | 'cancel' }>;
      resolve(customEvent.detail.value);
      window.removeEventListener(
        THREE_BUTTON_CONFIRM_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      THREE_BUTTON_CONFIRM_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(new CustomEvent(THREE_BUTTON_CONFIRM_EVENT, { detail: options }));
  });
};

export const globalShowAlert = (options: AlertOptions): Promise<void> => {
  return new Promise((resolve) => {
    const handleResponse = () => {
      resolve();
      window.removeEventListener(
        ALERT_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      ALERT_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(new CustomEvent(ALERT_EVENT, { detail: options }));
  });
};

export const globalShowPrompt = (
  options: PromptOptions
): Promise<string | null> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{ value: string | null }>;
      resolve(customEvent.detail.value);
      window.removeEventListener(
        PROMPT_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      PROMPT_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(new CustomEvent(PROMPT_EVENT, { detail: options }));
  });
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null
);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const isCadActive = useCADEditorStore(s => s.isActive);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const threeButtonResolveRef = useRef<((value: 'confirm' | 'discard' | 'cancel') => void) | null>(null);
  const alertResolveRef = useRef<(() => void) | null>(null);
  const promptResolveRef = useRef<((value: string | null) => void) | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    dialogType: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: t('确定'),
    cancelText: t('取消'),
    dialogType: 'warning',
  });

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    dialogType: 'danger' | 'warning' | 'info' | 'success';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: t('确定'),
    dialogType: 'info',
  });

  const [threeButtonState, setThreeButtonState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    discardText: string;
    cancelText: string;
    dialogType: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: t('保存'),
    discardText: t('不保存'),
    cancelText: t('取消'),
    dialogType: 'warning',
  });

  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    title: string;
    label: string;
    defaultValue: string;
    confirmText: string;
    cancelText: string;
    multiline: boolean;
  }>({
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

  const handleAlertClose = useCallback(() => {
    const resolve = alertResolveRef.current;
    if (resolve) {
      resolve();
      alertResolveRef.current = null;
    }
    setAlertState((prev) => ({ ...prev, isOpen: false }));
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

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (isCadActive && routeToCadMessage(message, type)) return;
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);

    const timerId = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timerRefs.current.delete(timerId);
    }, 5000);
    timerRefs.current.add(timerId);
  }, [isCadActive]);

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

  const showAlert = useCallback(
    (options: AlertOptions): Promise<void> => {
      return new Promise((resolve) => {
        alertResolveRef.current = resolve;
        setAlertState({
          isOpen: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText || t('确定'),
          dialogType: options.type || 'info',
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
    (options: ThreeButtonConfirmOptions): Promise<'confirm' | 'discard' | 'cancel'> => {
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

    const handleAlertEvent = (e: Event) => {
      const customEvent = e as CustomEvent<AlertOptions>;
      showAlert(customEvent.detail).then(() => {
        window.dispatchEvent(new CustomEvent(ALERT_RESPONSE_EVENT));
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
    window.addEventListener(THREE_BUTTON_CONFIRM_EVENT, handleThreeButtonConfirmEvent as EventListener);
    window.addEventListener(ALERT_EVENT, handleAlertEvent as EventListener);
    window.addEventListener(PROMPT_EVENT, handlePromptEvent as EventListener);

    return () => {
      window.removeEventListener(TOAST_EVENT, handleToastEvent as EventListener);
      window.removeEventListener(CONFIRM_EVENT, handleConfirmEvent as EventListener);
      window.removeEventListener(THREE_BUTTON_CONFIRM_EVENT, handleThreeButtonConfirmEvent as EventListener);
      window.removeEventListener(ALERT_EVENT, handleAlertEvent as EventListener);
      window.removeEventListener(PROMPT_EVENT, handlePromptEvent as EventListener);
    };
  }, [showToast, showConfirm, showThreeButtonConfirm, showAlert, showPrompt]);

  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();
    };
  }, []);

  const renderConfirmIcon = (dialogType: 'danger' | 'warning' | 'info') => {
    const iconColor =
      dialogType === 'danger'
        ? 'var(--error)'
        : dialogType === 'warning'
          ? 'var(--warning)'
          : 'var(--info)';
    const bgColor =
      dialogType === 'danger'
        ? 'var(--error-dim)'
        : dialogType === 'warning'
          ? 'var(--warning-dim)'
          : 'var(--info-dim)';

    return (
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: bgColor }}
      >
        <svg
          className="w-6 h-6"
          style={{ color: iconColor }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={
              dialogType === 'info'
                ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                : 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
            }
          />
        </svg>
      </div>
    );
  };

  return (
    <NotificationContext.Provider
      value={{ showToast, showConfirm, showAlert, showPrompt }}
    >
      {children}

      {createPortal(
        <ToastContainer toasts={toasts} onRemove={removeToast} />,
        document.body
      )}

      {confirmState.isOpen && (
        <Modal
          isOpen={true}
          onClose={handleCancel}
          title={confirmState.title}
          zIndex={Z_LAYERS.TOAST - 1}
          footer={
            <>
              <Button variant="secondary" onClick={handleCancel}>
                {confirmState.cancelText}
              </Button>
              <Button onClick={handleConfirm}>
                {confirmState.confirmText}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-4">
            {renderConfirmIcon(confirmState.dialogType)}
            <p
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {confirmState.message}
            </p>
          </div>
        </Modal>
      )}

      {threeButtonState.isOpen && (
        <Modal
          isOpen={true}
          onClose={handleThreeButtonCancel}
          title={threeButtonState.title}
          zIndex={Z_LAYERS.TOAST - 1}
          footer={
            <>
              <Button variant="secondary" onClick={handleThreeButtonCancel}>
                {threeButtonState.cancelText}
              </Button>
              <Button variant="outline" onClick={handleThreeButtonDiscard}>
                {threeButtonState.discardText}
              </Button>
              <Button onClick={handleThreeButtonConfirm}>
                {threeButtonState.confirmText}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-4">
            {renderConfirmIcon(threeButtonState.dialogType)}
            <p
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {threeButtonState.message}
            </p>
          </div>
        </Modal>
      )}

      {alertState.isOpen && (
        <Modal
          isOpen={true}
          onClose={handleAlertClose}
          title={alertState.title}
          zIndex={Z_LAYERS.TOAST - 1}
          footer={
            <Button onClick={handleAlertClose}>
              {alertState.confirmText}
            </Button>
          }
        >
          <div className="flex items-start gap-4">
            {renderConfirmIcon(alertState.dialogType as 'danger' | 'warning' | 'info')}
            <p
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {alertState.message}
            </p>
          </div>
        </Modal>
      )}

      {promptState.isOpen && (
        <Modal
          isOpen={true}
          onClose={handlePromptCancel}
          title={promptState.title}
          zIndex={Z_LAYERS.TOAST - 1}
          footer={
            <>
              <Button variant="secondary" onClick={handlePromptCancel}>
                {promptState.cancelText}
              </Button>
              <Button
                onClick={handlePromptConfirm}
                disabled={!promptInputValue.trim()}
              >
                {promptState.confirmText}
              </Button>
            </>
          }
        >
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {promptState.label}
          </label>
          {promptState.multiline ? (
            <Textarea
              autoFocus
              value={promptInputValue}
              onChange={(e) => setPromptInputValue(e.target.value)}
              size="lg"
              style={{ minHeight: '100px' }}
              placeholder={promptState.label}
            />
          ) : (
            <Input
              autoFocus
              type="text"
              value={promptInputValue}
              onChange={(e) => setPromptInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptInputValue.trim()) {
                  handlePromptConfirm();
                }
              }}
            />
          )}
        </Modal>
      )}
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

export const useToast = () => {
  const { showToast } = useNotification();
  return { showToast };
};

export const useConfirmDialog = () => {
  const { showConfirm } = useNotification();
  return { showConfirm };
};

export const useAlertDialog = () => {
  const { showAlert } = useNotification();
  return { showAlert };
};

export const usePromptDialog = () => {
  const { showPrompt } = useNotification();
  return { showPrompt };
};
