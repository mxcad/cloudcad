import { getCopyrightLine } from '@/constants/appConfig';
import { Mail } from 'lucide-react';
import { Phone } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '../ForgotPassword.module.css';

interface SupportViewProps {
  appName: string;
  appLogo: string;
  isDark: boolean;
  supportEmail?: string;
  supportPhone?: string;
  onBack: () => void;
}

export const SupportView: React.FC<SupportViewProps> = ({
  appName,
  appLogo,
  isDark,
  supportEmail,
  supportPhone,
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

        <div className={styles.supportContent}>
          <div className={styles.supportIcon}>
            <Phone size={28} />
          </div>
          <h2 className={styles.supportTitle}>{t('找回密码')}</h2>
          <p className={styles.supportSubtitle}>
            {t('该找回方式暂不可用，请联系客服重置密码')}
          </p>

          <div className={styles.supportCard}>
            <h3 className={styles.supportCardTitle}>{t('客服联系方式')}</h3>
            <div className={styles.supportList}>
              {supportEmail && (
                <a
                  href={`mailto:${supportEmail}`}
                  className={styles.supportItem}
                >
                  <Mail size={18} />
                  <span>{supportEmail}</span>
                </a>
              )}
              {supportPhone && (
                <a href={`tel:${supportPhone}`} className={styles.supportItem}>
                  <Phone size={18} />
                  <span>{supportPhone}</span>
                </a>
              )}
              {!supportEmail && !supportPhone && (
                <p className={styles.supportEmpty}>
                  {t('暂无客服联系方式，请联系系统管理员')}
                </p>
              )}
            </div>
          </div>

          <Button
            variant="secondary"
            size="lg"
            icon={ArrowLeft}
            onClick={onBack}
          >
            {t('返回登录')}
          </Button>
        </div>
      </div>
      <p className={styles.copyright}>{getCopyrightLine(appName)}</p>
    </div>
  </div>
);
