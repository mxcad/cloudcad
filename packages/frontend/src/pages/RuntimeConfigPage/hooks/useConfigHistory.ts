///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 修改历史面板数据层（useRuntimeConfig 的子 hook，按职责切片）。
 *
 * 只关心「拉取/关闭某配置键的修改历史」这一件事：历史清单、加载态、错误态。
 * 不依赖配置列表/草稿/通道等其他面板，可独立单测。
 */

import { useCallback, useState } from 'react';
import { runtimeConfigControllerGetConfigHistory } from '@/api-sdk';
import { getErrorMessage, handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import { toHistoryEntries } from '../meta';
import type { ConfigHistoryEntry } from '../types';

/** 单条历史拉取条数（后端上限 100） */
const HISTORY_LIMIT = 50;

export interface UseConfigHistoryReturn {
  historyKey: string | null;
  history: ConfigHistoryEntry[];
  historyLoading: boolean;
  historyError: string | null;
  openHistory: (key: string) => Promise<void>;
  closeHistory: () => void;
}

export function useConfigHistory(): UseConfigHistoryReturn {
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<ConfigHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const openHistory = useCallback(async (key: string) => {
    setHistoryKey(key);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await runtimeConfigControllerGetConfigHistory({
        throwOnError: true,
        path: { key },
        query: { limit: String(HISTORY_LIMIT) },
      });
      setHistory(toHistoryEntries(result.data));
    } catch (error: unknown) {
      handleError(error, t('获取修改历史失败'));
      setHistoryError(getErrorMessage(error) || t('获取修改历史失败'));
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryKey(null);
    setHistory([]);
    setHistoryError(null);
  }, []);

  return {
    historyKey,
    history,
    historyLoading,
    historyError,
    openHistory,
    closeHistory,
  };
}
