import React from 'react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { getRoleDisplayName } from '@/constants/permissions';
import styles from '../UserManagement.module.css';

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
  formErrors: {
    username: string;
    email: string;
    password: string;
    phone: string;
    nickname: string;
  };
  onFormChange: (field: string, value: string) => void;
  /** 提交失败（如用户名重名）的错误消息，展示在弹窗表单顶部 */
  submitError?: string | null;
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
  submitError,
}: CreateUserModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('添加新用户')}
      className="max-w-lg"
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className={styles.submitBtn}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t('处理中...')}
              </>
            ) : (
              t('创建用户')
            )}
          </Button>
        </div>
      }
    >
      <form className={styles.userForm}>
        {submitError && (
          <div className={styles.formErrorBanner} role="alert">
            {submitError}
          </div>
        )}
        <div className={styles.formRow}>
          <div
            className={`${styles.formGroup} ${formErrors.username ? styles.hasError : ''}`}
          >
            <label className={styles.formLabel}>
              {t('用户名')} <span className={styles.required}>*</span>
            </label>
            <Input
              type="text"
              value={formData.username}
              onChange={(e) => onFormChange('username', e.target.value)}
              placeholder={t('3-20个字符，只能包含字母、数字和下划线')}
            />
            {formErrors.username && (
              <span className={styles.errorText}>{formErrors.username}</span>
            )}
          </div>
          <div
            className={`${styles.formGroup} ${formErrors.email ? styles.hasError : ''}`}
          >
            <label className={styles.formLabel}>
              {t('邮箱')}{' '}
              {mailEnabled && <span className={styles.required}>*</span>}
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => onFormChange('email', e.target.value)}
              placeholder={
                mailEnabled ? t('请输入邮箱地址') : t('可选，用于接收通知')
              }
            />
            {formErrors.email && (
              <span className={styles.errorText}>{formErrors.email}</span>
            )}
          </div>
        </div>
        <div className={styles.formRow}>
          <div
            className={`${styles.formGroup} ${formErrors.password ? styles.hasError : ''}`}
          >
            <label className={styles.formLabel}>
              {t('密码')} <span className={styles.required}>*</span>
            </label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => onFormChange('password', e.target.value)}
              placeholder={t('至少8个字符')}
              showPasswordToggle
            />
            {formErrors.password && (
              <span className={styles.errorText}>{formErrors.password}</span>
            )}
          </div>
          <div
            className={`${styles.formGroup} ${formErrors.nickname ? styles.hasError : ''}`}
          >
            <label className={styles.formLabel}>{t('昵称')}</label>
            <Input
              type="text"
              value={formData.nickname}
              onChange={(e) => onFormChange('nickname', e.target.value)}
              placeholder={t('请输入昵称')}
            />
            {formErrors.nickname && (
              <span className={styles.errorText}>{formErrors.nickname}</span>
            )}
          </div>
        </div>
        <div className={styles.formRow}>
          <div
            className={`${styles.formGroup} ${formErrors.phone ? styles.hasError : ''}`}
          >
            <label className={styles.formLabel}>{t('手机号')}</label>
            <Input
              type="text"
              value={formData.phone}
              onChange={(e) => onFormChange('phone', e.target.value)}
              placeholder={t('请输入手机号')}
            />
            {formErrors.phone && (
              <span className={styles.errorText}>{formErrors.phone}</span>
            )}
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            {t('角色')} <span className={styles.required}>*</span>
          </label>
          <Select
            value={formData.roleId}
            onChange={(value) => onFormChange('roleId', value)}
            options={roles.map((role) => ({
              value: role.id,
              label: getRoleDisplayName(role.name, role.isSystem ?? false),
            }))}
            placeholder={t('请选择角色')}
          />
        </div>
      </form>
    </Modal>
  );
}
