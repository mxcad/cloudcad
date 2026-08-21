import { createPortal } from 'react-dom';
import { ToastContainer } from '../ui/Toast';
import type { ToastItem } from './types';

interface ToastStackProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export function ToastStack({ toasts, onRemove }: ToastStackProps) {
  return createPortal(
    <ToastContainer toasts={toasts} onRemove={onRemove} />,
    document.body
  );
}
