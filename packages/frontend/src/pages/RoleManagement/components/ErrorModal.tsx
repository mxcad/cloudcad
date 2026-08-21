import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import styles from '../RoleManagement.module.css';

interface ErrorModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export function ErrorModal({ isOpen, message, onClose }: ErrorModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('提示')}
      footer={<Button onClick={onClose}>{t('确定')}</Button>}
    >
      <div className={styles.errorModalContent}>
        <AlertCircle size={24} className={styles.errorIcon} />
        <p>{message}</p>
      </div>
    </Modal>
  );
}
