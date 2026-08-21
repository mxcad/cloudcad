///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { Settings, Shield } from 'lucide-react';
import type { ConfigStats } from './hooks/useRuntimeConfig';
import styles from './RuntimeConfigPage.module.css';
import { t } from '@/languages';

interface PageHeaderProps {
  configStats: ConfigStats;
  canManageConfig: boolean;
  isDark: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  configStats,
  canManageConfig,
  isDark,
}) => {
  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.titleIcon}>
            <Settings size={28} />
          </div>
          <div className={styles.titleContent}>
            <h1 className={styles.pageTitle}>{t('运行时配置')}</h1>
            <p className={styles.pageSubtitle}>
              {t('管理系统运行参数，修改后立即生效')}
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{configStats.total}</span>
              <span className={styles.statLabel}>{t('配置项')}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${styles.public}`}>
                {configStats.public}
              </span>
              <span className={styles.statLabel}>{t('公开')}</span>
            </div>
            {configStats.modified > 0 && (
              <>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <span className={`${styles.statValue} ${styles.modified}`}>
                    {configStats.modified}
                  </span>
                  <span className={styles.statLabel}>{t('待保存')}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {!canManageConfig && (
        <div className={styles.infoBanner}>
          <Shield size={18} />
          <span>{t('您当前处于只读模式，需要系统管理权限才能修改配置')}</span>
        </div>
      )}
    </>
  );
};
