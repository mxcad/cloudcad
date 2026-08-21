import React from 'react';
import { Database, HardDrive, Zap } from 'lucide-react';
import { t } from '@/languages';
import type { CacheHealthStatus } from '../types';
import styles from '../SystemMonitorPage.module.css';

export interface CacheHealthCardsProps {
  health: CacheHealthStatus | null;
  loading: boolean;
}

const LEVEL_META = {
  L1: { icon: Zap },
  L2: { icon: Database },
} as const;

function statusLabel(status?: 'healthy' | 'degraded' | 'unhealthy'): string {
  if (status === 'healthy') return t('健康');
  if (status === 'unhealthy') return t('不健康');
  return t('降级');
}

/**
 * L1/L2 缓存健康状态卡（#217）
 */
export const CacheHealthCards: React.FC<CacheHealthCardsProps> = ({
  health,
  loading,
}) => {
  const levels = ['L1', 'L2'] as const;

  return (
    <div className={styles.healthGrid}>
      {levels.map((levelKey) => {
        const meta = LEVEL_META[levelKey];
        const Icon = meta.icon;
        const level = health?.[levelKey];
        const status = level?.status ?? 'degraded';
        const isHealthy = status === 'healthy';
        const levelTitle =
          levelKey === 'L1' ? t('L1 内存缓存') : t('L2 Redis 缓存');

        return (
          <div
            key={levelKey}
            className={styles.healthCard}
            data-status={status}
          >
            <div className={styles.serviceHeader}>
              <div
                className={`${styles.serviceIcon} ${
                  isHealthy
                    ? styles.serviceIconHealthy
                    : status === 'unhealthy'
                      ? styles.serviceIconUnhealthy
                      : styles.serviceIconWarning
                }`}
              >
                <Icon size={22} />
              </div>
              <div className={styles.serviceTitleArea}>
                <h3>{levelTitle}</h3>
                <p>{t('缓存健康状态')}</p>
              </div>
              <span
                className={`${styles.healthBadge} ${
                  isHealthy
                    ? styles.healthBadgeHealthy
                    : status === 'unhealthy'
                      ? styles.healthBadgeUnhealthy
                      : styles.healthBadgeWarning
                }`}
              >
                {loading && !level ? t('检测中...') : statusLabel(status)}
              </span>
            </div>

            <div className={styles.serviceDetails}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('可用性')}</span>
                <span className={styles.detailValue}>
                  {t('{value}%', { value: String(level?.availability ?? 0) })}
                </span>
              </div>
              {level?.error ? (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t('错误信息')}</span>
                  <span className={styles.detailValue}>{level.error}</span>
                </div>
              ) : (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>
                    <HardDrive size={14} />
                  </span>
                  <span className={styles.detailValue}>
                    {t('最后检查时间')}:{' '}
                    {level?.lastCheckTime
                      ? new Date(level.lastCheckTime).toLocaleTimeString()
                      : '-'}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.cardBgPattern} />
          </div>
        );
      })}
    </div>
  );
};
