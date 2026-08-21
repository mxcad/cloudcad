import React from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { t } from '@/languages';
import styles from './register.module.css';

interface RegisterLayoutProps {
  appName: string;
  isDark: boolean;
  withBackground?: boolean;
  withLanguageSwitcher?: boolean;
  children: React.ReactNode;
}

export const RegisterLayout: React.FC<RegisterLayoutProps> = ({
  appName,
  isDark,
  withBackground = true,
  withLanguageSwitcher = false,
  children,
}) => {
  return (
    <div
      className={`relative z-[1] ${styles.registerPage}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      {withBackground && <InteractiveBackground />}

      <div className={styles.themeToggleWrapper}>
        {withLanguageSwitcher && <LanguageSwitcher />}
        <ThemeToggle />
      </div>

      <div className={styles.registerContainer}>
        {children}
        <p className={styles.copyright}>
          © 2026 {appName}. All rights reserved. ·{' '}
          <Link to="/privacy" className={styles.legalLink}>
            {t('隐私政策')}
          </Link>{' '}
          ·{' '}
          <Link to="/terms" className={styles.legalLink}>
            {t('用户协议')}
          </Link>
        </p>
      </div>
    </div>
  );
};
