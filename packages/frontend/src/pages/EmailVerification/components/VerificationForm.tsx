import { getCopyrightLine } from '@/constants/appConfig';
import React from 'react';
import { Mail } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { t } from '@/languages';
import styles from '../EmailVerification.module.css';
import type { PhoneRegisterData } from '../hooks/useEmailVerificationForm';

interface VerificationFormProps {
  appName: string;
  appLogo: string;
  isDark: boolean;
  bindMode: boolean;
  phoneRegisterData: PhoneRegisterData | null;
  emailSent: boolean;
  email: string;
  error: string | null;
  resendSuccess: boolean;
  verificationCode: string;
  loading: boolean;
  resendCooldown: number;
  resendLoading: boolean;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
}

export const VerificationForm: React.FC<VerificationFormProps> = ({
  appName,
  appLogo,
  isDark,
  bindMode,
  phoneRegisterData,
  emailSent,
  email,
  error,
  resendSuccess,
  verificationCode,
  loading,
  resendCooldown,
  resendLoading,
  onEmailChange,
  onCodeChange,
  onVerify,
  onResend,
  onBack,
}) => {
  return (
    <div className={styles.authPage} data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />

      <div
        className={styles.themeToggleWrapper}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <div className={styles.logoSection}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoGlow} />
              <img src={appLogo} alt={appName} className={styles.logoImage} />
            </div>
            <h1 className={styles.appTitle}>{appName}</h1>
            <p className={styles.appTagline}>
              {bindMode
                ? t('绑定您的邮箱地址')
                : phoneRegisterData
                  ? t('验证邮箱完成注册')
                  : t('验证您的邮箱地址')}
            </p>
          </div>

          <div className={styles.emailNotice}>
            <div className={styles.emailIcon}>
              <Mail size={24} />
            </div>
            {bindMode && !emailSent ? (
              <p className={styles.emailText}>
                {t('您的账号需要绑定邮箱才能继续使用')}
              </p>
            ) : phoneRegisterData && !email ? (
              <p className={styles.emailText}>
                {t('请输入您的邮箱地址用于完成注册')}
              </p>
            ) : email ? (
              <p className={styles.emailText}>
                {t('我们已向')}{' '}
                <span className={styles.emailHighlight}>{email}</span>{' '}
                {t('发送了验证码')}
              </p>
            ) : (
              <p className={styles.emailText}>
                {t('请输入您收到的6位数字验证码')}
              </p>
            )}
          </div>

          {(bindMode || phoneRegisterData) && !emailSent && (
            <div
              className={styles.codeSection}
              style={{ marginBottom: '1.25rem' }}
            >
              <label htmlFor="email" className={styles.codeLabel}>
                {t('邮箱地址')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder={t('请输入邮箱地址')}
                className={styles.codeInput}
                style={{
                  fontSize: '1rem',
                  fontWeight: 400,
                  letterSpacing: 'normal',
                  textAlign: 'left',
                }}
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <AlertCircle size={18} className={styles.alertIcon} />
              <span>{error}</span>
            </div>
          )}

          {resendSuccess && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              <CheckCircle size={18} className={styles.alertIcon} />
              <span>{t('验证邮件已重新发送，请查收')}</span>
            </div>
          )}

          {email && (
            <div className={styles.codeSection}>
              <label htmlFor="code" className={styles.codeLabel}>
                {t('验证码')}
              </label>
              <input
                id="code"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => onCodeChange(e.target.value)}
                placeholder={t('请输入6位数字验证码')}
                className={styles.codeInput}
                disabled={loading}
              />
              <p className={styles.codeHint}>
                {t('验证码为6位数字，请查看邮件')}
              </p>
            </div>
          )}

          <Button
            onClick={onVerify}
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!email || verificationCode.length !== 6}
            className="w-full mb-5"
          >
            {loading ? (
              <span>{t('验证中...')}</span>
            ) : (
              <>
                <span>{t('验证')}</span>
                <CheckCircle size={18} />
              </>
            )}
          </Button>

          <div className={styles.helpSection}>
            <h4 className={styles.helpTitle}>{t('没有收到邮件？')}</h4>
            <ul className={styles.helpList}>
              <li>{t('• 检查垃圾邮件文件夹')}</li>
              <li>{t('• 确认邮箱地址正确')}</li>
              <li>{t('• 验证码15分钟内有效')}</li>
            </ul>
          </div>

          <div className={styles.actionButtons}>
            <Button
              onClick={onResend}
              variant="secondary"
              size="lg"
              loading={resendLoading}
              disabled={resendCooldown > 0 || !email}
              className="w-full"
            >
              {resendCooldown > 0 ? (
                <>
                  <RefreshCw size={16} />
                  <span>
                    {t('{resendCooldown}秒后可重新发送', {
                      resendCooldown: String(resendCooldown),
                    })}
                  </span>
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>
                    {!emailSent && (bindMode || phoneRegisterData)
                      ? t('发送验证邮件')
                      : t('重新发送验证邮件')}
                  </span>
                </>
              )}
            </Button>

            <Button variant="secondary" size="lg" onClick={onBack}>
              <ArrowLeft size={16} />
              <span>{t('返回登录')}</span>
            </Button>
          </div>

          <div className={styles.featuresBar}>
            <div
              className={styles.featureDot}
              data-tooltip={t('高性能 CAD 在线预览')}
            >
              <Cpu size={14} />
            </div>
            <div
              className={styles.featureDot}
              data-tooltip={t('多用户实时协同编辑')}
            >
              <Boxes size={14} />
            </div>
            <div
              className={styles.featureDot}
              data-tooltip={t('企业级数据安全保障')}
            >
              <ShieldCheck size={14} />
            </div>
          </div>
        </div>

        <p className={styles.copyright}>{getCopyrightLine(appName)}</p>
      </div>
    </div>
  );
};
