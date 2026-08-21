import React, { useCallback, useMemo, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/common/ListSkeleton';
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton';
import { useRubberBandSelection } from '@/hooks/common/useRubberBandSelection';
import { useScrollPagination } from '@/hooks/common/useScrollPagination';
import { t } from '@/languages';
import type { FileSystemNode } from '@/types/filesystem';

export interface FileListGridRenderContext {
  isRubberBanding: boolean;
  rubberBandJustEndedRef: React.MutableRefObject<boolean>;
}

interface FileListGridItemsProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  loading: boolean;
  loadingView?: React.ReactNode;
  emptyView?: React.ReactNode;
  itemContainerRef: React.RefObject<HTMLDivElement | null>;
  renderItem: (
    node: FileSystemNode,
    index: number,
    context: FileListGridRenderContext
  ) => React.ReactNode;
  rubberBanding: boolean;
  rubberBandJustEndedRef: React.MutableRefObject<boolean>;
  rubberBandOverlay: React.ReactNode;
}

/**
 * 列表项区域（memo 隔离）：滚动分页指示器（visiblePage）变化只重渲页脚，
 * 避免累计多页后每次滚动跨页全量重渲大量 FileItem 造成卡顿。props 均为稳定引用
 * （nodes/viewMode/renderItem 由父层传入，rubberBanding 为布尔值），
 * 橡皮筋拖拽期间 rubberBanding=true 时正常重渲。
 */
const FileListGridItems = React.memo(function FileListGridItems({
  nodes,
  viewMode,
  loading,
  loadingView,
  emptyView,
  itemContainerRef,
  renderItem,
  rubberBanding,
  rubberBandJustEndedRef,
  rubberBandOverlay,
}: FileListGridItemsProps) {
  const context: FileListGridRenderContext = {
    isRubberBanding: rubberBanding,
    rubberBandJustEndedRef,
  };
  return (
    <div className="relative">
      {loading && loadingView ? (
        loadingView
      ) : nodes.length === 0 ? (
        emptyView
      ) : (
        <div
          ref={itemContainerRef}
          data-view-mode={viewMode}
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2'
              : 'divide-y'
          }
          style={
            viewMode !== 'grid' ? { borderColor: 'var(--border-subtle)' } : {}
          }
        >
          {nodes.map((node, index) => (
            <React.Fragment key={node.id}>
              {renderItem(node, index, context)}
            </React.Fragment>
          ))}
        </div>
      )}
      {rubberBandOverlay}
    </div>
  );
});

interface FileListGridProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  selectedNodes: Set<string>;
  loading?: boolean;
  loadingView?: React.ReactNode;
  emptyView?: React.ReactNode;
  /** 底部悬浮操作栏（滚动容器内 sticky 吸底；列表撑满一屏时即页面底部，不遮分页栏） */
  bottomBar?: React.ReactNode;
  paginationMeta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
  onNodeSelect: (nodeId: string, ctrlKey?: boolean) => void;
  onRubberBandSelect?: (nodeIds: string[]) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条，不整页替换） */
  loadError?: string | null;
  /** 失败条重试回调（如 react-query refetch） */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（累计模型下由数据层维护；prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  renderItem: (
    node: FileSystemNode,
    index: number,
    context: FileListGridRenderContext
  ) => React.ReactNode;
}

