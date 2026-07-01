import React, { useEffect } from 'react';
import { HardDrive, Save } from 'lucide-react';
import { t } from '@/languages';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';
import { FileSizeInput } from '@/components/ui/FileSize';

interface UserQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  user: { nickname?: string; username?: string; avatar?: string } | null;
  quota: number;
  defaultQuota: number;
  quotaIsDefault?: boolean;
  onQuotaChange: (quota: number) => void;
}

export function UserQuotaModal({
  isOpen,
  onClose,
  onSave,
  loading,
  user,
  quota,
  defaultQuota,
  quotaIsDefault,
  onQuotaChange,
}: UserQuotaModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("配置存储配额")}
      className="max-w-md"
      footer={
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={loading}>{t("取消")}</Button>
          <Button onClick={onSave} disabled={loading} className="submit-btn">
            {loading ? (
              <><Loader2 size={18} className="animate-spin" />{t("保存中...")}</>
            ) : (
              <><Save size={16} className="mr-1" />{t("保存")}</>
            )}
          </Button>
        </div>
      }
    >
      <div className="quota-config-content">
        <div className="quota-user-info">
          <div className="user-avatar-sm">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt=""
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            ) : null}
            {!user?.avatar || <User size={20} />}
          </div>
          <div className="user-info-text">
            <p className="user-name">{user?.nickname || user?.username || t('用户')}</p>
            <p className="user-username">@{user?.username}</p>
          </div>
        </div>
        <div className="quota-form">
          <label className="quota-label">
            <HardDrive size={16} />
            <span>{t("个人空间存储配额")}</span>
          </label>
          <FileSizeInput
            value={quota > 0 ? quota * 1024 * 1024 * 1024 : 0}
            onChange={(bytes) => {
              if (bytes === undefined) return;
              onQuotaChange(parseFloat((bytes / (1024 * 1024 * 1024)).toFixed(2)));
            }}
            min={0}
            defaultUnit="GB"
            units={['MB', 'GB', 'TB']}
          />
          <p className="quota-hint">
            {t("默认配额：")}{defaultQuota} GB
            {quota === 0 && <span style={{ color: 'var(--text-muted)' }}>{t("（跟随系统）")}</span>}
          </p>
          <div className="quota-preview">
            <div className="quota-bar">
              <div className="quota-bar-fill" style={{ width: '0%' }} />
            </div>
            <p className="quota-text">
              {t("已配置：")}{quota > 0 ? quota : defaultQuota} GB
              {(quota === 0 || quotaIsDefault) && (
                <span style={{ color: 'var(--text-tertiary)' }}>{t("（默认）")}</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
