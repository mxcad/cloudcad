import React from 'react';
import { t } from '@/languages';
import styles from '../AuditLogPage.module.css';

interface AuditStatsGridProps {
  statistics: {
    total: number;
    successCount: number;
    failureCount: number;
    successRate: number;
  };
}

export const AuditStatsGrid: React.FC<AuditStatsGridProps> = ({
  statistics,
}) => {
  return (
    <div className={styles.statGrid}>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('总记录数')}</div>
        <div className={styles.statValue}>{statistics.total}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('成功次数')}</div>
        <div className={`${styles.statValue} ${styles.statValueSuccess}`}>
          {statistics.successCount}
        </div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('失败次数')}</div>
        <div className={`${styles.statValue} ${styles.statValueError}`}>
          {statistics.failureCount}
        </div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('成功率')}</div>
        <div className={`${styles.statValue} ${styles.statValueInfo}`}>
          {(statistics.successRate ?? 0).toFixed(1)}%
        </div>
      </div>
    </div>
  );
};
