import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import { Mail } from 'lucide-react';
import { Phone } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { Button } from '@/components/ui/Button';
import { Tabs, Tab } from '@/components/ui';
import { t, $t } from '@/languages';
import type { ForgotPasswordValues } from '../forgotPasswordSchema';
import styles from '../ForgotPassword.module.css';

interface ForgotFormViewProps {
  appName: string;
  appLogo: string;
  isDark: boolean;
  mailAvailable: boolean;
  phoneAvailable: boolean;
  contactType: 'email' | 'phone';
  error: string | null;
  loading: boolean;
  register: UseFormRegister<ForgotPasswordValues>;
  handleSubmit: UseFormHandleSubmit<ForgotPasswordValues>;
  onSubmit: (data: ForgotPasswordValues) => void;
  onSwitchContactType: (type: 'email' | 'phone') => void;
  onOpenSupportModal: () => void;
  onBack: () => void;
}

export const ForgotFormView: React.FC<ForgotFormViewProps> = ({
  appName,
  appLogo,
  isDark,
  mailAvailable,
  phoneAvailable,
  contactType,
  error,
  loading,
  register,
  handleSubmit,
  onSubmit,
  onSwitchContactType,
  onOpenSupportModal,
  onBack,
}) => (
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
          <p className={styles.appTagline}>{t('找回您的账户密码')}</p>
        </div>

        <div className={styles.formHeader}>
          <h2 className={styles.formTitle}>{t('忘记密码')}</h2>
          <p className={styles.formSubtitle}>
            {mailAvailable && phoneAvailable
              ? $t('使用{method}接收验证码', {
                  method: contactType === 'email' ? t('邮箱') : t('手机号'),
                })
              : mailAvailable
                ? t('使用邮箱接收验证码')
                : t('使用手机号接收验证码')}
          </p>
        </div>

        {mailAvailable && phoneAvailable && (
          <Tabs>
            <Tab
              active={contactType === 'email'}
              icon={Mail}
              onClick={() => onSwitchContactType('email')}
            >
              {t('邮箱')}
            </Tab>
            <Tab
              active={contactType === 'phone'}
              icon={Phone}
              onClick={() => onSwitchContactType('phone')}
            >
              {t('手机号')}
            </Tab>
          </Tabs>
        )}

        <div className={styles.forgotContactLinks}>
          {contactType === 'email' && (
            <button
              type="button"
              className={styles.forgotLink}
              onClick={onOpenSupportModal}
            >
              {t('忘记邮箱?')}
            </button>
          )}
          {contactType === 'phone' && (
            <button
              type="button"
              className={styles.forgotLink}
              onClick={onOpenSupportModal}
            >
              {t('忘记手机号？')}
            </button>
          )}
        </div>

        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <AlertCircle size={18} className={styles.alertIcon} />
            <span>{error}</span>
          </div>
        )}

        <form className={styles.authForm} onSubmit={handleSubmit(onSubmit)}>
          {contactType === 'email' ? (
            <div className={styles.inputGroup}>
              <label htmlFor="email" className={styles.inputLabel}>
                {t('邮箱地址')}
              </label>
              <div className={styles.inputWrapper}>
                <Mail size={18} className={styles.inputIcon} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={styles.inputField}
                  placeholder={t('请输入邮箱地址')}
                  {...register('email')}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>
          ) : (
            <div className={styles.inputGroup}>
              <label htmlFor="phone" className={styles.inputLabel}>
                {t('手机号码')}
              </label>
              <div className={styles.inputWrapper}>
                <Phone size={18} className={styles.inputIcon} />
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  className={styles.inputField}
                  placeholder={t('请输入手机号')}
                  {...register('phone')}
                />
                <div className={styles.inputGlow} />
              </div>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full"
          >
            {loading ? (
              <span>{t('发送中...')}</span>
            ) : (
              <>
                <span>{t('发送验证码')}</span>
                <ArrowRight size={18} className={styles.buttonArrow} />
              </>
            )}
          </Button>
        </form>

        <div className={styles.formFooter}>
          <Button
            variant="secondary"
            size="lg"
            icon={ArrowLeft}
            onClick={onBack}
          >
            {t('返回登录')}
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

      <p className={styles.copyright}>© 2026 {appName}. All rights reserved.</p>
    </div>
  </div>
);
