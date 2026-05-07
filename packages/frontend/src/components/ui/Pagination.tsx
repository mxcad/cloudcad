import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showSizeChanger?: boolean;
  pageSizeOptions?: number[];
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  onPageChange,
  onPageSizeChange,
  showSizeChanger = false,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}) => {
  const { page, totalPages, limit, total } = meta;

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(event.target.value);
    onPageSizeChange?.(newSize);
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const delta = 2;
    const range: (number | string)[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== '...') {
        range.push('...');
      }
    }
    return range;
  };

  if (total === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="text-sm text-[var(--text-secondary)]">
        共 {total} 项
      </div>

      <div className="flex items-center gap-2">
        {/* First page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-tertiary)]"
          aria-label="第一页"
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-tertiary)]"
          aria-label="上一页"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((item, idx) =>
            typeof item === 'number' ? (
              <button
                key={idx}
                onClick={() => onPageChange(item)}
                className={`min-w-[32px] h-8 px-2 rounded-lg text-sm transition-colors ${
                  item === page
                    ? 'bg-[var(--primary-500)] text-white'
                    : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={idx} className="px-1 text-[var(--text-tertiary)]">
                ...
              </span>
            )
          )}
        </div>

        {/* Next page */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-tertiary)]"
          aria-label="下一页"
        >
          <ChevronRight size={16} />
        </button>

        {/* Last page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-tertiary)]"
          aria-label="最后一页"
        >
          <ChevronsRight size={16} />
        </button>

        {/* Page size selector */}
        {showSizeChanger && onPageSizeChange && (
          <div className="ml-4 flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">每页</span>
            <select
              value={limit}
              onChange={handlePageSizeChange}
              className="h-8 px-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-sm text-[var(--text-secondary)]">条</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
