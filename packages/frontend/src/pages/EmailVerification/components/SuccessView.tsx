import React from 'react';
import { CheckCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { t } from '@/languages';
import styles from '../EmailVerification.module.css';

interface SuccessViewProps {
  isDark: boolean;
}

export const SuccessView: React.FC<SuccessViewProps> = ({ isDark }) => {
  return (
    <div className={styles.authPage} data-theme={isDark ? 'dark' : 'light'}>
      <div
        className={styles.themeToggleWrapper}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <div className={styles.successContent}>
            <div className={styles.successIcon}>
              <CheckCircle size={32} />
            </div>
            <h2 className={styles.successTitle}>{t('邮箱验证成功！')}</h2>
            <p className={styles.successSubtitle}>
              {t('账号已激活，即将自动跳转到登录页...')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
