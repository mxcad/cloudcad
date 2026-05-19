import React, { useState, useMemo } from 'react';
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
  showQuickJumper?: boolean;
  showFirstLast?: boolean;
  simple?: boolean;
  loading?: boolean;
  pageSizeOptions?: number[];
  className?: string;
}

const btnBase = `
  inline-flex items-center justify-center
  min-w-[26px] h-[26px] px-1
  rounded-[var(--radius-md)]
  text-xs leading-none
  transition-colors duration-150
  cursor-pointer select-none
  disabled:opacity-40 disabled:cursor-not-allowed
  border-0 outline-none
`;

const btnGhost = `
  ${btnBase}
  bg-transparent
  text-[var(--text-tertiary)]
  hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]
`;

const btnActive = `
  ${btnBase}
  bg-[var(--primary-500)] text-white
  hover:bg-[var(--primary-600)]
  shadow-[var(--shadow-sm)]
`;

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  onPageChange,
  onPageSizeChange,
  showSizeChanger = false,
  showQuickJumper = false,
  showFirstLast = true,
  simple = false,
  loading = false,
  pageSizeOptions = [10, 20, 50, 100],
  className = '',
}) => {
  const { page, totalPages, total } = meta;
  const [inputValue, setInputValue] = useState('');

  const getPageNumbers = useMemo((): (number | string)[] => {
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
  }, [page, totalPages]);

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(event.target.value);
    onPageSizeChange?.(newSize);
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(inputValue, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages && pageNum !== page) {
      onPageChange(pageNum);
    }
    setInputValue('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJumpToPage();
    }
  };

  if (!total) {
    return null;
  }

  if (simple) {
    return (
      <div className={`flex items-center justify-between gap-2 ${className}`} style={{ height: 26 }}>
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
          共 {total} 项
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={btnGhost}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            aria-label="上一页"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs px-1 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
            {page} / {totalPages || 1}
          </span>
          <button
            type="button"
            className={btnGhost}
            onClick={() => onPageChange(Math.min(totalPages || 1, page + 1))}
            disabled={page >= totalPages || loading}
            aria-label="下一页"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`} style={{ height: 26 }}>
      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
        共 {total} 项
      </span>

      <div className="flex items-center gap-0.5">
        {showFirstLast && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => onPageChange(1)}
            disabled={page <= 1 || loading}
            aria-label="第一页"
          >
            <ChevronsLeft size={14} />
          </button>
        )}

        <button
          type="button"
          className={btnGhost}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex items-center gap-0.5">
          {getPageNumbers.map((item, idx) =>
            typeof item === 'number' ? (
              <button
                key={`page-${item}`}
                type="button"
                className={item === page ? btnActive : btnGhost}
                onClick={() => onPageChange(item)}
                disabled={loading}
              >
                {item}
              </button>
            ) : (
              <span
                key={`ellipsis-${idx}`}
                className="inline-flex items-center justify-center min-w-[18px] h-[26px] text-xs select-none"
                style={{ color: 'var(--text-muted)' }}
              >
                …
              </span>
            )
          )}
        </div>

        <button
          type="button"
          className={btnGhost}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          aria-label="下一页"
        >
          <ChevronRight size={14} />
        </button>

        {showFirstLast && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages || loading}
            aria-label="最后一页"
          >
            <ChevronsRight size={14} />
          </button>
        )}

        {showQuickJumper && (
          <div className="flex items-center gap-1 ml-1">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>前往</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleJumpToPage}
              className="w-[40px] h-[26px] text-center text-xs rounded-[var(--radius-md)] border"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>页</span>
          </div>
        )}

        {showSizeChanger && onPageSizeChange && (
          <div className="flex items-center gap-1 ml-1">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>每页</span>
            <select
              value={meta.limit}
              onChange={handlePageSizeChange}
              className="h-[26px] px-1 text-xs rounded-[var(--radius-md)] border cursor-pointer"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>条</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;