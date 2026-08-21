import React, { useRef, useState } from 'react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loader2, Upload } from 'lucide-react';
import { getRoleDisplayName } from '@/constants/permissions';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { usersControllerUploadUserAvatar } from '@/api-sdk';
import { getErrorMessage } from '@/utils/errorHandler';
import styles from '../UserManagement.module.css';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EditUserModalProps['formData']) => void;
  onAvatarUploaded?: () => void;
  roles: Array<{ id: string; name: string; isSystem?: boolean }>;
  mailEnabled: boolean;
  loading: boolean;
  user: {
    id: string;
    username: string;
    email?: string;
    phone?: string;
    role?: { id: string };
    nickname?: string;
    avatar?: string;
    status?: string;
  } | null;
  formData: {
    username: string;
    email: string;
    phone: string;
    password: string;
    roleId: string;
    nickname: string;
    avatar: string;
    status: string;
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

export function EditUserModal({
  isOpen,
  onClose,
  onSubmit,
  onAvatarUploaded,
  roles,
  mailEnabled,
  loading,
  user,
  formData,
  formErrors,
  onFormChange,
  submitError,
}: EditUserModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError(t('仅支持 PNG、JPEG、GIF、WebP 格式的图片'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError(t('头像文件大小不能超过 5MB'));
      return;
    }

    setAvatarUploading(true);
    setAvatarError('');

    try {
      const result = await usersControllerUploadUserAvatar({
        path: { id: user.id },
        body: { file } as never,
      });
      if (result.error) throw result.error;
      if (result.data?.avatar) {
        onFormChange('avatar', result.data.avatar);
        onAvatarUploaded?.();
      }
    } catch (err) {
      setAvatarError(getErrorMessage(err) || t('头像上传失败'));
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('编辑用户')}
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
              t('保存修改')
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
            <label className={styles.formLabel}>{t('用户名')}</label>
            <Input type="text" value={formData.username} disabled />
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
              {t('新密码')}{' '}
              <span className={styles.optional}>{t('（留空则不修改）')}</span>
            </label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => onFormChange('password', e.target.value)}
              placeholder={t('留空保持原密码')}
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
              value={formData.phone || ''}
              onChange={(e) => onFormChange('phone', e.target.value)}
              placeholder={t('请输入手机号')}
            />
            {formErrors.phone && (
              <span className={styles.errorText}>{formErrors.phone}</span>
            )}
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('头像')}</label>
          <div className={styles.avatarUploadRow}>
            <div className={styles.avatarUploadPreview}>
              <UserAvatar
                avatar={formData.avatar || ''}
                name={formData.nickname || formData.username}
                size={72}
              />
              {avatarUploading && (
                <div className={styles.avatarUploadSpinner}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}
            </div>
            <div className={styles.avatarUploadActions}>
              <Button
                type="button"
                variant="secondary"
                icon={Upload}
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {t('上传头像')}
              </Button>
              <span className={styles.avatarUploadHint}>
                {t('支持 PNG、JPEG、GIF、WebP，不超过 5MB')}
              </span>
              {avatarError && (
                <span className={styles.errorText}>{avatarError}</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
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
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('账户状态')}</label>
          <Select
            value={formData.status}
            onChange={(value) => onFormChange('status', value)}
            options={[
              { value: 'ACTIVE', label: t('正常') },
              { value: 'INACTIVE', label: t('未激活') },
              { value: 'SUSPENDED', label: t('已禁用') },
            ]}
            placeholder={t('请选择状态')}
          />
        </div>
      </form>
    </Modal>
  );
}
