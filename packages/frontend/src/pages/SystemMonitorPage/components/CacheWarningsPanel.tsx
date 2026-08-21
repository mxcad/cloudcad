import React from 'react';
import { AlertTriangle, BellRing } from 'lucide-react';
import { t } from '@/languages';
import type { CacheWarningsDto } from '@/api-sdk';
import styles from '../SystemMonitorPage.module.css';

export interface CacheWarningsPanelProps {
  warnings: CacheWarningsDto | null;
  loading: boolean;
}

/**
 * 缓存警告面板（#217）
 */
export const CacheWarningsPanel: React.FC<CacheWarningsPanelProps> = ({
  warnings,
  loading,
}) => {
  const list = Array.isArray(warnings?.warnings) ? warnings.warnings : [];
  const hasWarnings = list.length > 0;

  return (
    <div
      className={styles.warningsCard}
      data-status={hasWarnings ? 'warning' : 'normal'}
    >
      <div className={styles.serviceHeader}>
        <div
          className={`${styles.serviceIcon} ${
            hasWarnings ? styles.serviceIconWarning : styles.serviceIconHealthy
          }`}
        >
          <BellRing size={22} />
        </div>
        <div className={styles.serviceTitleArea}>
          <h3>{t('缓存警告')}</h3>
          <p>{t('缓存容量、命中率、连接与内存阈值检查')}</p>
        </div>
        {loading && !warnings ? (
          <span className={styles.healthBadge}>{t('检测中...')}</span>
        ) : (
          <span
            className={`${styles.healthBadge} ${
              hasWarnings
                ? styles.healthBadgeWarning
                : styles.healthBadgeHealthy
            }`}
          >
            {hasWarnings
              ? t('{count} 条警告', { count: String(list.length) })
              : t('无警告')}
          </span>
        )}
      </div>

      {hasWarnings ? (
        <ul className={styles.warningsList}>
          {list.map((item, index) => (
            <li key={`${item}-${index}`} className={styles.warningItem}>
              <AlertTriangle size={16} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        !loading && (
          <div className={styles.warningsEmpty}>{t('当前无缓存警告')}</div>
        )
      )}

      <div className={styles.cardBgPattern} />
    </div>
  );
};
