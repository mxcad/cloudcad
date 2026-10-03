///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 页面头部：标题 + 生效语义说明 + 统计条 + 只读提示。
 *
 * 说明面向非技术运维：不出现「取值优先级 / 即时生效」等术语，只讲
 * 「在这里改、保存就生效」；只有真的存在需重启的项（hot === false）才提示。
 */

import React from 'react';
import { Settings, Shield, Info } from 'lucide-react';
import styles from './RuntimeConfigPage.module.css';
import type { RuntimeConfigStats } from './hooks/useRuntimeConfig';
import { t } from '@/languages';

interface PageHeaderProps {
  stats: RuntimeConfigStats;
  canManageConfig: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  stats,
  canManageConfig,
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
              {t(
                '在这里修改并保存即可，不用去改 .env 文件；这里设置的值优先于环境变量和代码默认值。'
              )}
              {stats.restartRequired > 0 &&
                t('其中 {n} 项需重启后端服务后才生效。', {
                  n: String(stats.restartRequired),
                })}
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statsBar} data-testid="rc-stats">
            <div className={styles.statItem}>
              <span className={styles.statValue}>{stats.total}</span>
              <span className={styles.statLabel}>{t('配置项')}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${styles.modified}`}>
                {stats.modified}
              </span>
              <span className={styles.statLabel}>{t('已修改')}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span
                className={`${styles.statValue} ${stats.pendingSave > 0 ? styles.pending : ''}`}
              >
                {stats.pendingSave}
              </span>
              <span className={styles.statLabel}>{t('待保存')}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statValue}>{stats.envDriven}</span>
              <span className={styles.statLabel}>{t('环境变量')}</span>
            </div>
          </div>
        </div>
      </header>

      {!canManageConfig && (
        <div className={styles.infoBanner} data-testid="rc-readonly-banner">
          <Shield size={18} />
          <span>{t('您当前处于只读模式，需要系统管理权限才能修改配置')}</span>
        </div>
      )}

      {stats.envDriven > 0 && canManageConfig && (
        <div className={styles.infoBanner}>
          <Info size={18} />
          <span>
            {t(
              '共 {n} 项配置已由环境变量注入。修改后运行时配置优先级更高；恢复默认会退回环境变量值，而非代码默认值。',
              {
                n: String(stats.envDriven),
              }
            )}
          </span>
        </div>
      )}
    </>
  );
};
