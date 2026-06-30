import { useQuery } from '@tanstack/react-query';
import { usersControllerGetDashboardStats } from '@/api-sdk';
import type { UserDashboardStatsDto } from '@/api-sdk';
import { t } from '@/languages';

const DASHBOARD_STATS_KEY = ['dashboard', 'stats'] as const;

export function useDashboardStats() {
  const query = useQuery({
    queryKey: DASHBOARD_STATS_KEY,
    queryFn: async () => {
      const result = await usersControllerGetDashboardStats();
      if (result.error) throw result.error;
      return result.data;
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? t('加载统计数据失败') : null,
  };
}
