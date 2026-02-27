import { X } from 'lucide-react';
import React from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-md',
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full ${maxWidth} overflow-hidden transform transition-all scale-100`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  label: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  loading?: boolean;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  title,
  label,
  defaultValue = '',
  onSubmit,
  loading,
}) => {
  const [value, setValue] = React.useState(defaultValue);

  React.useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!value.trim() || loading}>
            {loading ? '提交中...' : '确定'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {label}
        </label>
        <input
          autoFocus
          type="text"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    </Modal>
  );
};
