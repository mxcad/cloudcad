///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  noticeCenterControllerCreate,
  noticeCenterControllerListAll,
  noticeCenterControllerPublish,
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
      const res = await noticeCenterControllerListAll();
      if (res.error) throw res.error;
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
        kind: values.kind,
        level: values.level,
        title: values.title.trim(),
        body: values.body.trim(),
        // 表单无「保存草稿」开关，恒为立即发布（草稿只能经 API 创建，由「发布」按钮转正）
        publishNow: true,
        autoExpire: values.autoExpire,
      };
      if (values.startAt) body.startAt = values.startAt;
      if (values.endAt) body.endAt = values.endAt;

      const res = await noticeCenterControllerCreate({ body });
      if (res.error) throw res.error;
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
      const res = await noticeCenterControllerUpdate({ path: { id }, body });
      if (res.error) throw res.error;
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

/** 发布草稿：草稿只允许改文案、不可下线，需要一个显式动作才能对外生效 */
export function usePublishNotice(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await noticeCenterControllerPublish({ path: { id } });
      if (res.error) throw res.error;
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
      const res = await noticeCenterControllerRetract({ path: { id } });
      if (res.error) throw res.error;
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
