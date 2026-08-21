///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';

interface ListSkeletonProps {
  /** grid=卡片骨架（与网格视图对齐）；list=行骨架（与列表视图对齐） */
  variant: 'grid' | 'list';
  /** 骨架数量（grid 默认 6 卡片、list 默认 3 行） */
  count?: number;
}

/**
 * ListSkeleton - 滚动加载下一页时的骨架占位
 *
 * 渲染于列表项容器（itemContainer）之外（滚动容器的底部加载区），
 * 保证 children↔items 一一对应不被破坏（useScrollPagination DOM 二分测页依赖）；
 * 占位期间视觉连续、滚动条高度更稳，数据到位后平滑替换。
 */
export const ListSkeleton: React.FC<ListSkeletonProps> = ({
  variant,
  count,
}) => {
  const items = Array.from(
    { length: count ?? (variant === 'grid' ? 6 : 3) },
    (_, i) => i
  );

  if (variant === 'grid') {
    return (
      <div
        data-testid="list-skeleton"
        aria-hidden="true"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2 animate-pulse"
      >
        {items.map((i) => (
          <div
            key={i}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div
              className="aspect-square w-full rounded-lg"
              style={{ background: 'var(--border-subtle)' }}
            />
            <div
              className="mt-3 h-2.5 w-3/4 rounded"
              style={{ background: 'var(--border-subtle)' }}
            />
            <div
              className="mt-2 h-2 w-1/2 rounded"
              style={{ background: 'var(--border-subtle)' }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="list-skeleton"
      aria-hidden="true"
      className="animate-pulse divide-y px-3"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {items.map((i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div
            className="h-8 w-8 shrink-0 rounded-lg"
            style={{ background: 'var(--border-subtle)' }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-2.5 w-1/3 rounded"
              style={{ background: 'var(--border-subtle)' }}
            />
            <div
              className="h-2 w-1/5 rounded"
              style={{ background: 'var(--border-subtle)' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListSkeleton;
