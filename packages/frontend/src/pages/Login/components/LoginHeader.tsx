///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { t } from '@/languages';
import styles from '../Login.module.css';

interface LoginHeaderProps {
  appLogo: string;
  appName: string;
  appTagline?: string;
}

export const LoginHeader: React.FC<LoginHeaderProps> = ({
  appLogo,
  appName,
  appTagline,
}) => {
  return (
    <>
      {/* Logo 区域 */}
      <div className={styles.logoSection}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <img src={appLogo} alt={appName} className={styles.logoImage} />
        </div>
        <h1 className={styles.appTitle}>{appName}</h1>
        {appTagline && <p className={styles.appTagline}>{appTagline}</p>}
      </div>

      {/* 表单头部 */}
      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>{t('欢迎回来')}</h2>
        <p className={styles.formSubtitle}>{t('登录您的账户以继续')}</p>
      </div>
    </>
  );
};
