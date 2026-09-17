///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useRef } from 'react';
import type { BatchTask } from '@/stores/useBatchDownloadStore';

/** 无 active 任务后延迟收起面板的时长（S6-3）：让用户看到终态结果后再收起 */
export const AUTO_COLLAPSE_DELAY_MS = 8000;

interface UsePanelAutoCollapseOptions {
  /** 是否有进行中（pending/processing）转换任务 */
  hasActive: boolean;
  /** 进行中（pending/processing）转换任务数 —— 按数量增长判定「本会话新触发」 */
  activeCount: number;
  /** 活跃上传数（上传中/等待/暂停） */
  uploadActiveCount: number;
  /** 批量下载任务（PENDING/PROCESSING 计为活跃） */
  downloadTasks: BatchTask[];
  /**
   * 初始数据是否 hydrate 完成（云端任务首次拉取 + 下载任务服务端同步）。
   *
   * 完成前只记录基线：上个会话遗留的进行中转换、localStorage / 服务端 hydrate
   * 来的下载历史都不触发展开——面板默认关闭，仅由本会话的新动作拉起。
   */
  settled: boolean;
  /** 面板是否由任务驱动的自动展开拉起（用户显式打开时为 false，不自动收起） */
  autoDismissable: boolean;
  expandPanel: () => void;
  setActiveTab: (tab: 'conversion' | 'download' | 'upload') => void;
  setCollapsed: (collapsed: boolean) => void;
}

/**
 * 判定「settled 之后新增长」的任务。
 *
 * settled 之前（挂载 + hydrate 阶段）只记录基线；settled 首次生效时锁定基线；
 * 之后才把增长视为本会话新触发的动作。按数量而非布尔跃迁判定，保证面板折叠时
 * 再触发一个新任务也能把它弹出来。
 */
export function isGrowthAfterSettle(
  count: number,
  settled: boolean,
  prevRef: { current: number },
  latchedRef: { current: boolean }
): boolean {
  if (!settled) {
    prevRef.current = count;
    return false;
  }
  if (!latchedRef.current) {
    latchedRef.current = true;
    prevRef.current = count;
    return false;
  }
  const grew = count > prevRef.current;
  prevRef.current = count;
  return grew;
}

/**
 * 队列面板自动展开/收起。
 *
 * 面板默认关闭，仅由本会话的新动作（上传 / 下载 / 触发转换）拉起：
 * - 新触发活跃转换任务时自动展开并切到转换 tab；
 * - 新触发上传任务时自动展开并切到上传 tab；
 * - 新触发下载任务时自动展开并切到下载 tab；
 * - 仅「任务自动展开」的面板在无 active 任务后延迟自动收起（S6-3），
 *   用户显式打开的面板保持展开不被收掉。
 *
 * 有进行中任务时的云端轮询留在面板组件内（与 SSE 兜底同处），本 hook 只管展开/收起。
 *
 * 返回进行中（PENDING/PROCESSING）下载任务数，供面板角标复用，避免重复过滤。
 */
export function usePanelAutoCollapse({
  hasActive,
  activeCount,
  uploadActiveCount,
  downloadTasks,
  settled,
  autoDismissable,
  expandPanel,
  setActiveTab,
  setCollapsed,
}: UsePanelAutoCollapseOptions) {
  // 新增活跃转换任务时自动展开面板并切到转换 tab：CAD 编辑器打开上传文件、
  // 批量导出等入口产生的任务此前不会触发面板显示。按进行中数量增长判定
  // （非布尔跃迁）：面板已折叠时又触发一个新转换同样要弹出。
  // settled 之前只记录基线，存量任务不触发展开（面板默认关闭）。
  const prevActiveCountRef = useRef(0);
  const activeCountLatchedRef = useRef(false);
  useEffect(() => {
    if (
      isGrowthAfterSettle(
        activeCount,
        settled,
        prevActiveCountRef,
        activeCountLatchedRef
      )
    ) {
      expandPanel();
      setActiveTab('conversion');
    }
  }, [activeCount, settled, expandPanel, setActiveTab]);

  // 仅「任务自动展开」的面板在无 active 任务且无活跃上传/下载后延迟收起（S6-3）；
  // 用户显式打开的面板保持展开
  // （上传历史 done/failed 不阻止收起，否则有历史后面板永不收起）
  const activeDownloadCount = downloadTasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'PROCESSING'
  ).length;
  const hasActiveDownload = activeDownloadCount > 0;
  useEffect(() => {
    if (hasActive || uploadActiveCount > 0 || hasActiveDownload) return;
    if (!autoDismissable) return;
    const timer = setTimeout(() => setCollapsed(true), AUTO_COLLAPSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    hasActive,
    uploadActiveCount,
    hasActiveDownload,
    autoDismissable,
    setCollapsed,
  ]);

  // 新增活跃上传任务时自动展开面板并切到上传 tab。
  // 不门控 settled：上传历史同步恢复且只含终态，挂载时存在活跃上传必是本会话动作。
  const prevUploadActiveRef = useRef(0);
  useEffect(() => {
    if (uploadActiveCount > prevUploadActiveRef.current) {
      expandPanel();
      setActiveTab('upload');
    }
    prevUploadActiveRef.current = uploadActiveCount;
  }, [uploadActiveCount, expandPanel, setActiveTab]);

  // 新增下载任务时自动展开面板并切到下载 tab（#536：单文件 dwg/dxf/pdf 导出入队后即时可见）。
  // settled 之前只记录基线：挂载时 localStorage 残留 / 服务端 hydrate 的历史记录
  // 不算本会话新触发的下载。
  const prevDownloadTotalRef = useRef(0);
  const downloadTotalLatchedRef = useRef(false);
  useEffect(() => {
    if (
      isGrowthAfterSettle(
        downloadTasks.length,
        settled,
        prevDownloadTotalRef,
        downloadTotalLatchedRef
      )
    ) {
      expandPanel();
      setActiveTab('download');
    }
  }, [downloadTasks.length, settled, expandPanel, setActiveTab]);

  return { activeDownloadCount };
}
