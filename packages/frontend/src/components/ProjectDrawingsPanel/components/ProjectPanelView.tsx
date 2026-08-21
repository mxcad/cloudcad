///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { ResourceList, ResourceItem } from '@/components/common';
import { CategoryTabs, CategoryLevel } from '@/components/CategoryTabs';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import styles from '@/components/sidebar/sidebar.module.css';
import type { ViewMode } from '@/components/common';

import type { BreadcrumbItem } from '../types';

interface ProjectPanelViewProps {
  isLibraryMode: boolean;
  canManageLibrary: boolean;
  categories: CategoryLevel[];
  selectedCategoryPath: string[];
  onCategorySelect: (level: number, categoryId: string) => Promise<void>;
  resourceItems: ResourceItem[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onItemClick: (item: ResourceItem) => void;
  doubleClickToOpen: boolean;
  emptyText: string;
  total: number;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number, direction: 'prev' | 'next' | 'jump') => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  renderItem: (item: ResourceItem, viewMode: ViewMode) => React.ReactNode;
  onRubberBandSelect?: (nodeIds: string[]) => void;
  breadcrumb: BreadcrumbItem[];
  isPersonalSpace: boolean;
  onBreadcrumbClick: (index: number) => void;
  onBreadcrumbBack: () => void;
  clipboardItems: string[];
  onPasteClick: () => void;
  onRefresh: () => void;
  /** 加载错误信息（非空且列表为空时显示错误空状态） */
  error: string | null;
  /** 错误空状态的重试回调 */
  onRetry: () => void;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条） */
  loadError?: string | null;
  /** 失败条重试回调 */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  /** 底部悬浮操作栏（透传给 ResourceList，滚动容器内 mt-auto sticky） */
  bottomBar?: React.ReactNode;
}

/**
 * ProjectDrawingsPanel 主视图
 *
 * 渲染分类标签 + ResourceList（搜索/分页/面包屑/toolbar），非库模式的
 * 面包屑导航与粘贴/刷新按钮。
 */
export const ProjectPanelView: React.FC<ProjectPanelViewProps> = ({
  isLibraryMode,
  canManageLibrary,
  categories,
  selectedCategoryPath,
  onCategorySelect,
  resourceItems,
  loading,
  searchQuery,
  onSearchChange,
  onItemClick,
  doubleClickToOpen,
  emptyText,
  total,
  totalPages,
  currentPage,
  onPageChange,
  pageSize,
  onPageSizeChange,
  renderItem,
  onRubberBandSelect,
  breadcrumb,
  isPersonalSpace,
  onBreadcrumbClick,
  onBreadcrumbBack,
  clipboardItems,
  onPasteClick,
  onRefresh,
  error,
  onRetry,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  bottomBar,
}) => {
  return (
    <>
      {/* 分类标签占位容器 */}
      {isLibraryMode && (
        <div className={styles.categoryPlaceholder}>
          <CategoryTabs
            categories={categories}
            selectedPath={selectedCategoryPath}
            onSelect={onCategorySelect}
          />
        </div>
      )}
      <ResourceList
        galleryMode={isLibraryMode}
        items={resourceItems}
        loading={loading}
        searchQuery={searchQuery}
        onRubberBandSelect={
          isLibraryMode && canManageLibrary ? onRubberBandSelect : undefined
        }
        onSearchChange={onSearchChange}
        onItemClick={onItemClick}
        doubleClickToOpen={doubleClickToOpen}
        emptyText={emptyText}
        defaultViewMode="grid"
        total={total}
        totalPages={totalPages}
        currentPage={currentPage}
        onPageChange={onPageChange}
        paginationEnabled={true}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        breadcrumb={
          !isLibraryMode ? (
            <div className={styles.breadcrumbPlaceholder}>
              {(breadcrumb.length > 0 || !isPersonalSpace) && (
                <BreadcrumbNavigation
                  variant="panel"
                  breadcrumbs={breadcrumb.map((b) => ({
                    ...b,
                    isRoot: false,
                    isFolder: true,
                  }))}
                  onNavigate={(crumb) => {
                    const idx = breadcrumb.findIndex((b) => b.id === crumb.id);
                    if (idx >= 0) onBreadcrumbClick(idx);
                  }}
                  onBack={onBreadcrumbBack}
                  onBackToProjects={undefined}
                />
              )}
            </div>
          ) : undefined
        }
        renderItem={renderItem}
        toolbarExtra={
          isLibraryMode ? (
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={onRefresh}
                loading={loading}
                tooltip={t('刷新')}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {clipboardItems.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onPasteClick}
                  tooltip={t('粘贴')}
                  className="text-primary border border-primary-dim mr-1"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="M12 11v6M9 14h6" />
                  </svg>
                </Button>
              )}
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={onRefresh}
                loading={loading}
                tooltip={t('刷新')}
              />
            </div>
          )
        }
        error={error}
        onRetry={onRetry}
        loadError={loadError}
        onRetryLoadMore={onRetryLoadMore}
        minLoadedPage={minLoadedPage}
        bottomBar={bottomBar}
      />
    </>
  );
};
