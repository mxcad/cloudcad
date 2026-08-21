import React from 'react';
import { t } from '@/languages';
import styles from './register.module.css';

interface RegisterBrandProps {
  appName: string;
  appLogo: string;
}

export const RegisterBrand: React.FC<RegisterBrandProps> = ({
  appName,
  appLogo,
}) => {
  return (
    <div className={styles.logoSection}>
      <div className={styles.logoWrapper}>
        <div className={styles.logoGlow} />
        <img src={appLogo} alt={appName} className={styles.logoImage} />
      </div>
      <h1 className={styles.appTitle}>{appName}</h1>
      <p className={styles.appTagline}>{t('创建账户，开启云端 CAD 之旅')}</p>
    </div>
  );
};
