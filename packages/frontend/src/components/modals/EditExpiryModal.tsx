import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { t } from '@/languages';
import {
  ExpirationOption,
  detectExpiration,
  computeExpiresAt,
} from '@/constants/share';
import { ExpirationPicker } from './ExpirationPicker';

interface EditExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExpiresAt: string | null;
  onSave: (expiresAt: string | null) => Promise<void>;
}

export const EditExpiryModal: React.FC<EditExpiryModalProps> = ({
  isOpen,
  onClose,
  currentExpiresAt,
  onSave,
}) => {
  const detected = detectExpiration(currentExpiresAt);
  const [expiration, setExpiration] = useState<ExpirationOption>(
    detected.option
  );
  const [customDays, setCustomDays] = useState(detected.customDays);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const d = detectExpiration(currentExpiresAt);
      setExpiration(d.option);
      setCustomDays(d.customDays);
    }
  }, [isOpen, currentExpiresAt]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const expiresAt = computeExpiresAt(expiration, customDays);
      await onSave(expiresAt);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('修改有效期')} size="sm">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '8px 0',
        }}
      >
        <div>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
              fontWeight: 500,
              display: 'block',
              marginBottom: '8px',
            }}
          >
            {t('有效期')}
          </span>
          <ExpirationPicker
            expiration={expiration}
            onExpirationChange={setExpiration}
            customDays={customDays}
            onCustomDaysChange={setCustomDays}
          />
        </div>
        <div
          style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
        >
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('取消')}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {t('保存')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default EditExpiryModal;
