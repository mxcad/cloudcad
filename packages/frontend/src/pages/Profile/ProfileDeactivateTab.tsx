import React, { useMemo } from 'react';
import { AlertTriangle, Lock, Phone, Mail, CheckCircle } from 'lucide-react';
import { Button, Select, Checkbox } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { Input } from '@/components/ui/Input';
import { WechatDeactivateConfirm } from './WechatDeactivateConfirm';
import { t } from '@/languages';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import styles from './Profile.module.css';

interface ProfileDeactivateTabProps {
  user?: {
    hasPassword?: boolean;
    phone?: string | { [key: string]: unknown } | null;
    phoneVerified?: boolean;
    email?: string | { [key: string]: unknown } | null;
    wechatId?: string | { [key: string]: unknown } | null;
  } | null;
  deactivateForm: {
    verificationMethod: 'password' | 'phone' | 'email' | 'wechat' | '';
    password: string;
    phoneCode: string;
    emailCode: string;
    /** 微信授权 code（授权成功由后端验证 openid 与账户绑定微信是否一致） */
    wechatCode: string;
    confirmed: boolean;
  };
  deactivateLoading: boolean;
  deactivatePhoneCountdown: number;
  deactivateEmailCountdown: number;
  loading: boolean;

  onVerificationMethodChange: (
    method: 'password' | 'phone' | 'email' | 'wechat' | ''
  ) => void;
  onPasswordChange: (value: string) => void;
  onPhoneCodeChange: (value: string) => void;
  onEmailCodeChange: (value: string) => void;
  onConfirmedChange: (confirmed: boolean) => void;
  onSendPhoneCode: () => void;
  onSendEmailCode: () => void;
  /** 微信授权成功回调（携带授权 code，后端换 openid 校验） */
  onWechatConfirm: (code: string) => void;
  onDeactivate: () => void;
  onShowConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
  }) => Promise<boolean>;
  onLogout: () => void;
}

