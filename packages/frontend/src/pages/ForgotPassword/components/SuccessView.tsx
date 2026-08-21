import { ArrowRight } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';
import { Cpu } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { t } from '@/languages';
import styles from '../ForgotPassword.module.css';

interface SuccessViewProps {
  appName: string;
  appLogo: string;
  isDark: boolean;
  successContact: string;
  onGoReset: () => void;
  onBack: () => void;
}

export const SuccessView: React.FC<SuccessViewProps> = ({
  appName,
  appLogo,
  isDark,
  successContact,
  onGoReset,
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
        </div>

        <div className={styles.successContent}>
          <div className={styles.successIcon}>
            <CheckCircle size={32} />
          </div>
          <h2 className={styles.successTitle}>{t('验证码已发送')}</h2>
          <p className={styles.successSubtitle}>
            {t('我们已向')}{' '}
            <span className={styles.successEmail}>{successContact}</span>{' '}
            {t('发送了验证码')}
          </p>

          <div className={styles.successCard}>
            <div className={styles.successTip}>
              <AlertCircle size={16} />
              <span>{t('请使用验证码重置密码')}</span>
            </div>
          </div>

          <div className={styles.buttonGroup}>
            <button onClick={onGoReset} className={styles.primaryButton}>
              <span>{t('前往重置密码')}</span>
              <ArrowRight size={18} />
            </button>

            <button onClick={onBack} className={styles.secondaryButton}>
              <ArrowLeft size={18} />
              <span>{t('返回登录')}</span>
            </button>
          </div>
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
