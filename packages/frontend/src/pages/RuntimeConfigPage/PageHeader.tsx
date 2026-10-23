///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 页面头部：标题 + 生效语义说明 + 安全模式横幅 + 统计条 + 只读提示。
 *
 * 说明面向非技术运维：不出现「取值优先级 / 即时生效」等术语，只讲
 * 「在这里改、保存就生效」。
 *
 * 模式横幅报出的受管项数大多落在 advanced 档、默认隐藏，
 * 管理员若只看列表会误判「模式没管住任何东西」。
 */

import React from 'react';
import {
  Settings,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import styles from './RuntimeConfigPage.module.css';
import type { RuntimeConfigStats } from './hooks/useRuntimeConfig';
import { t } from '@/languages';

interface PageHeaderProps {
  stats: RuntimeConfigStats;
  canManageConfig: boolean;
  /** 当前安全模式（来自公开配置） */
  currentMode: 'secure' | 'normal';
  onModeSwitch: (target: 'secure' | 'normal') => void;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  stats,
  canManageConfig,
  currentMode,
  onModeSwitch,
}) => {
  const isSecure = currentMode === 'secure';
  const modeLabel = isSecure ? t('安全模式') : t('普通模式');

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
              {t('在这里修改并保存即可；这里保存的值优先于系统预置值。')}
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
              <span className={styles.statLabel}>{t('系统预置')}</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem} data-testid="rc-mode-managed">
              <span className={styles.statValue}>{stats.modeManaged}</span>
              <span className={styles.statLabel}>{t('模式受管项')}</span>
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

      {/* 安全模式横幅：当前模式 + 该模式管住多少项 + 切换入口 */}
      <div
        className={`${styles.modeBanner} ${isSecure ? styles.modeBannerSecure : styles.modeBannerNormal}`}
        data-testid="rc-mode-banner"
        data-mode={currentMode}
      >
        <span className={styles.modeBannerIcon}>
          {isSecure ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
        </span>
        <div className={styles.modeBannerContent}>
          <div className={styles.modeBannerTitle}>
            <span>{t('当前处于{mode}', { mode: modeLabel })}</span>
            <span
              className={`${styles.modeBadge} ${isSecure ? styles.modeBadgeSecure : styles.modeBadgeNormal}`}
            >
              {modeLabel}
            </span>
          </div>
          <div className={styles.modeBannerDesc}>
            {isSecure
              ? t('等保三级收紧：限流、口令、注册与导出限制按安全基线执行。')
              : t('便利优先：限制宽松，适合本地与测试环境。')}
            {t('当前模式管理 {n} 项配置。', { n: String(stats.modeManaged) })}
          </div>
        </div>
        {canManageConfig && (
          <Button
            variant="secondary"
            size="sm"
            icon={SlidersHorizontal}
            onClick={() => onModeSwitch(isSecure ? 'normal' : 'secure')}
            data-testid="rc-mode-switch"
          >
            {t('切换模式')}
          </Button>
        )}
      </div>

      {stats.envDriven > 0 && canManageConfig && (
        <div className={styles.infoBanner}>
          <Info size={18} />
          <span>
            {t(
              '共 {n} 项配置由系统预置。在这里保存会覆盖预置值；恢复出厂会退回预置值，而不是出厂默认值。',
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