export const ProfileDeactivateTab: React.FC<ProfileDeactivateTabProps> = ({
  user,
  deactivateForm,
  deactivateLoading,
  deactivatePhoneCountdown,
  deactivateEmailCountdown,
  loading,

  onVerificationMethodChange,
  onPasswordChange,
  onPhoneCodeChange,
  onEmailCodeChange,
  onConfirmedChange,
  onSendPhoneCode,
  onSendEmailCode,
  onWechatConfirm,
  onDeactivate,
  onShowConfirm,
  onLogout,
}) => {
  // 注销冷静期天数（运行时配置，默认 7）：期间重新登录自动取消注销
  const { config } = useRuntimeConfig();
  const graceDays = config.userCancelGraceDays ?? 7;

  const verificationOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [];
    if (user?.hasPassword)
      opts.push({ value: 'password', label: t('密码验证') });
    if (user?.phone && user.phoneVerified)
      opts.push({ value: 'phone', label: t('手机验证码') });
    if (user?.email) opts.push({ value: 'email', label: t('邮箱验证码') });
    if (user?.wechatId)
      opts.push({ value: 'wechat', label: t('微信扫码验证') });
    return opts;
  }, [
    user?.hasPassword,
    user?.phone,
    user?.phoneVerified,
    user?.email,
    user?.wechatId,
  ]);

  const canSubmit = () => {
    if (!deactivateForm.confirmed || !deactivateForm.verificationMethod)
      return false;
    if (
      deactivateForm.verificationMethod === 'password' &&
      !deactivateForm.password
    )
      return false;
    if (
      deactivateForm.verificationMethod === 'phone' &&
      !deactivateForm.phoneCode
    )
      return false;
    if (
      deactivateForm.verificationMethod === 'email' &&
      !deactivateForm.emailCode
    )
      return false;
    if (
      deactivateForm.verificationMethod === 'wechat' &&
      !deactivateForm.wechatCode
    )
      return false;
    return true;
  };

  const handleDeactivate = async () => {
    const confirmed = await onShowConfirm({
      title: t('确认注销'),
      message: t('确定要注销您的账户吗？冷静期内重新登录可自动取消注销，逾期需联系客服恢复。'),
      confirmText: t('确定注销'),
      cancelText: t('取消'),
      type: 'danger',
    });
    if (confirmed) {
      onDeactivate();
    }
  };

  return (
    <div className={`${styles.tabContent} animate-fade-in`}>
      <div className={styles.deactivateContent}>
        <div className={styles.warningIcon}>
          <AlertTriangle size={48} />
        </div>
        <h3>{t('注销账户')}</h3>
        <p className={styles.warningText}>
          {t(
            '注销账户后，{days} 天内重新登录可自动取消注销；逾期需联系客服恢复。30 天后账户数据将被彻底删除。',
            { days: String(graceDays) }
          )}
        </p>
        <div className={styles.warningList}>
          <div className={styles.warningItem}>
            <AlertTriangle size={14} />
            <span>
              {t('冷静期内（{days} 天）重新登录可自动取消注销', {
                days: String(graceDays),
              })}
            </span>
          </div>
          <div className={styles.warningItem}>
            <AlertTriangle size={14} />
            <span>{t('冷静期过后需联系客服恢复账户')}</span>
          </div>
          <div className={styles.warningItem}>
            <AlertTriangle size={14} />
            <span>{t('30 天后账户数据将被彻底删除，无法恢复')}</span>
          </div>
        </div>

        <div className={styles.deactivateForm}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>{t('选择验证方式')}</label>
            <Select
              value={deactivateForm.verificationMethod}
              onChange={(val) =>
                onVerificationMethodChange(
                  val as 'password' | 'phone' | 'email' | 'wechat' | ''
                )
              }
              options={verificationOptions}
              placeholder={t('请选择验证方式')}
            />
          </div>

          {deactivateForm.verificationMethod === 'password' && (
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>
                <Lock size={14} />
                {t('密码验证')}
              </label>
              <div className={styles.inputWrapper}>
                <Input
                  type="password"
                  value={deactivateForm.password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder={t('请输入密码')}
                  showPasswordToggle
                />
                <div className={styles.inputGlow} />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'phone' && (
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>
                <Phone size={14} />
                {t('手机验证码')}
              </label>
              <div
                className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
              >
                <Input
                  type="text"
                  value={deactivateForm.phoneCode}
                  onChange={(e) => onPhoneCodeChange(e.target.value)}
                  placeholder={t('请输入手机验证码')}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deactivatePhoneCountdown > 0}
                  onClick={onSendPhoneCode}
                >
                  {deactivatePhoneCountdown > 0
                    ? `${deactivatePhoneCountdown}s`
                    : t('获取验证码')}
                </Button>
                <div className={styles.inputGlow} />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'email' && (
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>
                <Mail size={14} />
                {t('邮箱验证码')}
              </label>
              <div
                className={`${styles.inputWrapper} ${styles.inputWrapperHasButton}`}
              >
                <Input
                  type="text"
                  value={deactivateForm.emailCode}
                  onChange={(e) => onEmailCodeChange(e.target.value)}
                  placeholder={t('请输入邮箱验证码')}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deactivateEmailCountdown > 0}
                  onClick={onSendEmailCode}
                >
                  {deactivateEmailCountdown > 0
                    ? `${deactivateEmailCountdown}s`
                    : t('获取验证码')}
                </Button>
                <div className={styles.inputGlow} />
              </div>
            </div>
          )}

          {deactivateForm.verificationMethod === 'wechat' && (
            <>
              {deactivateForm.wechatCode ? (
                <div
                  className={`${styles.wechatWarning} ${styles.wechatWarningSuccess}`}
                >
                  <CheckCircle size={32} strokeWidth={2} />
                  <p>{t('微信授权完成，确认注销时自动验证')}</p>
                </div>
              ) : (
                <WechatDeactivateConfirm onConfirm={onWechatConfirm} />
              )}
            </>
          )}

          <div className={styles.confirmCheckbox}>
            <Checkbox
              id="confirmDeactivate"
              checked={deactivateForm.confirmed}
              onChange={(e) => onConfirmedChange(e.target.checked)}
              label={t('我已了解注销的后果，并确认注销')}
            />
          </div>

          <Button
            variant="danger"
            loading={deactivateLoading}
            disabled={!canSubmit()}
            onClick={handleDeactivate}
            icon={AlertTriangle}
          >
            <span>{deactivateLoading ? t('注销中...') : t('确认注销')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
