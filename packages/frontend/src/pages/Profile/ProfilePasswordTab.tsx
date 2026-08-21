import React from 'react';
import { Lock, Key, CheckCircle, Shield } from 'lucide-react';
import { UserDto } from '@/api-sdk';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from './Profile.module.css';

interface ProfilePasswordTabProps {
  user?: UserDto | null;
  passwordForm: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  };
  focusedField: string | null;
  passwordStrength: { strength: number; label: string; color: string };
  loading: boolean;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  onFocusField: (field: string | null) => void;
  onNavigate: (path: string) => void;
}

export const ProfilePasswordTab: React.FC<ProfilePasswordTabProps> = ({
  user,
  passwordForm,
  focusedField,
  passwordStrength,
  loading,
  onPasswordChange,
  onPasswordSubmit,
  onFocusField,
  onNavigate,
}) => {
  return (
    <div className={`${styles.tabContent} animate-fade-in`}>
      <form onSubmit={onPasswordSubmit} className={styles.passwordForm}>
        {user?.hasPassword !== false && (
          <div
            className={`${styles.inputGroup} ${focusedField === 'oldPassword' ? styles.inputGroupFocused : ''}`}
          >
            <label className={styles.inputLabel}>
              <Lock size={14} />
              {t('当前密码')}
            </label>
            <div className={styles.inputWrapper}>
              <Input
                type="password"
                name="oldPassword"
                value={passwordForm.oldPassword}
                onChange={onPasswordChange}
                onFocus={() => onFocusField('oldPassword')}
                onBlur={() => onFocusField(null)}
                placeholder={t('请输入当前密码')}
                required={!user || user.hasPassword === true}
                showPasswordToggle
              />
              <div className={styles.inputGlow} />
            </div>
            <div className={styles.fieldHint}>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => onNavigate('/forgot-password')}
              >
                {t('忘记密码？')}
              </Button>
            </div>
          </div>
        )}

        {user?.hasPassword === false && (
          <div className={styles.noPasswordHint}>
            <div className={styles.hintIcon}>
              <Key size={24} />
            </div>
            <div className={styles.hintContent}>
              <h4>{t('设置密码')}</h4>
              <p>
                {t(
                  '您的账户是通过手机号或微信自动创建的，尚未设置密码。设置密码后可使用账号密码登录。'
                )}
              </p>
            </div>
          </div>
        )}

        <div
          className={`${styles.inputGroup} ${focusedField === 'newPassword' ? styles.inputGroupFocused : ''}`}
        >
          <label className={styles.inputLabel}>
            <Key size={14} />
            {t('新密码')}
          </label>
          <div className={styles.inputWrapper}>
            <Input
              type="password"
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={onPasswordChange}
              onFocus={() => onFocusField('newPassword')}
              onBlur={() => onFocusField(null)}
              placeholder={t('至少8位，包含大小写字母和数字')}
              required
              showPasswordToggle
            />
            <div className={styles.inputGlow} />
          </div>
          {passwordForm.newPassword && (
            <div className={styles.passwordStrength}>
              <div className={styles.strengthBar}>
                <div
                  className={styles.strengthFill}
                  style={{
                    width: `${(passwordStrength.strength / 4) * 100}%`,
                    background: passwordStrength.color,
                  }}
                />
              </div>
              <span
                className={styles.strengthLabel}
                style={{ color: passwordStrength.color }}
              >
                {passwordStrength.label}
              </span>
            </div>
          )}
        </div>

        <div
          className={`${styles.inputGroup} ${focusedField === 'confirmPassword' ? styles.inputGroupFocused : ''}`}
        >
          <label className={styles.inputLabel}>
            <CheckCircle size={14} />
            {t('确认新密码')}
          </label>
          <div className={styles.inputWrapper}>
            <Input
              type="password"
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={onPasswordChange}
              onFocus={() => onFocusField('confirmPassword')}
              onBlur={() => onFocusField(null)}
              placeholder={t('再次输入新密码')}
              required
              showPasswordToggle
            />
            <div className={styles.inputGlow} />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={loading}
          icon={CheckCircle}
          className="w-full"
        >
          {loading
            ? t('提交中...')
            : user?.hasPassword === false
              ? t('设置密码')
              : t('修改密码')}
        </Button>

        <div className={styles.securityTips}>
          <h4>
            <Shield size={16} />
            {t('安全建议')}
          </h4>
          <ul>
            <li>{t('密码长度至少 8 个字符')}</li>
            <li>{t('包含大小写字母和数字')}</li>
            <li>{t('避免使用常见的密码组合')}</li>
            <li>{t('不要在多个网站使用相同的密码')}</li>
          </ul>
        </div>
      </form>
    </div>
  );
};
