import { useQuery } from '@tanstack/react-query';
import {
  adminControllerGetOverview,
  adminControllerGetPurchaseStats,
  adminControllerGetRegistrationStats,
} from '@/api-sdk';
import type {
  DailyPurchasesStatsDto,
  DailyRegistrationsStatsDto,
  StatsOverviewDto,
} from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';

/** 统计时间范围（缺省由后端按东八区取最近 30 天） */
export interface AdminStatsRangeParams {
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

const OVERVIEW_ERROR = t('加载总量概览失败');
const REGISTRATIONS_ERROR = t('加载新增用户统计失败');
const PURCHASES_ERROR = t('加载会员购买统计失败');

/**
 * 运营总量概览（当前用户总数 / 累计付费用户，与统计区间无关）
 * @param enabled 无权限时为 false，不发请求
 */
export function useAdminStatsOverview(enabled: boolean) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminStats.overview,
    queryFn: async (): Promise<StatsOverviewDto> => {
      const result = await adminControllerGetOverview();
      if (result.error) throw result.error;
      return result.data as StatsOverviewDto;
    },
    enabled,
  });

  return {
    stats: data,
    loading: isLoading,
    error: error ? getErrorMessage(error) || OVERVIEW_ERROR : null,
  };
}

/**
 * 每日新增用户统计（SYSTEM_USER_READ）
 * @param enabled 无权限时为 false，不发请求
 */
export function useDailyRegistrations(
  params: AdminStatsRangeParams,
  enabled: boolean
) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminStats.registrations(params),
    queryFn: async (): Promise<DailyRegistrationsStatsDto> => {
      const result = await adminControllerGetRegistrationStats({
        query: params,
      });
      if (result.error) throw result.error;
      return result.data as DailyRegistrationsStatsDto;
    },
    enabled,
  });

  return {
    stats: data,
    loading: isLoading,
    error: error ? getErrorMessage(error) || REGISTRATIONS_ERROR : null,
  };
}

/**
 * 每日会员购买统计（SYSTEM_BILLING_READ）
 * @param enabled 无权限时为 false，不发请求
 */
export function useDailyPurchases(
  params: AdminStatsRangeParams,
  enabled: boolean
) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminStats.purchases(params),
    queryFn: async (): Promise<DailyPurchasesStatsDto> => {
      const result = await adminControllerGetPurchaseStats({ query: params });
      if (result.error) throw result.error;
      return result.data as DailyPurchasesStatsDto;
    },
    enabled,
  });

  return {
    stats: data,
    loading: isLoading,
    error: error ? getErrorMessage(error) || PURCHASES_ERROR : null,
  };
}
