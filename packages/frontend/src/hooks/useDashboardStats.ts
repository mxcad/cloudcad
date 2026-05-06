import { useQuery } from '@tanstack/react-query';
import { usersControllerGetDashboardStats } from '@/api-sdk';
import type { UserDashboardStatsDto } from '@/api-sdk';

const DASHBOARD_STATS_KEY = ['dashboard', 'stats'] as const;

export function useDashboardStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: DASHBOARD_STATS_KEY,
    queryFn: async () => {
      const result = await usersControllerGetDashboardStats();
      if (result.error) throw result.error;
      return result.data as UserDashboardStatsDto;
    },
  });

  return {
    data,
    isLoading,
    error: error ? '加载统计数据失败' : null,
    loading: isLoading,
  };
}