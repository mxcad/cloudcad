///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseBreadcrumbCollapseOptions {
  /** 面包屑项数量 */
  breadcrumbLength: number;
  /** 预留宽度（用于返回按钮、项目列表按钮等） */
  reservedWidth?: number;
}

export interface UseBreadcrumbCollapseReturn {
  /** 是否展开下拉菜单 */
  isExpanded: boolean;
  /** 是否需要折叠（显示下拉按钮） */
  needsCollapse: boolean;
  /** 可见的面包屑项数量 */
  visibleItemCount: number;
  /** 设置展开状态 */
  setIsExpanded: (expanded: boolean) => void;
  /** 面包屑容器 ref */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 下拉菜单 ref */
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  /** 点击外部关闭下拉菜单的事件监听器 */
  handleClickOutside: (event: MouseEvent) => void;
  /** 窗口滚动/调整大小时关闭下拉菜单的事件监听器 */
  handleScrollOrResize: () => void;
}

/**
 * 面包屑折叠 Hook
 *
 * 用于管理面包屑导航的响应式折叠行为，支持动态计算可见项数量和下拉菜单展开/收起
 *
 * @param options 配置选项
 * @returns 面包屑折叠状态和方法
 */
export const useBreadcrumbCollapse = (
  options: UseBreadcrumbCollapseOptions
): UseBreadcrumbCollapseReturn => {
  const { breadcrumbLength, reservedWidth = 140 } = options;

  const [isExpanded, setIsExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [visibleItemCount, setVisibleItemCount] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  /**
   * 计算可见项数量
   */
  const calculateVisibleItems = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const availableWidth = containerWidth - reservedWidth;

    const items = container.querySelectorAll('[data-breadcrumb-item]');
    let totalWidth = 0;
    let count = 0;

    items.forEach((item, index) => {
      const width = (item as HTMLElement).offsetWidth;
      const itemTotalWidth = width + (index > 0 ? 16 : 0);

      if (totalWidth + itemTotalWidth <= availableWidth) {
        totalWidth += itemTotalWidth;
        count++;
      }
    });

    // 确保至少显示最后一项
    const minVisible = Math.min(1, breadcrumbLength);
    const finalCount = Math.max(minVisible, count);

    setVisibleItemCount(finalCount);
    setNeedsCollapse(finalCount < breadcrumbLength);
  }, [breadcrumbLength, reservedWidth]);

  /**
   * 监听容器宽度变化
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    calculateVisibleItems();

    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleItems();
    });

    resizeObserver.observe(container);
    window.addEventListener('resize', calculateVisibleItems);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', calculateVisibleItems);
    };
  }, [breadcrumbLength, calculateVisibleItems]);

  /**
   * 点击外部关闭下拉菜单
   */
  const handleClickOutside = useCallback((event: MouseEvent) => {
    const target = event.target as Node;

    // 检查点击是否在下拉菜单按钮或其内部
    if (dropdownRef.current && dropdownRef.current.contains(target)) {
      return;
    }

    // 检查点击是否在下拉菜单内容区域
    const isDropdownContent = (target as HTMLElement).closest?.(
      '[data-breadcrumb-dropdown]'
    );
    if (isDropdownContent) {
      return;
    }

    setIsExpanded(false);
  }, []);

  /**
   * 窗口滚动或调整大小时关闭下拉菜单
   */
  const handleScrollOrResize = useCallback(() => {
    setIsExpanded(false);
  }, []);

  /**
   * 添加/移除全局事件监听
   */
  useEffect(() => {
    if (!isExpanded) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isExpanded, handleClickOutside, handleScrollOrResize]);

  return {
    isExpanded,
    needsCollapse,
    visibleItemCount,
    setIsExpanded,
    containerRef,
    dropdownRef,
    handleClickOutside,
    handleScrollOrResize,
  };
};

export default useBreadcrumbCollapse;
