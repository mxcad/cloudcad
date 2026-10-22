import React, { useRef, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Info } from 'lucide-react';
import { X } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Z_LAYERS } from '@/constants/layers';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** 点击整卡触发（右上角关闭按钮独立） */
  onClick?: () => void;
}

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  /** 提供时整卡可点击：点击后触发回调并收起本条 */
  onClick?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  onClick,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const btn = closeRef.current;
    if (!btn) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    btn.addEventListener('click', handler);
    btn.addEventListener('touchend', handler);
    return () => {
      btn.removeEventListener('click', handler);
      btn.removeEventListener('touchend', handler);
    };
  }, [onClose]);

  const iconColorStyles = {
    success: 'text-[var(--success)]',
    error: 'text-[var(--error)]',
    warning: 'text-[var(--warning)]',
    info: 'text-[var(--info)]',
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-slide-in-right border border-[var(--border-default)] bg-[var(--bg-elevated)] ${
        onClick
          ? 'cursor-pointer transition-colors hover:bg-[var(--bg-tertiary)]'
          : ''
      }`}
      style={{ color: 'var(--text-primary)' }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? message : undefined}
      onClick={onClick ? () => {
        onClick();
        onClose();
      } : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
          onClose();
        }
      } : undefined}
    >
      {type === 'success' && (
        <CheckCircle size={20} className={iconColorStyles[type]} />
      )}
      {type === 'error' && (
        <AlertCircle size={20} className={iconColorStyles[type]} />
      )}
      {type === 'info' && <Info size={20} className={iconColorStyles[type]} />}
      {type === 'warning' && (
        <AlertCircle size={20} className={iconColorStyles[type]} />
      )}
      <span className="text-sm font-medium flex-1">{message}</span>
      {onClick && (
        <ChevronRight
          size={16}
          className="flex-shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
        />
      )}
      <button
        ref={closeRef}
        type="button"
        className="ml-2 p-2 rounded-lg opacity-60 hover:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-tertiary)', minWidth: 36, minHeight: 36 }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
}) => {
  return (
    <div
      className="fixed right-6 bottom-6 flex flex-col-reverse gap-3 z-[var(--z-toast)]"
      style={{ zIndex: Z_LAYERS.TOAST }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClick={toast.onClick}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
};
