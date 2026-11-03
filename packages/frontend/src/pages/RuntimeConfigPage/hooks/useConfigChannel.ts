///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 通道状态 + 通道测试对话框数据层（useRuntimeConfig 的子 hook，按职责切片）。
 *
 * 只关心「通道配置完整度 / 验证记录」与「测试发送对话框」：通道状态拉取、
 * 测试目标/接收方/结果、测试执行。配置项保存/重置会改变通道配置，故对外暴露
 * `refreshChannelStatuses` 供主 hook 在保存/重置/应用模式后静默刷新。
 */

import { useCallback, useState } from 'react';
import {
  runtimeConfigControllerGetChannelsStatus,
  runtimeConfigControllerTestChannel,
} from '@/api-sdk';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import { toChannelStatuses } from '../meta';
import type {
  ChannelStatus,
  ChannelTestResult,
} from '../types';

export interface UseConfigChannelReturn {
  /** 通道状态（配置完整度 + 验证记录），空数组表示后端未注册任何通道 */
  channelStatuses: ChannelStatus[];
  /** 正在执行测试发送的通道（按钮 loading 态） */
  channelTesting: Set<string>;
  /** 打开中的测试对话框对应的通道；null 表示未打开 */
  channelTestTarget: string | null;
  /** 测试对话框中的接收方草稿（邮箱/手机号，语义随通道而定；留空由通道动作自行决定） */
  channelTestRecipient: string;
  /** 最近一次测试的结果（失败时保留在对话框里展示错误文案 + 可定位的出错配置项） */
  channelTestResult: ChannelTestResult | null;
  openChannelTest: (channel: string) => void;
  closeChannelTest: () => void;
  setChannelTestRecipient: (value: string) => void;
  confirmChannelTest: () => Promise<void>;
  /** 静默刷新通道状态（保存/重置/应用模式等使通道配置变更后调用） */
  refreshChannelStatuses: () => Promise<void>;
  /** 首次加载（配置列表加载完成后调用一次） */
  loadChannelStatuses: () => Promise<void>;
}

export function useConfigChannel(
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
): UseConfigChannelReturn {
  const [channelStatuses, setChannelStatuses] = useState<ChannelStatus[]>([]);
  const [channelTesting, setChannelTesting] = useState<Set<string>>(new Set());
  const [channelTestTarget, setChannelTestTarget] = useState<string | null>(
    null
  );
  const [channelTestRecipient, setChannelTestRecipient] = useState('');
  const [channelTestResult, setChannelTestResult] = useState<
    ChannelTestResult | null
  >(null);

  /** 拉取通道状态。通道区块是辅助信息：拉取失败只 toast 不阻塞页面。 */
  const fetchChannelStatuses = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        const result = await runtimeConfigControllerGetChannelsStatus({
          throwOnError: true,
        });
        setChannelStatuses(toChannelStatuses(result.data));
      } catch (error: unknown) {
        if (opts?.silent) return;
        handleError(error, t('获取通道状态失败'));
        showToast(getErrorMessage(error) || t('获取通道状态失败'), 'error');
      }
    },
    [showToast]
  );

  const loadChannelStatuses = useCallback(
    () => fetchChannelStatuses(),
    [fetchChannelStatuses]
  );

  const refreshChannelStatuses = useCallback(
    () => fetchChannelStatuses({ silent: true }),
    [fetchChannelStatuses]
  );

  const openChannelTest = useCallback((channel: string) => {
    setChannelTestRecipient('');
    setChannelTestResult(null);
    setChannelTestTarget(channel);
  }, []);

  const closeChannelTest = useCallback(() => {
    setChannelTestTarget(null);
    setChannelTestRecipient('');
    setChannelTestResult(null);
  }, []);

  /**
   * 执行通道验证。后端语义：配置不完整/验证失败都返回 200 + ok:false
   * （带原因文案 + 疑似出错的配置键），只有通道未注册等参数错误才 4xx——
   * 两种失败都 toast 后端文案，并把结果保留在对话框里，随后刷新通道状态。
   */
  const confirmChannelTest = useCallback(async () => {
    const channel = channelTestTarget;
    if (!channel) return;
    setChannelTesting((prev) => new Set(prev).add(channel));
    try {
      const result = await runtimeConfigControllerTestChannel({
        throwOnError: true,
        path: { channel },
        body: { to: channelTestRecipient.trim() || undefined },
      });
      const data = result.data;
      if (data?.ok) {
        showToast(data.message || t('验证成功'), 'success');
        setChannelTestResult(null);
        setChannelTestTarget(null);
        setChannelTestRecipient('');
      } else {
        showToast(data?.message || t('验证失败'), 'error');
        setChannelTestResult({
          ok: false,
          message: data?.message || t('验证失败'),
          problemKeys: Array.isArray(data?.problemKeys)
            ? (data.problemKeys as unknown[]).map(String)
            : [],
        });
      }
    } catch (error: unknown) {
      handleError(error, t('验证失败'));
      showToast(getErrorMessage(error) || t('验证失败'), 'error');
      setChannelTestResult({
        ok: false,
        message: getErrorMessage(error) || t('验证失败'),
        problemKeys: [],
      });
    } finally {
      setChannelTesting((prev) => {
        const next = new Set(prev);
        next.delete(channel);
        return next;
      });
      await fetchChannelStatuses({ silent: true });
    }
  }, [channelTestTarget, channelTestRecipient, showToast, fetchChannelStatuses]);

  return {
    channelStatuses,
    channelTesting,
    channelTestTarget,
    channelTestRecipient,
    channelTestResult,
    openChannelTest,
    closeChannelTest,
    setChannelTestRecipient,
    confirmChannelTest,
    refreshChannelStatuses,
    loadChannelStatuses,
  };
}
