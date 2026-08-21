import React, { useCallback, useEffect, useState } from 'react';
import { queueControllerGetQueueStats } from '@/api-sdk';
import { t } from '@/languages';
import { ListChecks } from 'lucide-react';
import { Tag } from '@/components/ui';
import styles from './SystemMonitorPage.module.css';

const POLL_INTERVAL_MS = 30_000;

interface QueueStats {
  queueLength: number;
  runningCount: number;
  maxConcurrent: number;
  timeout: number;
}

export const QueueStatsCard: React.FC = () => {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQueueStats = useCallback(async () => {
    try {
      const { data } = await queueControllerGetQueueStats();
      if (data) {
        setStats({
          queueLength: data.queueLength ?? 0,
          runningCount: data.runningCount ?? 0,
          maxConcurrent: data.maxConcurrent ?? 0,
          timeout: data.timeout ?? 0,
        });
        setError(null);
      }
    } catch {
      setError(t('获取队列统计失败'));
    }
  }, []);

  useEffect(() => {
    fetchQueueStats();
    const interval = setInterval(fetchQueueStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchQueueStats]);

  const maxConcurrent = stats?.maxConcurrent ?? 0;
  const queueLength = stats?.queueLength ?? 0;
  const nearLimit = maxConcurrent > 0 && queueLength >= maxConcurrent;
  const timeoutMinutes = stats ? Math.round(stats.timeout / 60000) : 0;

  return (
    <div
      className={styles.queueCard}
      data-status={nearLimit ? 'warning' : 'normal'}
    >
      <div className={styles.serviceHeader}>
        <div
          className={`${styles.serviceIcon} ${
            nearLimit ? styles.serviceIconWarning : styles.serviceIconHealthy
          }`}
        >
          <ListChecks size={22} />
        </div>
        <div className={styles.serviceTitleArea}>
          <h3>{t('转换队列')}</h3>
          <p>{t('转换任务队列实时状态')}</p>
        </div>
        <Tag variant={nearLimit ? 'warning' : 'success'} size="sm">
          {nearLimit ? t('队列积压') : t('正常')}
        </Tag>
      </div>

      {error ? (
        <div className={styles.queueError}>{error}</div>
      ) : (
        <div className={styles.queueStatsGrid}>
          <div className={styles.queueStatItem}>
            <span className={styles.queueStatValue}>{queueLength}</span>
            <span className={styles.queueStatLabel}>{t('队列深度')}</span>
          </div>
          <div className={styles.queueStatItem}>
            <span className={styles.queueStatValue}>
              {stats ? stats.runningCount : '-'}
            </span>
            <span className={styles.queueStatLabel}>{t('运行中')}</span>
          </div>
          <div className={styles.queueStatItem}>
            <span className={styles.queueStatValue}>
              {stats ? stats.maxConcurrent : '-'}
            </span>
            <span className={styles.queueStatLabel}>{t('并发上限')}</span>
          </div>
          <div className={styles.queueStatItem}>
            <span className={styles.queueStatValue}>
              {t('{timeout} 分钟', { timeout: String(timeoutMinutes) })}
            </span>
            <span className={styles.queueStatLabel}>{t('超时阈值')}</span>
          </div>
        </div>
      )}

      <div className={styles.cardBgPattern} />
    </div>
  );
};
