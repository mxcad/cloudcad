import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { t } from '@/languages';
import type { CacheMonitorSummary } from '../types';
import styles from '../SystemMonitorPage.module.css';

export interface CacheSummaryCardsProps {
  summary: CacheMonitorSummary | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

/**
 * 缓存摘要卡（#217）：命中率 / 总请求数 / 内存使用
 */
export const CacheSummaryCards: React.FC<CacheSummaryCardsProps> = ({
  summary,
  loading,
}) => {
  const sum = summary?.stats?.summary;
  const hitRate = sum?.overallHitRate ?? 0;
  const totalRequests = sum?.totalRequests ?? 0;
  const totalMemory = sum?.totalMemoryUsage ?? 0;
  const healthy = summary?.healthStatus?.overall === 'healthy';

  const items = [
    {
      label: t('缓存命中率'),
      value: t('{value}%', { value: hitRate.toFixed(2) }),
      sub: t('overallHitRate 反映 L1/L2 整体命中'),
      status: hitRate >= 70 ? 'ok' : 'warn',
    },
    {
      label: t('总请求数'),
      value: String(totalRequests),
      sub: t('累计缓存访问请求'),
      status: 'ok' as const,
    },
    {
      label: t('内存使用'),
      value: formatBytes(totalMemory),
      sub: t('L1 + L2 合计'),
      status: 'ok' as const,
    },
  ];

  return (
    <div className={styles.summaryGrid}>
      {items.map((item) => (
        <div
          key={item.label}
          className={styles.summaryCard}
          data-status={item.status}
        >
          <div className={styles.summaryHeader}>
            <span className={styles.summaryLabel}>{item.label}</span>
            {item.status === 'ok' ? (
              <CheckCircle2 size={16} className={styles.summaryOkIcon} />
            ) : (
              <AlertTriangle size={16} className={styles.summaryWarnIcon} />
            )}
          </div>
          <div className={styles.summaryValue}>
            {loading && !summary ? t('检测中...') : item.value}
          </div>
          <div className={styles.summarySub}>
            {loading && !summary ? t('正在获取数据') : item.sub}
          </div>
          <div className={styles.cardBgPattern} />
        </div>
      ))}

      <div
        className={`${styles.summaryCard} ${styles.summaryOverall}`}
        data-status={healthy ? 'ok' : 'warn'}
      >
        <div className={styles.summaryHeader}>
          <span className={styles.summaryLabel}>{t('整体健康状态')}</span>
          {healthy ? (
            <CheckCircle2 size={16} className={styles.summaryOkIcon} />
          ) : (
            <AlertTriangle size={16} className={styles.summaryWarnIcon} />
          )}
        </div>
        <div className={styles.summaryValue}>
          {loading && !summary
            ? t('检测中...')
            : healthy
              ? t('正常')
              : t('异常')}
        </div>
        <div className={styles.summarySub}>{t('基于 L1/L2 健康状态汇总')}</div>
        <div className={styles.cardBgPattern} />
      </div>
    </div>
  );
};
