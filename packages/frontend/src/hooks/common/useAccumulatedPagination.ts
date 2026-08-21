///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeNodesByMode } from './mergeNodesByMode';

interface UseAccumulatedPaginationOptions<T extends { id: string }> {
  /** 当前页数据（React Query 返回，翻页时整体替换） */
  displayNodes: T[];
  /** 最近请求的页码（用于校验滚动方向与数据实际所属页一致，防导航/搜索竞态误合并） */
  currentPage: number;
  /** 页码变化回调（如 setCurrentPage / fs.handlePageChange） */
  handlePageChange: (page: number) => void;
  /**
   * 查询身份（目录/搜索/每页数量/筛选），变化时强制整体替换并清除挂起方向，
   * 防「向上滚动挂起的 prev 方向撞上新查询的 page-1 数据」误前插。
   */
  resetKey?: string;
}

interface UseAccumulatedPaginationReturn<T extends { id: string }> {
  /** 合并后的展示列表：滚动翻页追加/前插，其余情况跟随 displayNodes 整体替换 */
  viewNodes: T[];
  /** 滚动触发的翻页入口（记录方向后转发给 handlePageChange） */
  handleScrollPageChange: (page: number, direction: 'prev' | 'next') => void;
  /**
   * 列表第一项所属页码（滚动控制器 prev 触发条件用）：
   * - 整体替换 / prepend 前插 → currentPage（列表从当前请求页开始）；
   * - append 追加 → 不变（列表第一项不变）。
   * 防「目标页已存在于累计列表仍触发 prev → prepend 去重错乱」（实例：
   * 从第 1 页滚到第 5 页后向上滚，错误请求已存在的 page4）。
   */
  minLoadedPage: number;
}

/**
 * 滚动分页数据合并（追加/前插/替换）统一逻辑
 *
 * 泛型 <T extends { id: string }>：供任意「翻页查询 + 滚动合并」页面共用
 * （FileSystemManager / LibraryManager / 用户管理 / IP 黑名单 / 审计日志，ADR-0052），
 * 与 CAD 编辑器侧边栏图纸库/图块库（useLibraryLoader 的 replace/append/prepend 合并）行为对齐：
 * - 向下滚动 → next → 在现有数据后追加（append，按 id 去重）；
 * - 向上滚动 → prev → 在现有数据前前插（prepend，按 id 去重）；
 * - 其余变化（导航/搜索/筛选/页码跳转/刷新）→ 整体替换（direction 校验失败时兜底）。
 *
 * 竞态防护：
 * - displayNodes 引用未变（React Query keepPreviousData 占位期）时保留挂起方向不消费；
 * - 仅当挂起方向的目标页码 === 当前请求页 currentPage 时才按方向合并，否则替换
 *   （导航/搜索/筛选通常会把页码重置为 1，与挂起的 next/prev 目标页码不匹配）；
 * - resetKey 变化时清空挂起方向，杜绝跨查询身份误合并。
 */
export function useAccumulatedPagination<T extends { id: string }>({
  displayNodes,
  currentPage,
  handlePageChange,
  resetKey,
}: UseAccumulatedPaginationOptions<T>): UseAccumulatedPaginationReturn<T> {
  const [accumulatedNodes, setAccumulatedNodes] =
    useState<T[]>(displayNodes);
  // 列表第一项所属页码（见 UseAccumulatedPaginationReturn.minLoadedPage 注释）
  const [minLoadedPage, setMinLoadedPage] = useState(currentPage);

  // 挂起的滚动方向：handleScrollPageChange 记录，数据到位后消费
  const pendingRef = useRef<{
    direction: 'prev' | 'next';
    targetPage: number;
  } | null>(null);
  // 上一次数据引用：引用未变（keepPreviousData 占位期）不消费挂起方向
  const prevNodesRef = useRef(displayNodes);
  const prevResetKeyRef = useRef(resetKey);

  const handleScrollPageChange = useCallback(
    (page: number, direction: 'prev' | 'next') => {
      pendingRef.current = { direction, targetPage: page };
      handlePageChange(page);
    },
    [handlePageChange]
  );

  useEffect(() => {
    // 引用变化但内容未变（查询未就绪时 hook 每次渲染返回新建的空数组）：
    // 空→空视为未变化，避免每次渲染 setState 触发无限循环
    // （Maximum update depth exceeded，ADR-0052 用户管理页打开即崩根因；
    //   非空数据仍按引用变化处理，覆盖同 id 字段更新的场景）
    const nodesChanged =
      prevNodesRef.current !== displayNodes &&
      !(prevNodesRef.current.length === 0 && displayNodes.length === 0);
    prevNodesRef.current = displayNodes;

    // 查询身份变化：清除挂起方向。
    // - 新查询数据已到位（导航命中缓存等，displayNodes 同步变化）→ 直接整体替换；
    // - 新查询未到位（如输入搜索词，displayNodes 仍是旧数据）→ 不替换，
    //   避免瞬时塌缩已累计的列表，等新数据到位后按「无方向」整体替换。
    if (resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      pendingRef.current = null;
      if (nodesChanged) {
        setAccumulatedNodes(displayNodes);
        setMinLoadedPage(currentPage); // 新查询列表从当前请求页开始
      }
      return;
    }

    // 数据未变（keepPreviousData 占位期）：保留挂起方向等真实数据到位
    if (!nodesChanged) return;

    const pending = pendingRef.current;
    pendingRef.current = null;

    // 方向校验：目标页码必须与数据实际所属页一致，否则视为非滚动变化整体替换
    if (!pending || pending.targetPage !== currentPage) {
      setAccumulatedNodes(displayNodes);
      setMinLoadedPage(currentPage);
      return;
    }

    const dir = pending.direction;
    if (dir === 'next') {
      // append：列表第一项不变
      setAccumulatedNodes((prev) =>
        mergeNodesByMode(prev, displayNodes, 'append')
      );
    } else {
      // prepend：列表第一项 = 前插的页（currentPage）
      setAccumulatedNodes((prev) =>
        mergeNodesByMode(prev, displayNodes, 'prepend')
      );
      setMinLoadedPage(currentPage);
    }
  }, [displayNodes, currentPage, resetKey]);

  return {
    viewNodes: accumulatedNodes,
    handleScrollPageChange,
    minLoadedPage,
  };
}
