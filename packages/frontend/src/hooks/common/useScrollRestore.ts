///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { MeasureState, PendingRestore } from './scrollPaginationCore';

interface UseScrollRestoreOptions {
  containerRef: RefObject<HTMLElement | null>;
  itemContainerRef: RefObject<HTMLElement | null> | null;
  /** 分页状态快照（随渲染更新，恢复执行时读最新） */
  stateRef: MutableRefObject<MeasureState>;
  /** 挂起的恢复请求（jumpTo / prev 前插 / pageSize 变化时写入） */
  pendingRestoreRef: MutableRefObject<PendingRestore | null>;
  loading: boolean;
  currentPage: number;
  itemsLength: number;
  pageSize: number;
}

/**
 * 滚动位置恢复：数据到位（loading 结束 / 页码或数据变化）后双 rAF 执行。
 *
 * 双 rAF 等父层（useAccumulatedPagination / useLibraryLoader）合并渲染完成，
 * 此时 scrollHeight / offsetTop 才包含新内容（与 CAD 侧边栏旧实现同模式）：
 * - prev 前插 → scrollTop = oldTop + heightDiff 视口锚定；
 * - jump 跳页 → 累计模型定位目标页第一项（视口中心），replace 模型滚动条居中；
 *   目标页尚未加载时保留挂起等数据到位（避免回顶后不再居中）；
 * - top（pageSize 变化）→ 回顶。
 */
export function useScrollRestore({
  containerRef,
  itemContainerRef,
  stateRef,
  pendingRestoreRef,
  loading,
  currentPage,
  itemsLength,
  pageSize,
}: UseScrollRestoreOptions) {
  useEffect(() => {
    if (loading) return;
    const pending = pendingRestoreRef.current;
    if (!pending) return;
    const container = containerRef.current;
    if (!container) return;
    const { direction, page, beforeLoad } = pending;
    // jump 且累计模型下目标页尚未加载（children 无对应项）：保留挂起，
    // 等数据到位（replace 后 itemsLength 变化）再定位，避免回顶后不再居中
    if (
      direction === 'jump' &&
      page &&
      stateRef.current.itemsLength > stateRef.current.pageSize &&
      !itemContainerRef?.current?.children[
        (page - 1) * stateRef.current.pageSize
      ]
    ) {
      return;
    }
    pendingRestoreRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = containerRef.current;
        if (!c) return;
        if (direction === 'prev' && beforeLoad) {
          // 前插后视口锚定回原内容位置
          const heightDiff = c.scrollHeight - beforeLoad.scrollHeight;
          if (heightDiff > 0) {
            c.scrollTop = beforeLoad.scrollTop + heightDiff;
          }
        } else if (direction === 'jump' && page) {
          const { itemsLength: len, pageSize: ps } = stateRef.current;
          let target: number;
          if (len > ps) {
            // 累计模型（DOM 含多页）：视口中心对准目标页第一项，上下皆可滚
            const index = (page - 1) * ps;
            const child = itemContainerRef?.current?.children[index] as
              | HTMLElement
              | undefined;
            target = child ? child.offsetTop - c.clientHeight / 2 : 0;
          } else {
            // replace 模型（DOM 只有目标页）：滚动条居中
            target = (c.scrollHeight - c.clientHeight) / 2;
          }
          c.scrollTop = Math.max(
            0,
            Math.min(target, c.scrollHeight - c.clientHeight)
          );
        } else if (direction === 'top') {
          c.scrollTop = 0;
        }
      });
    });
  }, [
    loading,
    currentPage,
    itemsLength,
    pageSize,
    containerRef,
    itemContainerRef,
    stateRef,
    pendingRestoreRef,
  ]);
}
