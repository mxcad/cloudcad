import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';

interface DeleteUserConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  deleteImmediately: boolean;
  onDeleteImmediatelyChange: (value: boolean) => void;
}

export function DeleteUserConfirm({
  isOpen,
  onClose,
  onConfirm,
  loading,
  deleteImmediately,
  onDeleteImmediatelyChange,
}: DeleteUserConfirmProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="确认删除用户"
      footer={
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={onConfirm} disabled={loading} className="danger-btn">
            {loading ? (
              <><Loader2 size={18} className="animate-spin" />删除中...</>
            ) : deleteImmediately ? (
              '立即注销'
            ) : (
              '确认删除'
            )}
          </Button>
        </div>
      }
    >
      <div className="delete-confirm-content">
        <div className="delete-warning-box">
          <AlertCircle size={24} />
          <div>
            <p className="delete-warning-title">注销用户</p>
            <p className="delete-warning-text">
              {deleteImmediately
                ? '立即注销将彻底删除用户数据，无法恢复！'
                : '用户注销后将进入30天冷静期，冷静期后数据将自动清理。'}
            </p>
          </div>
        </div>
        <p className="delete-confirm-text">确定要注销该用户吗？</p>
        <div className="delete-option">
          <input
            type="checkbox"
            id="delete-immediately"
            checked={deleteImmediately}
            onChange={(e) => onDeleteImmediatelyChange(e.target.checked)}
            className="delete-option-checkbox"
          />
          <label htmlFor="delete-immediately" className="delete-option-label">
            立即注销（不等待30天冷静期，直接清理数据）
          </label>
        </div>
      </div>
    </Modal>
  );
}
