import React from 'react';
import { Lock, Key, CheckCircle, Shield } from 'lucide-react';
import { UserDto } from '@/api-sdk';
import { Input } from '@/components/ui/Input';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import { passwordPlaceholder, usePasswordPolicy } from '@/lib/passwordPolicy';
import styles from './Profile.module.css';

interface ProfilePasswordTabProps {
  user?: UserDto | null;
  passwordForm: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
    totpCode: string;
  };
  /** #415 当前用户改密是否需要 TOTP 动态码（服务端算好下发），true 时渲染动态码字段 */
  passwordChangeRequiresMfa?: boolean;
  focusedField: string | null;
  loading: boolean;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  onFocusField: (field: string | null) => void;
  onNavigate: (path: string) => void;
}

export const ProfilePasswordTab: React.FC<ProfilePasswordTabProps> = ({
  user,
  passwordForm,
  passwordChangeRequiresMfa,
  focusedField,
  loading,
  onPasswordChange,
  onPasswordSubmit,
  onFocusField,
  onNavigate,
}) => {
  // 口令要求提示由生效策略值推导（/runtime-config/public 下发），禁写死策略数字
  const policy = usePasswordPolicy();
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
                autoComplete="current-password"
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
                type="button"
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
            <Lock size={14} />
            {t('新密码')}
          </label>
          <div className={styles.inputWrapper}>
            <Input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={onPasswordChange}
              onFocus={() => onFocusField('newPassword')}
              onBlur={() => onFocusField(null)}
              placeholder={passwordPlaceholder(policy)}
              required
              showPasswordToggle
            />
            <div className={styles.inputGlow} />
          </div>
          {/* 强度条 + 要求清单走共享组件（唯一呈现出口）：清单常显，兼作
              提交失败时的错误信号 */}
          <PasswordStrength
            password={passwordForm.newPassword}
            policy={policy}
          />
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
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={onPasswordChange}
              onFocus={() => onFocusField('confirmPassword')}
              onBlur={() => onFocusField(null)}
              placeholder={t('请再次输入新密码')}
              required
              showPasswordToggle
            />
            <div className={styles.inputGlow} />
          </div>
        </div>

        {/* #415 TOTP step-up：仅当服务端判定当前用户改密需动态码时渲染 */}
        {passwordChangeRequiresMfa && (
          <div
            className={`${styles.inputGroup} ${focusedField === 'totpCode' ? styles.inputGroupFocused : ''}`}
          >
            <label className={styles.inputLabel}>
              <Shield size={14} />
              {t('双因素动态码')}
            </label>
            <div className={styles.inputWrapper}>
              <Input
                type="text"
                name="totpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={passwordForm.totpCode}
                onChange={onPasswordChange}
                onFocus={() => onFocusField('totpCode')}
                onBlur={() => onFocusField(null)}
                placeholder={t('请输入验证器 App 中的 6 位动态码')}
                required
              />
              <div className={styles.inputGlow} />
            </div>
          </div>
        )}

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
            {/* 长度 / 类别两条要求已上移到输入框下的实时清单（带 ✓/· 状态），此处只留通用建议 */}
            <li>{t('避免使用常见的密码组合')}</li>
            <li>{t('不要在多个网站使用相同的密码')}</li>
          </ul>
        </div>
      </form>
    </div>
  );
};
