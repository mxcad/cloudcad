///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置页数据层：取值、草稿、本地校验、保存、单键/分类重置、修改历史、搜索分组。
 *
 * 按职责切片组合（拆分 god-hook，见评审候选 2）：本文件只做**组合**——
 * 列表核心面在 `useConfigList`，面板类职责在 `useConfigChannel`（通道状态 + 测试）、
 * `useModeSwitch`（安全模式切换）、`useResetCategory`（分类批量重置）、
 * `useConfigHistory`（修改历史）。对外返回**分组切片** `{ list, channel, mode, reset, history, stats }`，
 * 页面按需消费单个切片，不再吃一个 55 成员的扁平 mega 对象。
 *
 * 权限说明：进本页的人已持有 SYSTEM_CONFIG_READ/WRITE，档位（tier）只做展示分层，
 * 因此这里不做任何额外的权限判断。
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import {
  useConfigList,
  type RuntimeConfigStats,
  type UseConfigListReturn,
} from './useConfigList';

// 兼容既有导入路径（PageHeader 等从本文件取类型）
export type { RuntimeConfigStats } from './useConfigList';
import {
  useConfigChannel,
  type UseConfigChannelReturn,
} from './useConfigChannel';
import {
  useModeSwitch,
  type UseModeSwitchReturn,
} from './useModeSwitch';
import {
  useResetCategory,
  type UseResetCategoryReturn,
} from './useResetCategory';
import {
  useConfigHistory,
  type UseConfigHistoryReturn,
} from './useConfigHistory';

export interface UseRuntimeConfigReturn {
  /** 配置列表 + 草稿/保存 + 搜索分组 + 折叠/定位 */
  list: UseConfigListReturn;
  /** 通道状态 + 测试发送 */
  channel: UseConfigChannelReturn;
  /** 安全模式切换 */
  mode: UseModeSwitchReturn;
  /** 分类批量重置 */
  reset: UseResetCategoryReturn;
  /** 修改历史 */
  history: UseConfigHistoryReturn;
  /** 页面级统计（列表的量 + 模式受管项数） */
  stats: RuntimeConfigStats;
}

export function useRuntimeConfig(): UseRuntimeConfigReturn {
  const { showToast } = useNotification();

  const channel = useConfigChannel(showToast);
  // 子 hook 返回的是每次渲染新建的对象字面量，但成员函数是稳定的 useCallback。
  // 解构出稳定成员直接引用，避免把不稳定的对象字面量写进下游 useCallback/useEffect
  // 的依赖数组（react-hooks/exhaustive-deps 也会对 member 依赖报警）。
  const {
    refreshChannelStatuses,
    loadChannelStatuses,
  } = channel;

  const list = useConfigList({ refreshChannelStatuses });

  const {
    clearKeys,
    clearCategory,
    refetchSilent,
    invalidatePublicCache,
    configs,
    isDirty,
  } = list;

  const handleModeApplied = useCallback(
    async (applied: string[], unchanged: string[]) => {
      clearKeys([...applied, ...unchanged]);
      await refetchSilent();
      await refreshChannelStatuses();
    },
    [clearKeys, refetchSilent, refreshChannelStatuses]
  );

  const mode = useModeSwitch(showToast, handleModeApplied);

  const handleResetCategory = useCallback(
    async (category: string) => {
      clearCategory(category);
      await refetchSilent();
      await invalidatePublicCache(
        configs.some((c) => c.category === category && c.isPublic)
      );
      await refreshChannelStatuses();
    },
    [clearCategory, refetchSilent, invalidatePublicCache, configs, refreshChannelStatuses]
  );

  const reset = useResetCategory(configs, showToast, handleResetCategory);

  const history = useConfigHistory();

  // 配置列表加载完成后拉一次通道状态
  useEffect(() => {
    if (list.loading) return;
    void loadChannelStatuses();
  }, [list.loading, loadChannelStatuses]);

  // 首次进页取一次模式预览：「模式受管项」计数只来自这里
  useEffect(() => {
    if (list.loading || mode.modePreviewTarget !== null) return;
    void mode.loadModePreview('secure');
  }, [list.loading, mode.modePreviewTarget, mode.loadModePreview]);

  const stats: RuntimeConfigStats = useMemo(
    () => ({
      total: configs.length,
      modified: configs.filter((c) => c.isModified).length,
      envDriven: configs.filter(
        (c) => c.envValue !== null && c.envValue !== undefined
      ).length,
      pendingSave: configs.filter((c) => isDirty(c)).length,
      modeManaged: mode.modeProfileKeys.size,
    }),
    [configs, isDirty, mode.modeProfileKeys]
  );

  return { list, channel, mode, reset, history, stats };
}
