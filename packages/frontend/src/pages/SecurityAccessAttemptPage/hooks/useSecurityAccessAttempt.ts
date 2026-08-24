/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  securityAccessAttemptControllerList,
  securityAccessAttemptControllerWhitelist,
  securityAccessAttemptControllerBlacklist,
} from '@/api-sdk';
import type { SecurityAccessAttemptAggregateDto } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { SECURITY_ATTEMPT_PAGE_SIZE } from '../constants';
import type { SecurityAccessAttemptAggregate } from '../types';

/** 将 SDK 返回的聚合项转换为前端类型（account/userAgent 为 string 或 null） */
function toAggregate(raw: SecurityAccessAttemptAggregateDto): SecurityAccessAttemptAggregate {
  return {
    ip: raw.ip,
    firstSeen: raw.firstSeen,
    lastSeen: raw.lastSeen,
    count: raw.count,
    reasons: raw.reasons as Record<string, number>,
    account:
      typeof raw.account === 'string' ? raw.account : raw.account ? String(raw.account) : null,
    userAgent:
      typeof raw.userAgent === 'string'
        ? raw.userAgent
        : raw.userAgent
          ? JSON.stringify(raw.userAgent)
          : null,
    inWhitelist: raw.inWhitelist,
    inBlacklist: raw.inBlacklist,
  };
}

/**
 * 高危接口访问尝试列表查询（按 IP 聚合，分页 + keyword 模糊搜索）
 */
export function useSecurityAccessAttemptList(page: number, keyword?: string) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.securityAttempt.list({
      page,
      pageSize: SECURITY_ATTEMPT_PAGE_SIZE,
      keyword,
    }),
    queryFn: async () => {
      const res = await securityAccessAttemptControllerList({
        query: {
          page,
          pageSize: SECURITY_ATTEMPT_PAGE_SIZE,
          ...(keyword ? { keyword } : {}),
        },
      });
      if (res.error) throw res.error;
      const body = res.data;
      return {
        items: (body?.items ?? []).map(toAggregate),
        total: body?.total ?? 0,
        page: body?.page ?? page,
        pageSize: body?.pageSize ?? SECURITY_ATTEMPT_PAGE_SIZE,
      };
    },
    placeholderData: (prev) => prev,
  });

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    loading: isLoading || isFetching,
    isFetching,
    refetch,
  };
}

/** 将某 IP 加入管理员白名单 */
export function useWhitelistSecurityAttempt(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ip: string) => {
      const res = await securityAccessAttemptControllerWhitelist({
        body: { ip },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('已加入管理员 IP 白名单'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.ipWhitelist.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.securityAttempt.all });
      onSuccess?.();
    },
    onError: (error) => {
      globalShowToast(getErrorMessage(error) || t('操作失败'), 'error');
    },
  });
}

/** 将某 IP 加入黑名单 */
export function useBlacklistSecurityAttempt(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ip: string) => {
      const res = await securityAccessAttemptControllerBlacklist({
        body: { ip },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('已加入 IP 黑名单'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.ipBlacklist.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.securityAttempt.all });
      onSuccess?.();
    },
    onError: (error) => {
      globalShowToast(getErrorMessage(error) || t('操作失败'), 'error');
    },
  });
}
