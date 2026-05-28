import React from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';

interface SupportModalProps {
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ onClose }) => {
  return (
    <Modal isOpen onClose={onClose} title={t('账号已被禁用')}>
      <div className="space-y-4">
        <p style={{ color: 'var(--text-secondary)' }}>
          {t('您的账号已被禁用，无法登录系统。')}
          <br />
          {t('如有疑问，请联系客服人员获取帮助。')}
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('客服邮箱：')}</span>
            <a href="mailto:support@cloudcad.com" className="hover:underline" style={{ color: 'var(--primary-500)' }}>
              support@cloudcad.com
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('客服电话：')}</span>
            <a href="tel:400-123-4567" className="hover:underline" style={{ color: 'var(--primary-500)' }}>
              400-123-4567
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('工作时间：')}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{t('周一至周五 9:00-18:00')}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
