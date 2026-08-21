import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import styles from '../RoleManagement.module.css';

interface DeleteRoleModalProps {
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteRoleModal({
  isOpen,
  loading,
  onClose,
  onConfirm,
}: DeleteRoleModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('确认删除角色')}
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={styles.dangerBtn}
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                {t('删除中...')}
              </>
            ) : (
              t('确认删除')
            )}
          </Button>
        </div>
      }
    >
      <div className={styles.deleteConfirmContent}>
        <div className={styles.deleteWarningBox}>
          <AlertCircle size={24} />
          <div>
            <p className={styles.deleteWarningTitle}>{t('重要提示')}</p>
            <p className={styles.deleteWarningText}>
              {t(
                '删除后，属于该角色的用户将需要重新分配角色。此操作不可恢复。'
              )}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
