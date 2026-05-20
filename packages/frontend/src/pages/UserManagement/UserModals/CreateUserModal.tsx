import React from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserModalProps['formData']) => void;
  roles: Array<{ id: string; name: string; isSystem?: boolean }>;
  mailEnabled: boolean;
  loading: boolean;
  formData: {
    username: string;
    email: string;
    phone: string;
    password: string;
    roleId: string;
    nickname: string;
  };
  formErrors: { username: string; email: string; password: string };
  onFormChange: (field: string, value: string) => void;
}

export function CreateUserModal({
  isOpen,
  onClose,
  onSubmit,
  roles,
  mailEnabled,
  loading,
  formData,
  formErrors,
  onFormChange,
}: CreateUserModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="添加新用户"
      className="max-w-lg"
      footer={
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading} className="submit-btn">
            {loading ? <><Loader2 size={18} className="animate-spin" />处理中...</> : '创建用户'}
          </Button>
        </div>
      }
    >
      <form className="user-form">
        <div className="form-row">
          <div className={`form-group ${formErrors.username ? 'has-error' : ''}`}>
            <label className="form-label">用户名 <span className="required">*</span></label>
            <Input
              type="text"
              value={formData.username}
              onChange={(e) => onFormChange('username', e.target.value)}
              placeholder="3-20个字符，只能包含字母、数字和下划线"
            />
            {formErrors.username && <span className="error-text">{formErrors.username}</span>}
          </div>
          <div className={`form-group ${formErrors.email ? 'has-error' : ''}`}>
            <label className="form-label">邮箱 {mailEnabled && <span className="required">*</span>}</label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => onFormChange('email', e.target.value)}
              placeholder={mailEnabled ? '请输入邮箱地址' : '可选，用于接收通知'}
            />
            {formErrors.email && <span className="error-text">{formErrors.email}</span>}
          </div>
        </div>
        <div className="form-row">
          <div className={`form-group ${formErrors.password ? 'has-error' : ''}`}>
            <label className="form-label">密码 <span className="required">*</span></label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => onFormChange('password', e.target.value)}
              placeholder="至少8个字符"
            />
            {formErrors.password && <span className="error-text">{formErrors.password}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">昵称</label>
            <Input
              type="text"
              value={formData.nickname}
              onChange={(e) => onFormChange('nickname', e.target.value)}
              placeholder="请输入昵称"
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">角色 <span className="required">*</span></label>
          <Select
            value={formData.roleId}
            onChange={(value) => onFormChange('roleId', value)}
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
            placeholder="请选择角色"
          />
        </div>
      </form>
    </Modal>
  );
}