export const FileListGrid: React.FC<FileListGridProps> = ({
  nodes,
  viewMode,
  selectedNodes,
  loading = false,
  loadingView,
  emptyView,
  bottomBar,
  paginationMeta,
  onNodeSelect: _onNodeSelect,
  onRubberBandSelect,
  onPageChange,
  onPageSizeChange,
  onScrollPageChange,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  renderItem,
}) => {
  const {
    scrollContainerRef,
    rubberBand,
    rubberBandRef,
    rubberBandJustEndedRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    rubberBandOverlay,
  } = useRubberBandSelection({
    onRubberBandSelect,
  });

  const itemContainerRef = useRef<HTMLDivElement>(null);

  // 滚动分页统一控制器：边界触发（预加载）、页码指示、滚动位置恢复
  // （prepend 锚定 / jump 居中 / pageSize 回顶）、自动填充、加载指示派生
  const { visiblePage, jumpTo, showBottomLoader, showTopLoader, isLastPage } =
    useScrollPagination({
      containerRef: scrollContainerRef,
      itemContainerRef,
      itemsLength: nodes.length,
      pageSize: paginationMeta?.limit ?? 30,
      currentPage: paginationMeta?.page ?? 1,
      // totalPages 初始 0：无分页信息时不显示「已经是最后一页」（防误报）
      totalPages: paginationMeta?.totalPages ?? 0,
      loading,
      enabled: !!onScrollPageChange,
      shouldSkip: () => rubberBandRef.current !== null,
      loadError,
      minLoadedPage,
      onPageChange: (page, direction) => onScrollPageChange?.(page, direction),
    });

  // 页脚页码/上一页/下一页按钮：通知控制器（数据到位后居中定位）并透传翻页
  const handlePaginationJump = useCallback(
    (page: number) => {
      jumpTo(page);
      onPageChange?.(page);
    },
    [jumpTo, onPageChange]
  );

  // 用 useMemo 稳定 Pagination 的 meta 对象，避免每次渲染创建新引用
  const paginationMetaMemo = useMemo(
    () => (paginationMeta ? { ...paginationMeta, page: visiblePage } : null),
    [paginationMeta, visiblePage]
  );

  return (
    <div className="flex flex-col h-full">
      {/* relative：ScrollToTopButton / 框选 overlay 以滚动容器为 containing block */}
      <div
        ref={scrollContainerRef}
        className="relative flex-1 min-h-0 overflow-y-auto"
        style={{
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
      >
        {/* 内容包装：有操作栏时 min-h-full 撑满滚动容器（内容不足一屏时 mt-auto 把操作栏
            推到底部=页面底部；内容超出时操作栏随内容滚动并在视口底部吸底）。
            无操作栏时不撑满（保持原生滚动分页测量） */}
        <div className={bottomBar ? 'min-h-full flex flex-col' : undefined}>
          {/* 顶部加载指示（向上滚动加载进行中） */}
          {showTopLoader && (
            <div
              data-testid="top-loader"
              className="flex items-center justify-center gap-2 py-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <Loader2 size={14} className="animate-spin" />
              <span>{t('加载中...')}</span>
            </div>
          )}
          <FileListGridItems
            nodes={nodes}
            viewMode={viewMode}
            loading={loading}
            loadingView={loadingView}
            emptyView={emptyView}
            itemContainerRef={itemContainerRef}
            renderItem={renderItem}
            rubberBanding={rubberBand !== null}
            rubberBandJustEndedRef={rubberBandJustEndedRef}
            rubberBandOverlay={rubberBandOverlay}
          />
          {/* 底部指示：加载中骨架 / 翻页失败提示（仅已有内容时）/ 已经是最后一页（互斥） */}
          {showBottomLoader ? (
            <ListSkeleton
              variant={viewMode === 'grid' ? 'grid' : 'list'}
              count={viewMode === 'grid' ? 6 : 3}
            />
          ) : loadError && nodes.length > 0 ? (
            <div
              data-testid="load-more-error"
              className="flex items-center justify-center gap-2 py-3 text-xs"
              style={{ color: 'var(--error)' }}
            >
              <AlertTriangle size={14} className="shrink-0" />
              <span className="max-w-[60%] truncate" title={loadError}>
                {loadError}
              </span>
              {onRetryLoadMore && (
                <Button variant="outline" size="xs" onClick={onRetryLoadMore}>
                  {t('重试')}
                </Button>
              )}
            </div>
          ) : isLastPage ? (
            <div
              data-testid="last-page"
              className="flex items-center justify-center gap-2 py-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{t('已经是最后一页')}</span>
            </div>
          ) : null}
          {/* 底部悬浮操作栏：mt-auto 内容不足一屏时贴滚动容器底部（=页面底部），
              内容超出时 sticky 吸底；始终位于内容末尾下方，不遮挡内容；分页栏在滚动容器外 */}
          {bottomBar && (
            <div className="mt-auto sticky bottom-0 z-10 flex justify-center pt-1 pb-3 pointer-events-none">
              <div className="pointer-events-auto">{bottomBar}</div>
            </div>
          )}
        </div>
        <ScrollToTopButton containerRef={scrollContainerRef} />
      </div>

      {paginationMetaMemo && onPageChange && (
        <div
          className="flex-shrink-0 px-6 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <Pagination
            // 指示器展示视口所在页（visiblePage），而非最近请求页，保证与可视内容同步
            meta={paginationMetaMemo}
            onPageChange={handlePaginationJump}
            onPageSizeChange={onPageSizeChange}
            showSizeChanger={true}
          />
        </div>
      )}
    </div>
  );
};
