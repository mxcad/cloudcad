///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useMemo } from 'react';
import { useFileBrowserData } from './useFileBrowserData';
import { useFileBrowserSelection } from './useFileBrowserSelection';
import { useFileBrowserActions } from './useFileBrowserActions';
import { useFileBrowserModals } from './useFileBrowserModals';
import type {
  UseFileBrowserDataOptions,
  UseFileBrowserDataReturn,
} from './useFileBrowserData';
import type {
  UseFileBrowserSelectionOptions,
  UseFileBrowserSelectionReturn,
} from './useFileBrowserSelection';
import type {
  UseFileBrowserActionsOptions,
  UseFileBrowserActionsReturn,
} from './useFileBrowserActions';
import type {
  UseFileBrowserModalsOptions,
  UseFileBrowserModalsReturn,
} from './useFileBrowserModals';

export interface UseFileBrowserOptions {
  data: UseFileBrowserDataOptions;
  selection: UseFileBrowserSelectionOptions;
  actions: Omit<
    UseFileBrowserActionsOptions,
    'data' | 'selection'
  >;
  modals: Omit<
    UseFileBrowserModalsOptions,
    'actions' | 'nodes' | 'selectedNodes' | 'clearSelection' | 'projectId'
  >;
}

export interface UseFileBrowserReturn {
  data: UseFileBrowserDataReturn;
  selection: UseFileBrowserSelectionReturn;
  actions: UseFileBrowserActionsReturn;
  modals: UseFileBrowserModalsReturn;
}

/**
 * useFileBrowser - 文件浏览器内核聚合（A+B+C+D 一键组合）
 *
 * 原子 hook 与聚合并存：外壳按需组装（useFileBrowser 组合），测试可单点命中原子。
 * 聚合内部负责原子间接线（data→selection→actions→modals），输出全量。
 */
export const useFileBrowser = (
  options: UseFileBrowserOptions
): UseFileBrowserReturn => {
  const data = useFileBrowserData(options.data);
  const selection = useFileBrowserSelection(options.selection);
  const actions = useFileBrowserActions({
    ...options.actions,
    data,
    selection,
  });
  const modals = useFileBrowserModals({
    ...options.modals,
    actions,
    nodes: data.nodes,
    selectedNodes: selection.selectedNodes,
    clearSelection: selection.clearSelection,
    projectId: options.actions.projectId,
  });

  return useMemo(
    () => ({ data, selection, actions, modals }),
    [data, selection, actions, modals]
  );
};
