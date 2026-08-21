import React from 'react';
import { Mail, Shield, CheckCircle, Send } from 'lucide-react';
import { UserDto } from '@/api-sdk';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from './Profile.module.css';

interface EmailForm {
  email: string;
  code: string;
}

interface ProfileEmailTabProps {
  user?: UserDto | null;
  emailForm: EmailForm;
  emailStep: 'input' | 'verify' | 'verifyOld' | 'inputNew' | 'verifyNew';
  isEditingEmail: boolean;
  countdown: number;
  sendingCode: boolean;
  loading: boolean;
  focusedField: string | null;
  mailEnabled?: boolean;
  /** 解绑模式：原邮箱验证通过后直接解绑（而非换绑） */
  unbindMode?: boolean;
  onFocusField: (field: string | null) => void;
  onEmailChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendBindCode: (e: React.FormEvent) => void;
  onVerifyBindEmail: (e: React.FormEvent) => void;
  onResendBindCode?: () => void;
  onSendUnbindCode: () => void;
  onVerifyOldEmail: (e: React.FormEvent) => void;
  onSendNewEmailCode: () => void;
  onRebindEmail: (e: React.FormEvent) => void;
  onUnbindEmail: () => void;
  onSetEditingEmail: (editing: boolean) => void;
}

function createChangeEvent(
  name: string,
  value: string
): React.ChangeEvent<HTMLInputElement> {
  return { target: { name, value } } as React.ChangeEvent<HTMLInputElement>;
}

