import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

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
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in-right ${
        type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200'
          : type === 'error'
            ? 'bg-red-50 text-red-800 border border-red-200'
            : type === 'warning'
              ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
      }`}
    >
      {type === 'success' && <CheckCircle size={20} />}
      {type === 'error' && <AlertCircle size={20} />}
      {type === 'info' && <Info size={20} />}
      {type === 'warning' && <AlertCircle size={20} />}
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="text-current opacity-70 hover:opacity-100 transition-opacity"
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
    <div className="fixed top-4 right-4 z-50 space-y-2">
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
