import { useCallback, useEffect, useState } from 'react';
import {
  cacheMonitorControllerGetPerformanceTrend,
  cacheMonitorControllerGetSizeTrend,
  cacheMonitorControllerGetSummary,
  cacheMonitorControllerGetWarnings,
} from '@/api-sdk';
import type {
  CacheWarningsDto,
  PerformanceTrendDto,
  SizeTrendDto,
} from '@/api-sdk';
import { t } from '@/languages';
import { parseCacheSummary } from '../types';
import type { CacheLevelKey, CacheMonitorSummary } from '../types';

const REFRESH_INTERVAL_SECONDS = 30;

export interface CacheMonitorState {
  summary: CacheMonitorSummary | null;
  warnings: CacheWarningsDto | null;
  sizeTrend: SizeTrendDto | null;
  perfTrend: PerformanceTrendDto | null;
  perfLevel: CacheLevelKey;
  perfError: boolean;
  setPerfLevel: (level: CacheLevelKey) => void;
  loading: boolean;
  error: string | null;
  refreshCountdown: number;
  refresh: () => Promise<void>;
}

/**
 * 缓存监控数据（#217）
 * 仅 active（缓存监控 Tab 激活）时轮询，30s 一次，复用 refreshCountdown 模式。
 * 性能趋势（GetPerformanceTrend）同样纳入轮询链路与手动刷新。
 */
export function useCacheMonitor(active: boolean): CacheMonitorState {
  const [summary, setSummary] = useState<CacheMonitorSummary | null>(null);
  const [warnings, setWarnings] = useState<CacheWarningsDto | null>(null);
  const [sizeTrend, setSizeTrend] = useState<SizeTrendDto | null>(null);
  const [perfTrend, setPerfTrend] = useState<PerformanceTrendDto | null>(null);
  const [perfLevel, setPerfLevel] = useState<CacheLevelKey>('L1');
  const [perfError, setPerfError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(
    REFRESH_INTERVAL_SECONDS
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, warningsRes, sizeRes] = await Promise.all([
        cacheMonitorControllerGetSummary(),
        cacheMonitorControllerGetWarnings(),
        cacheMonitorControllerGetSizeTrend({ query: { minutes: '60' } }),
      ]);
      if (summaryRes.data) setSummary(parseCacheSummary(summaryRes.data));
      if (warningsRes.data) setWarnings(warningsRes.data);
      if (sizeRes.data) setSizeTrend(sizeRes.data);
      setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    } catch {
      setError(t('获取缓存监控数据失败'));
    } finally {
      setLoading(false);
    }
    try {
      const { data } = await cacheMonitorControllerGetPerformanceTrend({
        query: { level: perfLevel, minutes: 60 },
      });
      setPerfTrend(data ?? null);
      setPerfError(false);
    } catch {
      setPerfError(true);
    }
  }, [perfLevel]);

  useEffect(() => {
    if (!active) return;

    fetchAll();

    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchAll();
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active, fetchAll]);

  return {
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
    refresh: fetchAll,
  };
}
