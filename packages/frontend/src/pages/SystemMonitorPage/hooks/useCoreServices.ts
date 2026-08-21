import { useCallback, useEffect, useState } from 'react';
import { healthControllerCheck } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import type { SystemHealth } from '../types';

function safeMessage(msg: unknown, fallback: string): string {
  if (typeof msg === 'string') return msg;
  if (msg && typeof msg === 'object') return JSON.stringify(msg);
  return fallback;
}

const REFRESH_INTERVAL_SECONDS = 30;

/**
 * 核心服务健康数据（#217 重构：从 SystemMonitorPage/index.tsx 迁出）
 * 30s 轮询 + 手动刷新，与原有 refreshCountdown 模式一致
 */
export function useCoreServices() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(
    REFRESH_INTERVAL_SECONDS
  );

  const fetchSystemHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const healthRes = await healthControllerCheck();
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
      if (healthRes.error) throw healthRes.error;
      const healthData = healthRes.data;
      if (healthData && healthData.info) {
        const databaseInfo = healthData.info.database;
        const storageInfo = healthData.info.storage;
        setSystemHealth({
          database: {
            status: databaseInfo?.status === 'up' ? 'up' : 'down',
            message: safeMessage(
              databaseInfo?.message,
              databaseInfo?.status === 'up'
                ? t('数据库连接正常')
                : t('数据库连接异常')
            ),
          },
          storage: {
            status: storageInfo?.status === 'up' ? 'up' : 'down',
            message: safeMessage(
              storageInfo?.message,
              storageInfo?.status === 'up'
                ? t('存储服务正常')
                : t('存储服务异常')
            ),
          },
        });
        setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
      } else {
        throw new Error(t('无效的响应数据格式'));
      }
    } catch (error) {
      // 透传后端具体原因（哪个依赖挂了），不再只显示固定文案
      setError(getErrorMessage(error) || t('获取系统健康状态失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemHealth();

    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchSystemHealth();
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchSystemHealth]);

  const overallStatus =
    systemHealth &&
    systemHealth.database.status === 'up' &&
    systemHealth.storage.status === 'up'
      ? 'healthy'
      : systemHealth
        ? 'degraded'
        : 'unknown';

  return {
    systemHealth,
    loading,
    error,
    refreshCountdown,
    overallStatus,
    refresh: fetchSystemHealth,
  };
}
