import React from 'react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';
import { getRoleDisplayName } from '@/constants/permissions';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EditUserModalProps['formData']) => void;
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
      title={t("编辑用户")}
      className="max-w-lg"
      footer={
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={loading}>{t("取消")}</Button>
          <Button onClick={handleSubmit} disabled={loading} className="submit-btn">
            {loading ? <><Loader2 size={18} className="animate-spin" />{t("处理中...")}</> : t('保存修改')}
          </Button>
        </div>
      }
    >
      <form className="user-form">
        <div className="form-row">
          <div className={`form-group ${formErrors.username ? 'has-error' : ''}`}>
            <label className="form-label">{t("用户名")}</label>
            <Input type="text" value={formData.username} disabled />
          </div>
          <div className={`form-group ${formErrors.email ? 'has-error' : ''}`}>
            <label className="form-label">{t("邮箱")} {mailEnabled && <span className="required">*</span>}</label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => onFormChange('email', e.target.value)}
            />
            {formErrors.email && <span className="error-text">{formErrors.email}</span>}
          </div>
        </div>
        <div className="form-row">
          <div className={`form-group ${formErrors.password ? 'has-error' : ''}`}>
            <label className="form-label">{t("新密码")} <span className="optional">{t("（留空则不修改）")}</span></label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => onFormChange('password', e.target.value)}
              placeholder={t("留空保持原密码")}
              showPasswordToggle
            />
            {formErrors.password && <span className="error-text">{formErrors.password}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">{t("昵称")}</label>
            <Input
              type="text"
              value={formData.nickname}
              onChange={(e) => onFormChange('nickname', e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t("角色")} <span className="required">*</span></label>
          <Select
            value={formData.roleId}
            onChange={(value) => onFormChange('roleId', value)}
            options={roles.map((role) => ({ value: role.id, label: getRoleDisplayName(role.name, role.isSystem ?? false) }))}
            placeholder={t("请选择角色")}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t("账户状态")}</label>
          <Select
            value={formData.status}
            onChange={(value) => onFormChange('status', value)}
            options={[
              { value: 'ACTIVE', label: t('正常') },
              { value: 'INACTIVE', label: t('未激活') },
              { value: 'SUSPENDED', label: t('已禁用') },
            ]}
            placeholder={t("请选择状态")}
          />
        </div>
      </form>
    </Modal>
  );
}
