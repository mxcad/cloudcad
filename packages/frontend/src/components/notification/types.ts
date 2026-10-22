import type { ToastType } from '../ui/Toast';

export type DialogType = 'danger' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** 点击整卡触发（右上角关闭按钮独立） */
  onClick?: () => void;
  /** 展示时长，默认 5000ms */
  duration?: number;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  dialogType: DialogType;
}

export interface ThreeButtonDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  discardText: string;
  cancelText: string;
  dialogType: DialogType;
}

export interface PromptDialogState {
  isOpen: boolean;
  title: string;
  label: string;
  defaultValue: string;
  confirmText: string;
  cancelText: string;
  multiline: boolean;
  required: boolean;
}
