import React from 'react';
import { t } from '@/languages';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';
import styles from '../UserManagement.module.css';

interface DeleteUserConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  /** 批量注销时的用户数（>1 时隐藏"立即注销"选项，批量仅软删防误永久删除） */
  count?: number;
  deleteImmediately: boolean;
  onDeleteImmediatelyChange: (value: boolean) => void;
}

export function DeleteUserConfirm({
  isOpen,
  onClose,
  onConfirm,
  loading,
  count,
  deleteImmediately,
  onDeleteImmediatelyChange,
}: DeleteUserConfirmProps) {
  const isBatch = count !== undefined;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('确认删除用户')}
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
                <Loader2 size={18} className="animate-spin" />
                {t('删除中...')}
              </>
            ) : isBatch ? (
              t('批量注销')
            ) : deleteImmediately ? (
              t('立即注销')
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
            <p className={styles.deleteWarningTitle}>{t('注销用户')}</p>
            <p className={styles.deleteWarningText}>
              {isBatch
                ? t('批量注销后用户将进入30天冷静期，冷静期后数据将自动清理。')
                : deleteImmediately
                  ? t('立即注销将彻底删除用户数据，无法恢复！')
                  : t('用户注销后将进入30天冷静期，冷静期后数据将自动清理。')}
            </p>
          </div>
        </div>
        <p className={styles.deleteConfirmText}>
          {isBatch
            ? t('确定要注销选中的 {count} 个用户吗？', {
                count: String(count),
              })
            : t('确定要注销该用户吗？')}
        </p>
        {!isBatch && (
          <div className={styles.deleteOption}>
            <input
              type="checkbox"
              id="delete-immediately"
              checked={deleteImmediately}
              onChange={(e) => onDeleteImmediatelyChange(e.target.checked)}
              className={styles.deleteOptionCheckbox}
            />
            <label
              htmlFor="delete-immediately"
              className={styles.deleteOptionLabel}
            >
              {t('立即注销（不等待30天冷静期，直接清理数据）')}
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
