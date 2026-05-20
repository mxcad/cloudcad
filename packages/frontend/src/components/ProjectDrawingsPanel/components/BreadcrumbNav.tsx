///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import type { BreadcrumbItem } from '@/components/ProjectDrawingsPanel/types';
import styles from '@/components/sidebar/sidebar.module.css';
import { Menu } from '@/components/ui/Menu';

interface BreadcrumbNavProps {
  breadcrumb: BreadcrumbItem[];
  isLibraryMode: boolean;
  isPersonalSpace: boolean;
  handleGoBack: () => void;
  handleBreadcrumbClick: (index: number) => void;
  handleBackToProjects: () => void;
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  breadcrumb,
  isLibraryMode,
  isPersonalSpace,
  handleGoBack,
  handleBreadcrumbClick,
  handleBackToProjects,
}) => {
  // 面包屑折叠状态
  const [isBreadcrumbExpanded, setIsBreadcrumbExpanded] = useState(false);
  const breadcrumbContainerRef = useRef<HTMLDivElement>(null);

  // 面包屑动态折叠状态
  const [visibleItemCount, setVisibleItemCount] = useState<number>(0);
  const [needsCollapse, setNeedsCollapse] = useState(false);

  // 使用 ResizeObserver 监听面包屑容器宽度，动态计算是否需要折叠
  useEffect(() => {
    const container = breadcrumbContainerRef.current;
    if (!container) return;

    const calculateVisibleItems = () => {
      const containerWidth = container.clientWidth;
      const reservedWidth = isPersonalSpace ? 140 : 220;
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

      const minVisible = Math.min(1, breadcrumb.length);
      const finalCount = Math.max(minVisible, count);
      setVisibleItemCount(finalCount);
      setNeedsCollapse(finalCount < breadcrumb.length);
    };

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
  }, [breadcrumb, isPersonalSpace]);

  // 计算折叠后的面包屑项
  const collapsedBreadcrumb = useMemo(() => {
    const items = breadcrumb;
    const totalItems = items.length;

    if (!needsCollapse || totalItems <= 1) {
      return { visible: items, collapsed: [] as BreadcrumbItem[], needsCollapse: false };
    }

    const visibleCount = Math.max(2, visibleItemCount);
    if (visibleCount >= totalItems) {
      return { visible: items, collapsed: [] as BreadcrumbItem[], needsCollapse: false };
    }

    const firstItem = items[0];
    const lastItems = items.slice(-(visibleCount - 1));
    const collapsedItems = items.slice(1, -(visibleCount - 1));

    return {
      visible: [firstItem, ...lastItems],
      collapsed: collapsedItems,
      needsCollapse: true,
    };
  }, [breadcrumb, needsCollapse, visibleItemCount]);

  const sepHiddenOr = useCallback((idx: number, isLast: boolean) => {
    if (isLast) return null;
    if (isLibraryMode) {
      return <span className={styles.breadcrumbSeparator}>/</span>;
    }
    return <ChevronRight size={14} className={styles.breadcrumbSeparator} />;
  }, [isLibraryMode]);

  return (
    <div ref={breadcrumbContainerRef} className={styles.breadcrumb}>
      {/* 图书馆模式：简洁的返回按钮 */}
      {isLibraryMode && breadcrumb.length > 1 && (
        <button
          className={styles.breadcrumbBack}
          onClick={handleGoBack}
          title="返回上一级"
        >
          ←
        </button>
      )}

      {/* 非图书馆模式：返回按钮 + 项目列表 */}
      {!isLibraryMode &&
        (breadcrumb.length > 1 ||
          (!isPersonalSpace && breadcrumb.length > 0)) && (
          <>
            <button
              className={styles.breadcrumbItem}
              onClick={handleGoBack}
              title="返回上一级"
            >
              <ArrowLeft size={14} />
              <span>返回</span>
            </button>
            <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          </>
        )}

      {!isLibraryMode && !isPersonalSpace && (
        <>
          <button
            className={`${styles.breadcrumbItem} ${breadcrumb.length === 0 ? styles.active : ''}`}
            onClick={handleBackToProjects}
            disabled={breadcrumb.length === 0}
          >
            项目列表
          </button>
          {breadcrumb.length > 0 && (
            <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          )}
        </>
      )}

      {/* 智能折叠面包屑 */}
      {collapsedBreadcrumb.needsCollapse ? (
        <>
          {/* 第一项 */}
          {collapsedBreadcrumb.visible[0] && (
            <>
              <button
                data-breadcrumb-item
                className={styles.breadcrumbItem}
                onClick={() => handleBreadcrumbClick(0)}
              >
                {collapsedBreadcrumb.visible[0].name}
              </button>
              {sepHiddenOr(0, false)}
            </>
          )}

          {/* 折叠指示器 + 下拉菜单 */}
          <Menu open={isBreadcrumbExpanded} onOpenChange={setIsBreadcrumbExpanded}>
            <Menu.Trigger>
              <button
                data-breadcrumb-collapse-btn
                onClick={(e) => e.stopPropagation()}
                className={`${styles.breadcrumbItem} ${styles.breadcrumbCollapse}`}
                aria-expanded={isBreadcrumbExpanded}
                aria-haspopup="menu"
              >
                ...
              </button>
            </Menu.Trigger>

            <Menu.Content align="start" side="bottom" sideOffset={4}>
              {collapsedBreadcrumb.collapsed.map((item, idx) => {
                const originalIndex = idx + 1;
                return (
                  <Menu.Item
                    key={item.id}
                    onClick={() => handleBreadcrumbClick(originalIndex)}
                  >
                    {item.name}
                  </Menu.Item>
                );
              })}
            </Menu.Content>
          </Menu>
          {sepHiddenOr(0, false)}

          {/* 最后可见项 */}
          {collapsedBreadcrumb.visible
            .slice(1)
            .filter((item): item is BreadcrumbItem => !!item)
            .map((item, idx) => {
              const originalIndex =
                breadcrumb.length -
                collapsedBreadcrumb.visible.length +
                1 +
                idx;
              const isLast = idx === collapsedBreadcrumb.visible.length - 2;
              return (
                <React.Fragment key={item.id}>
                  <button
                    data-breadcrumb-item
                    className={`${styles.breadcrumbItem} ${isLast ? styles.active : ''}`}
                    onClick={() => handleBreadcrumbClick(originalIndex)}
                    disabled={isLast}
                  >
                    {item.name}
                  </button>
                  {sepHiddenOr(idx, isLast)}
                </React.Fragment>
              );
            })}
        </>
      ) : (
        /* 不需要折叠时，正常显示 */
        breadcrumb.map((item, index) => (
          <React.Fragment key={item.id}>
            {(isLibraryMode
              ? index > 0
              : (isPersonalSpace || index > 0) && index > 0) &&
              (isLibraryMode ? (
                <span className={styles.breadcrumbSeparator}>/</span>
              ) : (
                <ChevronRight
                  size={14}
                  className={styles.breadcrumbSeparator}
                />
              ))}
            <button
              data-breadcrumb-item
              className={`${styles.breadcrumbItem} ${index === breadcrumb.length - 1 ? styles.active : ''}`}
              onClick={() => handleBreadcrumbClick(index)}
              disabled={index === breadcrumb.length - 1}
            >
              {item.name}
            </button>
          </React.Fragment>
        ))
      )}
    </div>
  );
};
