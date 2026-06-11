import React, { useRef, useCallback, useLayoutEffect } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { useRubberBandSelection } from '@/hooks/common/useRubberBandSelection';
import type { FileSystemNode } from '@/types/filesystem';

export interface FileListGridRenderContext {
  isRubberBanding: boolean;
  rubberBandJustEndedRef: React.MutableRefObject<boolean>;
}

interface FileListGridProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  selectedNodes: Set<string>;
  loading?: boolean;
  loadingView?: React.ReactNode;
  emptyView?: React.ReactNode;
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
  onScrollPageChange?: (
    page: number,
    direction: 'prev' | 'next'
  ) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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
  paginationMeta,
  onNodeSelect: _onNodeSelect,
  onRubberBandSelect,
  onPageChange,
  onPageSizeChange,
  onScrollPageChange,
  onContextMenu,
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

  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const paginationMetaRef = useRef(paginationMeta);
  paginationMetaRef.current = paginationMeta;
  const onScrollPageChangeRef = useRef(onScrollPageChange);
  onScrollPageChangeRef.current = onScrollPageChange;
  const lastScrollTopRef = useRef(0);
  const scrollBlockedRef = useRef(false);

  useLayoutEffect(() => {
    scrollBlockedRef.current = true;
    const t = setTimeout(() => {
      scrollBlockedRef.current = false;
    }, 100);
    return () => clearTimeout(t);
  }, [nodes]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (rubberBandRef.current) return;
      if (loadingRef.current) return;
      if (scrollBlockedRef.current) return;

      const meta = paginationMetaRef.current;
      if (!meta) return;

      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;

      const scrollDirection =
        scrollTop > lastScrollTopRef.current ? 'down' : 'up';
      lastScrollTopRef.current = scrollTop;

      if (
        scrollDirection === 'down' &&
        scrollTop + clientHeight >= scrollHeight - 200
      ) {
        if (meta.page < meta.totalPages) {
          onScrollPageChangeRef.current?.(meta.page + 1, 'next');
        }
      } else if (scrollDirection === 'up' && scrollTop <= 200) {
        if (meta.page > 1) {
          onScrollPageChangeRef.current?.(meta.page - 1, 'prev');
        }
      }
    },
    []
  );

  const context: FileListGridRenderContext = {
    isRubberBanding: rubberBand !== null,
    rubberBandJustEndedRef,
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
        onScroll={onScrollPageChange ? handleScroll : undefined}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={onContextMenu}
      >
        <div className="relative">
          {loading && loadingView ? (
            loadingView
          ) : nodes.length === 0 ? (
            emptyView
          ) : (
            <div
              data-view-mode={viewMode}
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2'
                  : 'divide-y'
              }
              style={
                viewMode !== 'grid'
                  ? { borderColor: 'var(--border-subtle)' }
                  : {}
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
      </div>

      {paginationMeta && onPageChange && (
        <div
          className="flex-shrink-0 px-6 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <Pagination
            meta={paginationMeta}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            showSizeChanger={true}
          />
        </div>
      )}
    </div>
  );
};
