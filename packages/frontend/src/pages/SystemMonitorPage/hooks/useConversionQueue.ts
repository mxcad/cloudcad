import { useCallback, useEffect, useState } from 'react';
import {
  conversionMonitorControllerGetStats,
  conversionMonitorControllerListTasks,
  type MonitorTaskItemDto,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  parseConversionMonitorStats,
  type ConversionQueueState,
} from '../types';

const POLL_INTERVAL_MS = 30_000;

/**
 * 转换队列监控数据（#406 / ADR-0058 + #478）
 * Tab active 时 30s 轮询 /api/v1/conversion-monitor/stats（当前值 + 24h 历史），
 * 与 useCoreServices 的轮询模式一致。
 */
export function useConversionQueue(active: boolean) {
  const [state, setState] = useState<ConversionQueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await conversionMonitorControllerGetStats();
      // SDK 默认不抛错：失败时错误在 res.error，显式抛出让 catch 记录真实原因
      if (res.error) throw res.error;
      setState(parseConversionMonitorStats(res.data));
    } catch (err) {
      setError(getErrorMessage(err) || t('获取转换队列统计失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, fetchStats]);

  return {
    state,
    loading,
    error,
    refresh: fetchStats,
  };
}

/**
 * 转换任务明细（#478 监控 Tab 逐任务明细）：Tab active 时 30s 轮询
 * /api/v1/conversion-monitor/tasks（conversion-service 模式 proxy 远端
 * GET /v1/conversions/tasks；process-pool 模式返回空列表）。
 * 与 useConversionQueue 的轮询模式一致。
 */
export function useConversionTasks(active: boolean) {
  const [tasks, setTasks] = useState<MonitorTaskItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await conversionMonitorControllerListTasks();
      if (res.error) throw res.error;
      setTasks(res.data?.items ?? []);
    } catch (err) {
      setError(getErrorMessage(err) || t('获取转换任务明细失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchTasks();
    const interval = setInterval(fetchTasks, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, fetchTasks]);

  return { tasks, loading, error, refresh: fetchTasks };
}
