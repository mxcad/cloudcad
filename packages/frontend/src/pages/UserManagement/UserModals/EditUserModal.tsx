import React from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  roles: Array<{ id: string; name: string; isSystem?: boolean }>;
  mailEnabled: boolean;
  loading: boolean;
  user: { username: string; email?: string; phone?: string; role?: { id: string }; nickname?: string; status?: string } | null;
  formData: {
    username: string;
    email: string;
    phone: string;
    password: string;
    roleId: string;
    nickname: string;
    status: string;
  };
  formErrors: { username: string; email: string; password: string };
  onFormChange: (field: string, value: string) => void;
}

export function EditUserModal({
  isOpen,
  onClose,
  onSubmit,
  roles,
  mailEnabled,
  loading,
  user,
  formData,
  formErrors,
  onFormChange,
}: EditUserModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="编辑用户"
      size="lg"
      footer={
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading} className="submit-btn">
            {loading ? <><Loader2 size={18} className="animate-spin" />处理中...</> : '保存修改'}
          </Button>
        </div>
      }
    >
      <form className="user-form">
        <div className="form-row">
          <div className={`form-group ${formErrors.username ? 'has-error' : ''}`}>
            <label className="form-label">用户名</label>
            <input type="text" value={formData.username} disabled className="form-input" />
          </div>
          <div className={`form-group ${formErrors.email ? 'has-error' : ''}`}>
            <label className="form-label">邮箱 {mailEnabled && <span className="required">*</span>}</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onFormChange('email', e.target.value)}
              className="form-input"
            />
            {formErrors.email && <span className="error-text">{formErrors.email}</span>}
          </div>
        </div>
        <div className="form-row">
          <div className={`form-group ${formErrors.password ? 'has-error' : ''}`}>
            <label className="form-label">新密码 <span className="optional">（留空则不修改）</span></label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => onFormChange('password', e.target.value)}
              className="form-input"
              placeholder="留空保持原密码"
            />
            {formErrors.password && <span className="error-text">{formErrors.password}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">昵称</label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => onFormChange('nickname', e.target.value)}
              className="form-input"
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">角色 <span className="required">*</span></label>
          <select
            value={formData.roleId}
            onChange={(e) => onFormChange('roleId', e.target.value)}
            className="form-select"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">账户状态</label>
          <select
            value={formData.status}
            onChange={(e) => onFormChange('status', e.target.value)}
            className="form-select"
          >
            <option value="ACTIVE">正常</option>
            <option value="INACTIVE">未激活</option>
            <option value="SUSPENDED">已禁用</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
