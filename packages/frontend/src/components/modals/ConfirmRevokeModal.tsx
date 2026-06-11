import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface ConfirmRevokeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  loading?: boolean;
}

export const ConfirmRevokeModal: React.FC<ConfirmRevokeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = '确认撤销',
  message = '确定要撤销此分享链接？链接失效后访问者将无法打开图纸。',
  loading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={loading}
            style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
          >
            确认撤销
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmRevokeModal;
