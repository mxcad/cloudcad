///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ipBlacklistControllerList,
  ipBlacklistControllerCreate,
  ipBlacklistControllerRemove,
} from '@/api-sdk';
import type {
  CreateIpBlacklistEntryDto,
  IpBlacklistEntryResponseDto,
} from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { IP_BLACKLIST_PAGE_SIZE } from '../constants';
import type { IpBlacklistEntry, IpBlacklistEntryForm } from '../types';

/** 将 SDK 返回的条目转换为前端类型（expiresAt 为 ISO 字符串或 null） */
function toEntry(raw: IpBlacklistEntryResponseDto): IpBlacklistEntry {
  return {
    id: raw.id,
    ip: raw.ip,
    source: raw.source,
    reason: raw.reason,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
  };
}

/**
 * IP 黑名单列表查询（分页 + keyword 模糊搜索）
 */
export function useIpBlacklistList(page: number, keyword?: string) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.ipBlacklist.list({
      page,
      pageSize: IP_BLACKLIST_PAGE_SIZE,
      keyword,
    }),
    queryFn: async () => {
      const res = await ipBlacklistControllerList({
        query: {
          page,
          pageSize: IP_BLACKLIST_PAGE_SIZE,
          ...(keyword ? { keyword } : {}),
        },
      });
      if (res.error) throw res.error;
      const body = res.data;
      return {
        items: (body?.items ?? []).map(toEntry),
        total: body?.total ?? 0,
        page: body?.page ?? page,
        pageSize: body?.pageSize ?? IP_BLACKLIST_PAGE_SIZE,
      };
    },
    placeholderData: (prev) => prev,
  });

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    // 翻页期间 keepPreviousData 占位 isLoading=false，须含 isFetching（滚动控制器
    // loading 恒 false 会使边界阻塞/链式预载/displayedPage 延迟失效）
    loading: isLoading || isFetching,
    isFetching,
    refetch,
  };
}

/**
 * 添加 IP 黑名单条目
 */
export function useAddIpBlacklistEntry(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const showToast = (message: string, type: 'success' | 'error') =>
    globalShowToast(message, type);

  return useMutation({
    mutationFn: async (form: IpBlacklistEntryForm) => {
      const body: CreateIpBlacklistEntryDto = {
        ip: form.ip.trim(),
        reason: form.reason.trim(),
      };
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const res = await ipBlacklistControllerCreate({ body });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      showToast(t('已添加到 IP 黑名单'), 'success');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ipBlacklist.all,
      });
      onSuccess?.();
    },
    onError: (error) => {
      // 透传后端真实原因（重复 IP/格式非法等）
      showToast(getErrorMessage(error) || t('添加失败'), 'error');
    },
  });
}
