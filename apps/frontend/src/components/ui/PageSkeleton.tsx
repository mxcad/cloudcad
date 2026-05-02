///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import React from 'react';

interface PageSkeletonProps {
  /** 骨架屏类型 */
  type?: 'default' | 'table' | 'form' | 'dashboard' | 'editor';
  /** 是否显示侧边栏骨架 */
  showSidebar?: boolean;
}

/**
 * 页面加载骨架屏组件
 * 用于 React.lazy 页面懒加载时的加载状态
 */
export const PageSkeleton: React.FC<PageSkeletonProps> = React.memo(
  ({ type = 'default', showSidebar = true }) => {
    const isDark = typeof window !== 'undefined' && localStorage.getItem('mx-user-dark') !== 'false';

    const bgColor = isDark ? 'bg-slate-700' : 'bg-slate-200';
    const containerBg = isDark ? 'bg-slate-800' : 'bg-slate-100';

    // 表格页面骨架
    if (type === 'table') {
      return (
        <div className={`min-h-screen ${containerBg} p-6`}>
          {/* 标题和操作栏 */}
          <div className="flex justify-between items-center mb-6">
            <div className={`h-8 w-48 rounded ${bgColor} animate-pulse`} />
            <div className="flex gap-2">
              <div className={`h-10 w-32 rounded ${bgColor} animate-pulse`} />
              <div className={`h-10 w-24 rounded ${bgColor} animate-pulse`} />
            </div>
          </div>
          {/* 筛选栏 */}
          <div className={`h-14 w-full rounded mb-4 ${bgColor} animate-pulse`} />
          {/* 表格 */}
          <div className="space-y-2">
            <div className={`h-12 w-full rounded ${bgColor} animate-pulse`} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`h-16 w-full rounded ${bgColor} animate-pulse`}
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
      );
    }

    // 表单页面骨架
    if (type === 'form') {
      return (
        <div className={`min-h-screen ${containerBg} flex items-center justify-center p-6`}>
          <div className="w-full max-w-md">
            <div className={`h-8 w-48 rounded ${bgColor} animate-pulse mb-8 mx-auto`} />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className={`h-4 w-24 rounded ${bgColor} animate-pulse mb-2`} />
                  <div className={`h-10 w-full rounded ${bgColor} animate-pulse`} />
                </div>
              ))}
              <div className={`h-12 w-full rounded ${bgColor} animate-pulse mt-6`} />
            </div>
          </div>
        </div>
      );
    }

    // 仪表盘页面骨架
    if (type === 'dashboard') {
      return (
        <div className={`min-h-screen ${containerBg} p-6`}>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`h-32 rounded-lg ${bgColor} animate-pulse`} />
            ))}
          </div>
          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`h-80 rounded-lg ${bgColor} animate-pulse`} />
            <div className={`h-80 rounded-lg ${bgColor} animate-pulse`} />
          </div>
        </div>
      );
    }

    // 编辑器页面骨架 - 与 CADEditorDirect loading 保持一致
    if (type === 'editor') {
      return (
        <div
          className="h-screen w-screen flex flex-col items-center justify-center"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <div
            className="animate-spin rounded-full h-8 w-8"
            style={{
              border: '2px solid var(--border-strong)',
              borderTopColor: 'var(--accent-600)',
            }}
          />
          <p
            className="mt-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            正在加载 CAD 编辑器...
          </p>
        </div>
      );
    }

    // 默认骨架
    return (
      <div className={`min-h-screen ${containerBg} p-6`}>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className={`h-8 w-64 rounded ${bgColor} animate-pulse mb-6`} />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`h-16 w-full rounded ${bgColor} animate-pulse`}
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }
);

PageSkeleton.displayName = 'PageSkeleton';

export default PageSkeleton;
