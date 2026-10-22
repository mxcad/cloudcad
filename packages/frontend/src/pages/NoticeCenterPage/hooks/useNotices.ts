///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  noticeCenterControllerBatchDelete,
  noticeCenterControllerCreate,
  noticeCenterControllerListAll,
  noticeCenterControllerPublish,
  noticeCenterControllerRemove,
  noticeCenterControllerRetract,
  noticeCenterControllerUpdate,
} from '@/api-sdk';
import type {
  CreateNoticeDto,
  NoticeResponseDto,
  UpdateNoticeDto,
} from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import { NOTICE_LIST_REFRESH_MS } from '../constants';
import type { NoticeFormValues } from '../types';

/** 全部公告列表（含草稿与已下线），按创建时间倒序 */
export function useNoticeList() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.notices.listAll,
    queryFn: async (): Promise<NoticeResponseDto[]> => {
      const res = await noticeCenterControllerListAll({ throwOnError: true });
      return Array.isArray(res.data) ? res.data : [];
    },
    refetchInterval: NOTICE_LIST_REFRESH_MS,
  });

  return {
    items: data ?? [],
    loading: isLoading || isFetching,
    isFetching,
    refetch,
  };
}

export function useCreateNotice(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: NoticeFormValues) => {
      const body: CreateNoticeDto = {
        // 后端 kind 白名单当前只有 system（下载公告已砍），故表单不再暴露类型选择
        kind: 'system',
        level: values.level,
        title: values.title.trim(),
        body: values.body.trim(),
        // 表单无「保存草稿」开关，恒为立即发布（草稿只能经 API 创建，由「发布」按钮转正）
        publishNow: true,
        autoExpire: values.autoExpire,
      };
      if (values.startAt) body.startAt = values.startAt;
      if (values.endAt) body.endAt = values.endAt;

      const res = await noticeCenterControllerCreate({
        throwOnError: true,
        body,
      });
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('公告已保存'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      onSuccess?.();
    },
    onError: (error) => {
      // 透传后端真实原因（autoExpire 缺 endAt / 字段超长等）
      globalShowToast(getErrorMessage(error) || t('保存失败'), 'error');
    },
  });
}

/** PATCH 只允许改级别/标题/正文；多传时间窗会被后端 400 拒绝 */
export function useUpdateNotice(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: NoticeFormValues;
    }) => {
      const body: UpdateNoticeDto = {
        level: values.level,
        title: values.title.trim(),
        body: values.body.trim(),
      };
      const res = await noticeCenterControllerUpdate({
        throwOnError: true,
        path: { id },
        body,
      });
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('公告已更新'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      onSuccess?.();
    },
    onError: (error) => {
      globalShowToast(getErrorMessage(error) || t('更新失败'), 'error');
    },
  });
}

/**
 * 发布草稿，或把已下线的公告重新上线（retract 之后 publishedAt 为空，本端点是
 * 唯一的回正路径）。草稿只允许改文案、不可下线，需要一个显式动作才能对外生效。
 */
export function usePublishNotice(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await noticeCenterControllerPublish({
        throwOnError: true,
        path: { id },
      });
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('公告已发布'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      onSuccess?.();
    },
    onError: (error) => {
      // 透传后端真实原因（已发布 / 失效时间已过等）
      globalShowToast(getErrorMessage(error) || t('发布失败'), 'error');
    },
  });
}

export function useRetractNotice(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await noticeCenterControllerRetract({
        throwOnError: true,
        path: { id },
      });
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('公告已下线'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      onSuccess?.();
    },
    onError: (error) => {
      globalShowToast(getErrorMessage(error) || t('下线失败'), 'error');
    },
  });
}

/** 删除单条（不可恢复；正在生效的会被后端一并广播下线） */
export function useDeleteNotice(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await noticeCenterControllerRemove({
        throwOnError: true,
        path: { id },
      });
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('公告已删除'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      onSuccess?.();
    },
    onError: (error) => {
      globalShowToast(getErrorMessage(error) || t('删除失败'), 'error');
    },
  });
}

/** 批量删除（不可恢复）：一次 POST，后端对不存在的 ID 静默跳过并回 notFound */
export function useBatchDeleteNotices(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const res = await noticeCenterControllerBatchDelete({
        throwOnError: true,
        body: { ids },
      });
      return res.data;
    },
    onSuccess: () => {
      globalShowToast(t('已删除所选公告'), 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      onSuccess?.();
    },
    onError: (error) => {
      globalShowToast(getErrorMessage(error) || t('删除失败'), 'error');
    },
  });
}
