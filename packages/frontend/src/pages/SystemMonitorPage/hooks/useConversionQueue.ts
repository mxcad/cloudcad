import { useCallback, useEffect, useState } from 'react';
import {
  conversionMonitorControllerGetStats,
  conversionMonitorControllerListKnownBad,
  conversionMonitorControllerListTasks,
  conversionMonitorControllerResetKnownBad,
  type MonitorTaskItemDto,
  type KnownBadItemDto,
} from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { useNotification } from '@/contexts/NotificationContext';
import {
  parseConversionMonitorStats,
  type ConversionQueueState,
} from '../types';

const POLL_INTERVAL_MS = 30_000;

/**
 * 转换队列监控数据（#406 / ADR-0058 + #478）
 * Tab active 时 30s 轮询：
 * - /api/v1/conversion-monitor/stats（当前值 + 24h 历史）
 * - /api/v1/conversion-monitor/known-bad（永久失败负缓存，#478 永久失败列表）
 * 与 useCoreServices 的轮询模式一致。
 *
 * 永久失败复位（#477 合并自独立转换任务页）：SYSTEM_ADMIN 可逐条 / 复位全部，
 * 复位后重新拉取列表。
 */
export function useConversionQueue(active: boolean) {
  const { hasPermission } = usePermission();
  const { showToast, showConfirm } = useNotification();
  /** 永久失败复位权限（SYSTEM_ADMIN） */
  const canReset = hasPermission(SystemPermission.SYSTEM_ADMIN);

  const [state, setState] = useState<ConversionQueueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 永久失败负缓存条目（#478）；非 conversion-service 模式恒为空 */
  const [knownBad, setKnownBad] = useState<KnownBadItemDto[]>([]);
  /** 复位进行中标记：'all'（全部）或具体 contentKey */
  const [resetting, setResetting] = useState<string | null>(null);

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

    // 永久失败列表独立拉取：失败不阻塞统计展示（降级为空列表）
    const kb = await conversionMonitorControllerListKnownBad();
    if (!kb.error) {
      setKnownBad(kb.data?.items ?? []);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, fetchStats]);

  /** 复位永久失败（contentKey 缺省=复位全部），成功后重新拉取列表 */
  const resetKnownBad = useCallback(
    async (contentKey?: string) => {
      const target = contentKey ? t('该条目') : t('全部永久失败');
      const confirmed = await showConfirm({
        title: t('复位永久失败'),
        message: t(
          '确定要复位{target}的永久失败标记吗？复位后该文件将重新尝试转换。',
          { target }
        ),
        confirmText: t('确定'),
        type: 'danger',
      });
      if (!confirmed) return;

      const key = contentKey ?? 'all';
      setResetting(key);
      try {
        const res = await conversionMonitorControllerResetKnownBad({
          body: contentKey ? { contentKey } : {},
        });
        if (res.error) {
          showToast(
            res.error instanceof Error ? res.error.message : String(res.error),
            'error'
          );
        } else {
          showToast(t('复位成功'), 'success');
          fetchStats();
        }
      } finally {
        setResetting(null);
      }
    },
    [showConfirm, showToast, fetchStats]
  );

  return {
    state,
    loading,
    error,
    knownBad,
    canReset,
    resetting,
    refresh: fetchStats,
    resetKnownBad,
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
