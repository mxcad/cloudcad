/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ipWhitelistControllerList,
  ipWhitelistControllerCreate,
  ipWhitelistControllerRemove,
} from '@/api-sdk';
import type {
  CreateIpWhitelistEntryDto,
  IpWhitelistEntryResponseDto,
} from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { IP_WHITELIST_PAGE_SIZE } from '../constants';
import type {
  IpWhitelistEntry,
  IpWhitelistEntryForm,
  IpWhitelistPreset,
} from '../types';

/** 将 SDK 返回的条目转换为前端类型（expiresAt 为 ISO 字符串或 null） */
function toEntry(raw: IpWhitelistEntryResponseDto): IpWhitelistEntry {
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
 * 管理员 IP 白名单列表查询（分页 + keyword 模糊搜索）
 * 后端返回 DB 条目 ∪ 服务器本地文件条目（合并分页）。
 */
export function useIpWhitelistList(page: number, keyword?: string) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.ipWhitelist.list({
      page,
      pageSize: IP_WHITELIST_PAGE_SIZE,
      keyword,
    }),
    queryFn: async () => {
      const res = await ipWhitelistControllerList({
        query: {
          page,
          pageSize: IP_WHITELIST_PAGE_SIZE,
          ...(keyword ? { keyword } : {}),
        },
      });
      if (res.error) throw res.error;
      const body = res.data;
      return {
        items: (body?.items ?? []).map(toEntry),
        total: body?.total ?? 0,
        page: body?.page ?? page,
        pageSize: body?.pageSize ?? IP_WHITELIST_PAGE_SIZE,
      };
    },
    placeholderData: (prev) => prev,
  });

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    // 翻页期间 keepPreviousData 占位 isLoading=false，须含 isFetching（与黑名单一致）
    loading: isLoading || isFetching,
    isFetching,
    refetch,
  };
}

/**
 * 添加管理员 IP 白名单条目
 */
export function useAddIpWhitelistEntry(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const showToast = (message: string, type: 'success' | 'error') =>
    globalShowToast(message, type);

  return useMutation({
    mutationFn: async (form: IpWhitelistEntryForm) => {
      const body: CreateIpWhitelistEntryDto = {
        ip: form.ip.trim(),
        reason: form.reason.trim(),
      };
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const res = await ipWhitelistControllerCreate({ body });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      showToast(t('已添加到管理员 IP 白名单'), 'success');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ipWhitelist.all,
      });
      onSuccess?.();
    },
    onError: (error) => {
      // 透传后端真实原因（重复 IP/格式非法等）
      showToast(getErrorMessage(error) || t('添加失败'), 'error');
    },
  });
}

/** 快速添加结果：added=新增成功，skipped=已存在被跳过 */
export interface BatchAddIpWhitelistResult {
  added: number;
  skipped: number;
}

/**
 * 快速添加预设组：并发提交组内全部条目，已存在的条目（后端 409）计入 skipped。
 *
 * 预设条目均为常量 CIDR、格式必然合法，故创建失败的唯一现实原因是重复；
 * 因此结果只区分「新增」与「跳过」，不逐条透传错误。
 */
export function useBatchAddIpWhitelistPreset() {
  const queryClient = useQueryClient();
  const showToast = (message: string, type: 'success' | 'error') =>
    globalShowToast(message, type);

  return useMutation({
    mutationFn: async (
      preset: IpWhitelistPreset
    ): Promise<BatchAddIpWhitelistResult> => {
      const results = await Promise.allSettled(
        preset.ips.map((ip) =>
          ipWhitelistControllerCreate({ body: { ip, reason: preset.reason } })
        )
      );
      let added = 0;
      let skipped = 0;
      for (const result of results) {
        if (result.status === 'fulfilled' && !result.value.error) added++;
        else skipped++;
      }
      return { added, skipped };
    },
    onSuccess: ({ added, skipped }) => {
      const parts: string[] = [];
      if (added > 0) {
        parts.push(t('已添加 {count} 条', { count: String(added) }));
      }
      if (skipped > 0) {
        parts.push(t('{count} 条已存在，已跳过', { count: String(skipped) }));
      }
      showToast(parts.join('；'), added > 0 ? 'success' : 'error');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ipWhitelist.all,
      });
    },
  });
}
