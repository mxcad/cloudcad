import React from 'react';
import { RefreshCw } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui';
import type { CacheMonitorState } from '../hooks/useCacheMonitor';
import { CacheSummaryCards } from './CacheSummaryCards';
import { CacheHealthCards } from './CacheHealthCards';
import { CacheWarningsPanel } from './CacheWarningsPanel';
import { CacheTrendCharts } from './CacheTrendCharts';
import { CacheKeyOperations } from './CacheKeyOperations';
import styles from '../SystemMonitorPage.module.css';

export interface CacheMonitorTabProps {
  state: CacheMonitorState;
  isAdmin: boolean;
}

/**
 * 系统监控中心「缓存监控」Tab（#217）
 */
export const CacheMonitorTab: React.FC<CacheMonitorTabProps> = ({
  state,
  isAdmin,
}) => {
  const {
    summary,
    warnings,
    sizeTrend,
    perfTrend,
    perfLevel,
    perfError,
    setPerfLevel,
    loading,
    error,
    refreshCountdown,
    refresh,
  } = state;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('缓存摘要')}</h2>
          <div className={styles.sectionHeaderRight}>
            <span className={styles.refreshCountdown}>
              {t('{seconds}s 后自动刷新', {
                seconds: String(refreshCountdown),
              })}
            </span>
            <Button
              variant="primary"
              className={styles.refreshButton}
              onClick={refresh}
              loading={loading}
              icon={RefreshCw}
            >
              {loading ? t('刷新中...') : t('立即刷新')}
            </Button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <CacheSummaryCards summary={summary} loading={loading} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('缓存健康状态')}</h2>
        </div>
        <CacheHealthCards
          health={summary?.healthStatus ?? null}
          loading={loading}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('缓存警告')}</h2>
        </div>
        <CacheWarningsPanel warnings={warnings} loading={loading} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('缓存趋势')}</h2>
        </div>
        <CacheTrendCharts
          sizeTrend={sizeTrend}
          perfTrend={perfTrend}
          perfLevel={perfLevel}
          onPerfLevelChange={setPerfLevel}
          loading={loading}
          perfError={perfError}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t('缓存 Key 操作')}</h2>
        </div>
        <CacheKeyOperations isAdmin={isAdmin} onChanged={refresh} />
      </section>
    </>
  );
};
