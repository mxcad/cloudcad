import React, { useEffect } from 'react';
import { HardDrive, Save } from 'lucide-react';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';

interface UserQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  user: { nickname?: string; username?: string; avatar?: string } | null;
  quota: number;
  defaultQuota: number;
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
  onQuotaChange,
}: UserQuotaModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="配置存储配额"
      size="md"
      footer={
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={onSave} disabled={loading} className="submit-btn">
            {loading ? (
              <><Loader2 size={18} className="animate-spin" />保存中...</>
            ) : (
              <><Save size={16} className="mr-1" />保存</>
            )}
          </Button>
        </div>
      }
    >
      <div className="quota-config-content">
        <div className="quota-user-info">
          <div className="user-avatar-sm">
            {user?.avatar ? <img src={user.avatar} alt="" /> : <User size={20} />}
          </div>
          <div className="user-info-text">
            <p className="user-name">{user?.nickname || user?.username || '用户'}</p>
            <p className="user-username">@{user?.username}</p>
          </div>
        </div>
        <div className="quota-form">
          <label className="quota-label">
            <HardDrive size={16} />
            <span>个人空间存储配额</span>
          </label>
          <div className="quota-input-wrapper">
            <input
              type="number"
              value={quota}
              onChange={(e) => {
                const gb = parseInt(e.target.value, 10);
                if (!isNaN(gb) && gb >= 0) {
                  onQuotaChange(gb);
                }
              }}
              className="quota-input"
              min="0"
              step="1"
            />
            <span className="quota-unit">GB</span>
          </div>
          <p className="quota-hint">默认配额：{defaultQuota} GB</p>
          <div className="quota-preview">
            <div className="quota-bar">
              <div className="quota-bar-fill" style={{ width: '0%' }} />
            </div>
            <p className="quota-text">已配置：{quota} GB</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
