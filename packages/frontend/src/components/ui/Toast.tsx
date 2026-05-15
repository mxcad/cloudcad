import React from 'react';
import { CheckCircle } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Info } from 'lucide-react';
import { X } from 'lucide-react';
import { Z_LAYERS } from '@/constants/layers';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const typeStyles = {
    success: 'bg-[var(--success-light)] text-[var(--success)] border-[var(--success-dim)]',
    error: 'bg-[var(--error-light)] text-[var(--error)] border-[var(--error-dim)]',
    warning: 'bg-[var(--warning-light)] text-[var(--warning)] border-[var(--warning-dim)]',
    info: 'bg-[var(--info-light)] text-[var(--info)] border-[var(--info-dim)]',
  };

  const iconColorStyles = {
    success: 'text-[var(--success)]',
    error: 'text-[var(--error)]',
    warning: 'text-[var(--warning)]',
    info: 'text-[var(--info)]',
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-slide-in-top border ${typeStyles[type]}`}
    >
      {type === 'success' && <CheckCircle size={20} className={iconColorStyles[type]} />}
      {type === 'error' && <AlertCircle size={20} className={iconColorStyles[type]} />}
      {type === 'info' && <Info size={20} className={iconColorStyles[type]} />}
      {type === 'warning' && <AlertCircle size={20} className={iconColorStyles[type]} />}
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="text-current opacity-60 hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-black/5"
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
      className="fixed left-1/2 -translate-x-1/2 space-y-3 z-[var(--z-toast)] sm:top-[250px] top-[80px] sm:max-w-[480px] w-[calc(100%-2rem)]"
      style={{ zIndex: Z_LAYERS.TOAST }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
};