export const ProfileEmailTab: React.FC<ProfileEmailTabProps> = ({
  user,
  emailForm,
  emailStep,
  isEditingEmail,
  countdown,
  sendingCode,
  loading,
  focusedField,
  mailEnabled = false,
  unbindMode = false,
  onFocusField,
  onEmailChange,
  onSendBindCode,
  onVerifyBindEmail,
  onResendBindCode,
  onSendUnbindCode,
  onVerifyOldEmail,
  onSendNewEmailCode,
  onRebindEmail,
  onUnbindEmail,
  onSetEditingEmail,
}) => {
  const email = user?.email;

  if (email && !isEditingEmail) {
    return (
      <div className={`${styles.tabContent} animate-fade-in`}>
        <div className={styles.emailBound}>
          <div className={styles.successIcon}>
            <CheckCircle size={48} />
          </div>
          <h3>{t('邮箱已绑定')}</h3>
          <p className={styles.boundEmail}>{email}</p>
          <div className={styles.benefits}>
            <div className={styles.benefitItem}>
              <CheckCircle size={14} />
              <span>{t('找回密码')}</span>
            </div>
            <div className={styles.benefitItem}>
              <CheckCircle size={14} />
              <span>{t('安全验证')}</span>
            </div>
            <div className={styles.benefitItem}>
              <CheckCircle size={14} />
              <span>{t('重要通知')}</span>
            </div>
          </div>
          {mailEnabled && (
            <div className={styles.buttonGroup}>
              <Button
                variant="primary"
                icon={Mail}
                onClick={() => onSetEditingEmail(true)}
              >
                {t('换绑邮箱')}
              </Button>
              <Button variant="danger" onClick={onUnbindEmail}>
                {t('解绑邮箱')}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isRebind = !!email;

  if (isRebind && emailStep === 'verifyOld') {
    return (
      <div className={`${styles.tabContent} animate-fade-in`}>
        <form onSubmit={onVerifyOldEmail} className={styles.emailForm}>
          <div className={styles.verifyNotice}>
            <CheckCircle size={16} />
            <span>
              {unbindMode
                ? t('需要先验证原邮箱才能解绑')
                : t('需要先验证原邮箱才能换绑')}
            </span>
          </div>
          <div
            className={`${styles.inputGroup} ${focusedField === 'code' ? styles.inputGroupFocused : ''}`}
          >
            <label className={styles.inputLabel}>
              <Mail size={14} />
              {t('原邮箱验证码')}
            </label>
            <div
              className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
            >
              <Input
                type="text"
                name="code"
                value={emailForm.code}
                onChange={onEmailChange}
                onFocus={() => onFocusField('code')}
                onBlur={() => onFocusField(null)}
                placeholder={t('请输入原邮箱验证码')}
                maxLength={6}
                required
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={countdown > 0}
                loading={sendingCode}
                onClick={onSendUnbindCode}
              >
                {countdown > 0 ? `${countdown}s` : t('获取验证码')}
              </Button>
              <div className={styles.inputGlow} />
            </div>
          </div>
          <div className={styles.buttonGroup}>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onSetEditingEmail(false)}
            >
              {t('取消')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={CheckCircle}
            >
              {loading ? t('验证中...') : t('验证')}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (isRebind && (emailStep === 'inputNew' || emailStep === 'verifyNew')) {
    return (
      <div className={`${styles.tabContent} animate-fade-in`}>
        <form onSubmit={onRebindEmail} className={styles.emailForm}>
          {emailStep === 'inputNew' && (
            <div className={styles.verifySuccess}>
              <CheckCircle size={16} />
              <span>{t('原邮箱验证成功，请输入新邮箱')}</span>
            </div>
          )}
          <div
            className={`${styles.inputGroup} ${focusedField === 'email' ? styles.inputGroupFocused : ''}`}
          >
            <label className={styles.inputLabel}>
              <Mail size={14} />
              {emailStep === 'verifyNew' ? t('新邮箱地址') : t('邮箱地址')}
            </label>
            <div
              className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
            >
              <Input
                type="email"
                name="email"
                value={emailForm.email}
                onChange={onEmailChange}
                onFocus={() => onFocusField('email')}
                onBlur={() => onFocusField(null)}
                placeholder={t('请输入邮箱地址')}
                readOnly={emailStep === 'verifyNew'}
                required
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={countdown > 0}
                loading={sendingCode}
                onClick={onSendNewEmailCode}
              >
                {countdown > 0 ? `${countdown}s` : t('获取验证码')}
              </Button>
              <div className={styles.inputGlow} />
            </div>
          </div>
          {emailStep === 'verifyNew' && (
            <div
              className={`${styles.inputGroup} ${focusedField === 'code' ? styles.inputGroupFocused : ''}`}
            >
              <label className={styles.inputLabel}>
                <CheckCircle size={14} />
                {t('验证码')}
              </label>
              <div
                className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
              >
                <Input
                  type="text"
                  name="code"
                  value={emailForm.code}
                  onChange={onEmailChange}
                  onFocus={() => onFocusField('code')}
                  onBlur={() => onFocusField(null)}
                  placeholder={t('请输入 6 位验证码')}
                  maxLength={6}
                  required
                />
                <div className={styles.inputGlow} />
              </div>
            </div>
          )}
          <div className={styles.buttonGroup}>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onSetEditingEmail(false)}
            >
              {t('取消')}
            </Button>
            {emailStep === 'verifyNew' && (
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={CheckCircle}
              >
                {loading ? t('换绑中...') : t('确认换绑')}
              </Button>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={`${styles.tabContent} animate-fade-in`}>
      <div className={styles.emailForm}>
        {emailStep === 'input' ? (
          <form onSubmit={onSendBindCode}>
            <div className={styles.infoText}>
              {t('绑定邮箱后，可以通过邮箱找回密码和接收重要通知')}
            </div>
            <div
              className={`${styles.inputGroup} ${focusedField === 'email' ? styles.inputGroupFocused : ''}`}
            >
              <label className={styles.inputLabel}>
                <Mail size={14} />
                {t('邮箱地址')}
              </label>
              <div className={styles.inputWrapper}>
                <Input
                  type="email"
                  name="email"
                  value={emailForm.email}
                  onChange={onEmailChange}
                  onFocus={() => onFocusField('email')}
                  onBlur={() => onFocusField(null)}
                  placeholder={t('请输入您的邮箱地址')}
                  required
                />
                <div className={styles.inputGlow} />
              </div>
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              icon={Send}
              className="w-full"
            >
              {loading ? t('发送中...') : t('发送验证码')}
            </Button>
          </form>
        ) : (
          <form onSubmit={onVerifyBindEmail}>
            <div className={styles.emailPreview}>
              <Mail size={20} />
              <span>{emailForm.email}</span>
            </div>
            <div
              className={`${styles.inputGroup} ${focusedField === 'code' ? styles.inputGroupFocused : ''}`}
            >
              <label className={styles.inputLabel}>
                <Shield size={14} />
                {t('验证码')}
              </label>
              <div
                className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
              >
                <Input
                  type="text"
                  name="code"
                  value={emailForm.code}
                  onChange={onEmailChange}
                  onFocus={() => onFocusField('code')}
                  onBlur={() => onFocusField(null)}
                  placeholder={t('请输入6位验证码')}
                  maxLength={6}
                  required
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={countdown > 0}
                  loading={sendingCode}
                  onClick={onResendBindCode}
                >
                  {countdown > 0 ? `${countdown}s` : t('获取验证码')}
                </Button>
                <div className={styles.inputGlow} />
              </div>
            </div>
            <div className={styles.buttonGroup}>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => onSetEditingEmail(false)}
              >
                {t('返回修改')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={CheckCircle}
              >
                {loading ? t('验证中...') : t('确认绑定')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
