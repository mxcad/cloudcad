import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface SaveConfirmModalProps {
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (message: string) => void;
}

export const SaveConfirmModal: React.FC<SaveConfirmModalProps> = ({
  isOpen,
  loading,
  onClose,
  onConfirm,
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      // 自动聚焦到输入框
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm(message.trim());
  };

  const handleClose = () => {
    if (!loading) {
      setMessage('');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="保存文件"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            修改说明（可选）
          </label>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="请输入本次修改的内容说明..."
            rows={4}
            disabled={loading}
          />
        </div>
        <p className="text-sm text-slate-500">
          此说明将记录在版本历史中，方便后续查看修改内容。
          <br />
          <span className="text-slate-400">提示：按 Ctrl+Enter 快速保存</span>
        </p>
      </div>
    </Modal>
  );
};

export default SaveConfirmModal;
