import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { alertControllerList } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { parseAlertList } from '../types';
import type { AlertListResult } from '../types';

const REFRESH_INTERVAL_SECONDS = 30;
export const ALERT_PAGE_SIZE = 20;
const ALERT_LIST_KEY = 'alertHistoryList' as const;

export interface AlertHistoryState {
  data: AlertListResult | null;
  loading: boolean;
  error: string | null;
  refreshCountdown: number;
  refresh: () => void;
}

/**
 * 告警历史数据（#248）
 * 仅 active（告警历史 Tab 激活）时轮询，30s 一次，复用 refreshCountdown 模式；
 * 数据获取由 react-query 驱动（queryKey 含 page，切页自动重新查询）
 */
export function useAlertHistory(
  active: boolean,
  page: number
): AlertHistoryState {
  const [refreshCountdown, setRefreshCountdown] = useState(
    REFRESH_INTERVAL_SECONDS
  );

  const query = useQuery({
    queryKey: [ALERT_LIST_KEY, page],
    queryFn: async () => {
      const res = await alertControllerList({
        query: { page, limit: ALERT_PAGE_SIZE },
      });
      if (res.error) throw res.error;
      return parseAlertList(res.data);
    },
    placeholderData: (prev) => prev,
    enabled: active,
  });

  const { refetch } = query;

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          refetch();
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active, refetch]);

  const refresh = useCallback(() => {
    setRefreshCountdown(REFRESH_INTERVAL_SECONDS);
    refetch();
  }, [refetch]);

  return {
    data: query.data ?? null,
    loading: query.isFetching,
    error: query.isError
      ? getErrorMessage(query.error) || t('获取告警历史失败')
      : null,
    refreshCountdown,
    refresh,
  };
}
