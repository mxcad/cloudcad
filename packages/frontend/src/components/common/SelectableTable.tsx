import React, { useCallback, useMemo, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/common/ListSkeleton';
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton';
import { useRubberBandSelection } from '@/hooks/common/useRubberBandSelection';
import { useScrollPagination } from '@/hooks/common/useScrollPagination';
import { t } from '@/languages';

export interface SelectableTableRenderContext {
  /** 框选进行中（行组件可借此禁拖拽等） */
  isRubberBanding: boolean;
  /** 框选刚结束标记（行 onClick 跳过误触发，消费后请勿自行复位） */
  rubberBandJustEndedRef: React.MutableRefObject<boolean>;
}

interface SelectableTableProps<T> {
  rows: T[];
  /**
   * 行唯一 id（同时用作 data-node-id 与选择 id）。
   * 缺省取 row.id；非 id 字段（如分享 token / 字体名）时传入自定义函数。
   */
  rowId?: (row: T) => string;
  /** 选中 id 集合（受控，状态由页面 useFileBrowserSelection 持有） */
  selectedIds: Set<string>;
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
  onToggleSelect: (id: string, ctrlKey?: boolean, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onRubberBandSelect?: (ids: string[]) => void;
  /** 按钮分页（页脚跳页；与滚动分页可并存，跳页经 jumpTo 定位） */
  onPageChange?: (page: number) => void;
  /** 显示"每页条数"选择框（需同时提供 onPageSizeChange） */
  showSizeChanger?: boolean;
  /** 每页条数变化回调（切换后应重置页码并重新加载） */
  onPageSizeChange?: (pageSize: number) => void;
  /** 每页条数可选值（默认 [30, 50, 100]） */
  pageSizeOptions?: number[];
  /** 页脚分页使用紧凑模式（simple） */
  paginationSimple?: boolean;
  /** 滚动分页（滚动加载；提供后启用 useScrollPagination 顶/底 loader 与最后一页提示） */
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条，不整页替换） */
  loadError?: string | null;
  /** 失败条重试回调（如 react-query refetch） */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（累计模型下由数据层维护；prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  /** 业务表头（首列全选 Checkbox 由容器插入） */
  renderHeader: () => React.ReactNode;
  /** 业务行单元格（首列行 Checkbox 由容器插入） */
  renderRow: (
    row: T,
    context: SelectableTableRenderContext
  ) => React.ReactNode;
  /** 选中行样式类（默认半透明主题色背景） */
  selectedRowClassName?: string;
  /** 行额外样式类（按行定制） */
  rowClassName?: (row: T) => string | undefined;
  /** 表格样式类（默认全宽） */
  tableClassName?: string;
}

/**
 * SelectableTable - 表格形态列表唯一入口（ADR-0052）
 *
 * 机制内置（机制出问题只需修这里，所有使用方受益）：
 * - 框选（useRubberBandSelection：data-node-id 行协议 + preventDefault 拖动防护）
 * - 滚动分页（useScrollPagination：顶/底 loader、「已经是最后一页」、页脚 visiblePage 同步）
 * - 表头全选 Checkbox 列 + 行 Checkbox 列（拦截冒泡）
 * - 行点击选中（ctrl/shift 区间 + 框选刚结束 click 防误触）
 * - 加载 / 空态 / 页脚分页
 *
 * 业务外置：renderHeader / renderRow（列布局自由），选择状态受控于页面。
 */
export function SelectableTable<T>({
  rows,
  rowId,
  selectedIds,
  loading = false,
  loadingView,
  emptyView,
  bottomBar,
  paginationMeta,
  onToggleSelect,
  onToggleSelectAll,
  onRubberBandSelect,
  onPageChange,
  showSizeChanger = false,
  onPageSizeChange,
  pageSizeOptions,
  paginationSimple = false,
  onScrollPageChange,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  renderHeader,
  renderRow,
  selectedRowClassName = 'bg-[var(--primary-50)]/50',
  rowClassName,
  tableClassName = 'w-full text-sm',
}: SelectableTableProps<T>) {
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

  // 列表项容器：tbody（children 即按页码顺序的 tr 行 DOM，用于测量视口所在页）。
  // 不能挂 <table>：其 children 恒为 [thead, tbody] 与行数不匹配，测量放弃、
  // 页脚页码回退成请求页（滚动加载时页码预跳，实例：用户管理页）。
  const itemContainerRef = useRef<HTMLTableSectionElement>(null);

  // 滚动分页统一控制器：边界触发（预加载）、页码指示、滚动位置恢复、自动填充
  const { visiblePage, jumpTo, showBottomLoader, showTopLoader, isLastPage } =
    useScrollPagination({
      containerRef: scrollContainerRef,
      itemContainerRef,
      itemsLength: rows.length,
      pageSize: paginationMeta?.limit ?? 20,
      currentPage: paginationMeta?.page ?? 1,
      // totalPages 初始 0：无分页信息时不显示「已经是最后一页」（防误报）
      totalPages: paginationMeta?.totalPages ?? 0,
      loading,
      enabled: !!onScrollPageChange,
      // 框选进行中禁止滚动翻页（避免框选期间数据突变）
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

  // 页脚展示视口所在页（visiblePage），而非最近请求页，保证与可视内容同步
  const paginationMetaMemo = useMemo(
    () => (paginationMeta ? { ...paginationMeta, page: visiblePage } : null),
    [paginationMeta, visiblePage]
  );

  // 行唯一 id：优先自定义函数（token/字体名等非 id 字段），缺省取 row.id
  const getRowId = rowId ?? ((row: T) => (row as { id: string }).id);

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(getRowId(row)));

  const renderContext: SelectableTableRenderContext = {
    isRubberBanding: rubberBand !== null,
    rubberBandJustEndedRef,
  };

  const thClassName =
    'px-4 py-3 font-medium text-left whitespace-nowrap';
  const tdClassName = 'px-4 py-3';
  const checkboxCellClassName = 'px-3 py-3 w-10 text-center align-middle';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollContainerRef}
        data-testid="selectable-table-scroll"
        // relative：框选 overlay 为 absolute 定位，以滚动容器为 containing block
        //（缺省时相对页面其他 positioned 祖先定位导致选区偏移，ADR-0052）
        className="relative flex-1 min-h-0 overflow-auto"
        style={{ userSelect: 'none', WebkitTouchCallout: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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

          {loading && rows.length === 0 ? (
            loadingView
          ) : rows.length === 0 ? (
            emptyView
          ) : (
            <table
              className={tableClassName}
              style={{ color: 'var(--text-primary)' }}
            >
              <thead
                // 滚动时表头钉在顶部；背景色不能省（否则内容透过），须配合
                // 使用方 border-collapse: separate（collapse 下 sticky 背景不绘制）
                className="sticky top-0 z-10"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className={checkboxCellClassName}>
                    <Checkbox
                      size="xs"
                      checked={allSelected}
                      onChange={onToggleSelectAll}
                    />
                  </th>
                  {renderHeader()}
                </tr>
              </thead>
              <tbody ref={itemContainerRef}>
                {rows.map((row) => {
                  const id = getRowId(row);
                  const isSelected = selectedIds.has(id);
                  return (
                    <tr
                      key={id}
                      data-node-id={id}
                      className={[
                        isSelected ? selectedRowClassName : '',
                        rowClassName?.(row) ?? '',
                      ].join(' ')}
                      style={{ borderBottom: '1px solid var(--border-default)' }}
                      onClick={(e) => {
                        // 框选刚结束时的 click 误触发会清掉框选结果，直接跳过
                        if (rubberBandJustEndedRef.current) {
                          rubberBandJustEndedRef.current = false;
                          return;
                        }
                        onToggleSelect(
                          id,
                          e.ctrlKey || e.metaKey,
                          e.shiftKey
                        );
                      }}
                    >
                      <td
                        className={checkboxCellClassName}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="xs"
                          checked={isSelected}
                          onChange={() => onToggleSelect(id, true)}
                        />
                      </td>
                      {renderRow(row, renderContext)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {rubberBandOverlay}

          {/* 底部指示：加载中骨架 / 翻页失败提示（仅已有内容时）/ 已经是最后一页（互斥） */}
          {showBottomLoader ? (
            <ListSkeleton variant="list" count={3} />
          ) : loadError && rows.length > 0 ? (
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
          data-testid="selectable-table-pagination"
          className="flex-shrink-0 px-4 py-3 flex justify-end"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <Pagination
            meta={paginationMetaMemo}
            onPageChange={handlePaginationJump}
            loading={loading}
            simple={paginationSimple}
            showSizeChanger={showSizeChanger}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={pageSizeOptions}
          />
        </div>
      )}
    </div>
  );
}
