///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ResourceList - 通用资源列表组件
 *
 * 统一的列表/网格视图，支持搜索、级联分类筛选、视图切换
 * 用于：我的项目、我的图纸、图纸库、图块库
 *
 * 目录结构（ADR-0033 拆分）：
 * - CascadeCategorySelector.tsx 级联分类选择器
 * - useResourceListScroll.ts 滚动/分页/加载超时逻辑
 */

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { SearchInput } from '@/components/search/SearchInput';
import { FileImage, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { Pagination } from '@/components/ui/Pagination';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton';
import { useRubberBandSelection } from '@/hooks/common/useRubberBandSelection';
import { t } from '@/languages';
import { CascadeCategorySelector } from './CascadeCategorySelector';
import { useResourceListScroll } from './useResourceListScroll';
import type { ResourceListProps } from './ResourceListTypes';

export type { CategoryOption } from './CascadeCategorySelector';
export type { ResourceItem, ViewMode } from './ResourceListTypes';

const PaginationMemo = React.memo(Pagination);
import styles from './ResourceList.module.css';

/** 资源列表组件 */
export const ResourceList: React.FC<ResourceListProps> = ({
  title,
  items,
  loading,
  searchQuery,
  onSearchChange,
  onItemClick,
  doubleClickToOpen = false,
  categories,
  selectedCategory,
  onCategoryChange,
  subCategories,
  selectedSubCategory,
  onSubCategoryChange,
  thirdCategories,
  selectedThirdCategory,
  onThirdCategoryChange,
  emptyText = t('暂无数据'),
  showViewToggle = true,
  defaultViewMode = 'list',
  showCategoryFilter = false,
  actions,
  toolbarExtra,
  breadcrumb,
  renderItem,
  total,
  totalPages,
  currentPage = 1,
  onPageChange,
  paginationEnabled = false,
  galleryMode = false,
  pageSize = 30,
  onPageSizeChange,
  onRubberBandSelect,
  error,
  onRetry,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  bottomBar,
}) => {
  // 使用统一的 fileSystemStore 管理视图模式
  const viewMode = useFileSystemStore((state) => state.viewMode);
  const setViewMode = useFileSystemStore((state) => state.setViewMode);

  // 初始化视图模式（使用 defaultViewMode）
  useEffect(() => {
    // 检查 localStorage 中是否有保存的视图模式
    const savedMode = localStorage.getItem('fileSystemStore');
    if (!savedMode) {
      // 如果没有保存，使用默认模式
      setViewMode(defaultViewMode);
    }
  }, [defaultViewMode, setViewMode]);

  // 滚动/分页/加载超时逻辑（统一控制器：预加载/位置恢复/自动填充/加载指示）
  const itemContainerRef = useRef<HTMLDivElement>(null);
  const {
    contentRef,
    loadingTimedOut,
    visiblePage,
    jumpTo,
    showBottomLoader,
    showTopLoader,
    isLastPage,
  } = useResourceListScroll({
    loading: loading ?? false,
    itemsLength: items.length,
    paginationEnabled,
    totalPages,
    currentPage,
    pageSize: pageSize ?? 30,
    loadError,
    minLoadedPage,
    onPageChange,
    itemContainerRef,
  });

  // Rubber band selection
  const {
    scrollContainerRef: rubberBandContainerRef,
    rubberBand,
    rubberBandJustEndedRef,
    isRubberBanding,
    handleMouseDown: rubberBandMouseDown,
    handleMouseMove: rubberBandMouseMove,
    handleMouseUp: rubberBandMouseUp,
    handleMouseLeave: rubberBandMouseLeave,
    rubberBandOverlay,
  } = useRubberBandSelection({
    onRubberBandSelect: onRubberBandSelect ?? undefined,
  });

  // Merge contentRef and rubberBandContainerRef
  const setContentRef = useCallback(
    (el: HTMLDivElement | null) => {
      (contentRef as React.MutableRefObject<HTMLDivElement | null>).current =
        el;
      if (onRubberBandSelect) {
        (
          rubberBandContainerRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = el;
      }
    },
    [onRubberBandSelect, rubberBandContainerRef, contentRef]
  );

  // 是否显示分类筛选
  const hasCategories =
    showCategoryFilter && categories && categories.length > 0;

  // 用 useMemo 稳定 Pagination 的 meta 对象，避免每次渲染创建新引用
  // page 用视口所在页（visiblePage）而非请求页，保证指示器与可视内容同步
  // totalPages || 1：Pagination 仅在下方 totalPages > 1 门控时渲染（未同步的 0 不显示），
  // || 1 仅为 Pagination 内部 buildPageList 的安全兜底；isLastPage 的防误报由 useScrollPagination 的 totalPages 0 处理
  const paginationMetaMemo = useMemo(
    () => ({
      total: total ?? 0,
      page: visiblePage,
      limit: pageSize ?? 30,
      totalPages: totalPages || 1,
    }),
    [total, visiblePage, totalPages, pageSize]
  );

  // 用 ref + useCallback 稳定 Pagination 的 onPageChange 回调
  const onPageJumpRef = useRef(onPageChange);
  onPageJumpRef.current = onPageChange;
  const handlePaginationJump = useCallback(
    (page: number) => {
      // 通知统一控制器（数据到位后滚动条居中定位）并透传翻页
      jumpTo(page);
      onPageJumpRef.current?.(page, 'jump');
    },
    [jumpTo]
  );

  return (
    <div className={styles.resourceList}>
      {/* 标题栏 */}
      {title && <div className={styles.header}>{title}</div>}

      {/* 面包屑（在搜索框上方） */}
      {breadcrumb && (
        <div className={styles.breadcrumbWrapper}>{breadcrumb}</div>
      )}

      {/* 工具栏：搜索 + 视图切换 */}
      <div className={styles.toolbar}>
        <SearchInput
          placeholder={t('搜索...')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className={styles.toolbarActions}>
          {/* 总数显示 */}
          {total !== undefined && total > 0 && (
            <div className={styles.totalCount}>
              {t('共')} <span className={styles.totalCountNumber}>{total}</span>{' '}
              {t('项')}
            </div>
          )}
          {/* 工具栏额外内容（如刷新按钮） */}
          {toolbarExtra}
          {showViewToggle && (
            <ViewToggle viewMode={viewMode} onChange={setViewMode} />
          )}
        </div>
      </div>

      {/* 级联分类筛选 */}
      {hasCategories && onCategoryChange && (
        <div className={styles.categoryFilter}>
          <CascadeCategorySelector
            categories={categories}
            selectedCategory={selectedCategory ?? null}
            selectedSubCategory={selectedSubCategory ?? null}
            selectedThirdCategory={selectedThirdCategory ?? null}
            onCategoryChange={onCategoryChange}
            onSubCategoryChange={onSubCategoryChange || (() => {})}
            onThirdCategoryChange={onThirdCategoryChange || (() => {})}
          />
        </div>
      )}

      {/* 内容区域 */}
      <div
        className={styles.content}
        ref={setContentRef}
        {...(onRubberBandSelect
          ? {
              onMouseDown: rubberBandMouseDown,
              onMouseMove: rubberBandMouseMove,
              onMouseUp: rubberBandMouseUp,
              onMouseLeave: rubberBandMouseLeave,
            }
          : {})}
        // relative：ScrollToTopButton 以滚动容器为 containing block
        style={{
          position: 'relative',
          ...(onRubberBandSelect
            ? { userSelect: 'none', WebkitTouchCallout: 'none' }
            : {}),
        }}
      >
        {/* 内容包装：有操作栏时 min-h-full flex-col 撑满滚动容器（mt-auto 才能把操作栏
            推到底部=分页栏上方；内容不足一屏时贴底，内容超出时 sticky 吸底） */}
        <div className={bottomBar ? 'min-h-full flex flex-col' : undefined}>
          <div
            style={onRubberBandSelect ? { position: 'relative' } : undefined}
          >
            {loading &&
            !loadingTimedOut &&
            items.length === 0 ? null : items.length === 0 && error ? (
              <div className={styles.emptyState}>
                <AlertCircle size={48} className={styles.emptyIcon} />
                <div className={styles.emptyText}>{error}</div>
                {onRetry && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={onRetry}
                  >
                    {t('重试')}
                  </Button>
                )}
              </div>
            ) : items.length === 0 ? (
              <div className={styles.emptyState}>
                <FileImage size={48} className={styles.emptyIcon} />
                <div className={styles.emptyText}>{emptyText}</div>
              </div>
            ) : (
              <>
                {/* 顶部加载指示（向上滚动加载进行中） */}
                {showTopLoader && (
                  <div className={styles.loadingMore}>
                    <Loader2 size={20} className={styles.loadingMoreIcon} />
                    <span>{t('加载中...')}</span>
                  </div>
                )}
                {/* 使用自定义渲染（必须提供 renderItem） */}
                <div
                  ref={itemContainerRef}
                  className={
                    viewMode === 'list'
                      ? galleryMode
                        ? styles.listViewGallery
                        : styles.listView
                      : galleryMode
                        ? styles.gridViewGallery
                        : styles.gridView
                  }
                >
                  {items.map((item) => (
                    <React.Fragment
                      key={
                        item.keyPrefix
                          ? `${item.keyPrefix}-${item.id}`
                          : item.id
                      }
                    >
                      {renderItem(item, viewMode)}
                    </React.Fragment>
                  ))}
                </div>
              </>
            )}
            {onRubberBandSelect && rubberBandOverlay}
          </div>

          {/* 加载更多触发元素（底部指示：加载中提示 / 翻页失败提示 / 已经是最后一页） */}
          {items.length > 0 && paginationEnabled && (
            <div className={styles.loadMoreTrigger}>
              {showBottomLoader ? (
                <div className={styles.loadingMore}>
                  <Loader2 size={20} className={styles.loadingMoreIcon} />
                  <span>{t('加载中...')}</span>
                </div>
              ) : loadError ? (
                <div
                  data-testid="load-more-error"
                  className={styles.loadingMore}
                  style={{ color: 'var(--error)' }}
                >
                  <AlertTriangle size={20} className="shrink-0" />
                  <span className="max-w-[60%] truncate" title={loadError}>
                    {loadError}
                  </span>
                  {onRetryLoadMore && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={onRetryLoadMore}
                    >
                      {t('重试')}
                    </Button>
                  )}
                </div>
              ) : (
                !loading &&
                isLastPage && (
                  <div className={styles.noMore}>{t('已经是最后一页')}</div>
                )
              )}
            </div>
          )}
          {/* 底部悬浮操作栏：mt-auto 内容不足一屏时贴滚动容器底部（=分页栏上方），
            内容超出时 sticky 吸底；分页栏（footer）在滚动容器外，不受影响。
            @container：BatchActionBar 按容器宽度（非视口）切换 icon-only/文字模式（侧边栏窄容器适配） */}
          {bottomBar && (
            <div className="@container mt-auto sticky bottom-0 z-10 flex justify-center pt-1 pb-3 pointer-events-none">
              <div className="pointer-events-auto">{bottomBar}</div>
            </div>
          )}
        </div>
        <ScrollToTopButton containerRef={contentRef} />
      </div>

      {/* 底部分页操作栏 */}
      <div
        className={`${styles.footer} ${items.length === 0 ? styles.footerHidden : ''}`}
      >
        {/* 分页控件（启用分页模式时显示） */}
        {paginationEnabled && totalPages && totalPages > 1 && onPageChange && (
          <PaginationMemo
            meta={paginationMetaMemo}
            onPageChange={handlePaginationJump}
            showQuickJumper
            showSizeChanger
            onPageSizeChange={onPageSizeChange}
            loading={loading}
          />
        )}
        {/* 额外的操作按钮 */}
        {actions}
      </div>
    </div>
  );
};

export default ResourceList;
