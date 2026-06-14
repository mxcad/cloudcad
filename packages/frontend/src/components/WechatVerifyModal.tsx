import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface WechatVerifyModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export const WechatVerifyModal: React.FC<WechatVerifyModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="微信验证"
      footer={
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          微信验证功能开发中，敬请期待。
        </p>
      </div>
    </Modal>
  );
};
