import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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

const PAGE_SLOT = 30; 
const ARROW_SLOT = 28;
const TOTAL_TEXT_SLOT = 65;
const JUMPER_SLOT = 110;
const SIZE_CHANGER_SLOT = 95;

function clampPageList(
  totalPages: number,
  currentPage: number,
  maxVisible: number,
): (number | '...')[] {
  if (totalPages <= 0) return [];
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const result: (number | '...')[] = [];

  const slots = maxVisible;
  const sideSlots = Math.max(1, Math.floor((slots - 2) / 2));

  let start = Math.max(2, currentPage - sideSlots + 1);
  let end = Math.min(totalPages - 1, currentPage + sideSlots - 1);

  const midCount = end - start + 1;
  if (midCount < slots - 2) {
    if (start === 2) {
      end = Math.min(totalPages - 1, start + (slots - 2) - 1);
    } else if (end === totalPages - 1) {
      start = Math.max(2, end - (slots - 2) + 1);
    }
  }

  // Clamp again after adjustments
  start = Math.max(2, start);
  end = Math.min(totalPages - 1, end);

  result.push(1);

  if (start > 2) {
    result.push('...');
  }

  for (let i = start; i <= end; i++) {
    result.push(i);
  }

  if (end < totalPages - 1) {
    result.push('...');
  }

  result.push(totalPages);

  return result;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxPages, setMaxPages] = useState(7);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const width = el.clientWidth;
      let fixed = 0;
      if (showFirstLast) fixed += ARROW_SLOT * 2; // first + last
      fixed += ARROW_SLOT * 2; // prev + next
      if (showTotal) fixed += TOTAL_TEXT_SLOT;
      if (showQuickJumper) fixed += JUMPER_SLOT;
      if (showSizeChanger) fixed += SIZE_CHANGER_SLOT;

      const remaining = width - fixed;
      const count = Math.max(3, Math.floor(remaining / PAGE_SLOT));
      setMaxPages(count);
    };

    const observer = new ResizeObserver(compute);
    observer.observe(el);
    compute();
    return () => observer.disconnect();
  }, [showFirstLast, showQuickJumper, showSizeChanger]);

  const showTotal = true;

  const pageList = useMemo(
    () => clampPageList(totalPages, page, maxPages),
    [totalPages, page, maxPages],
  );

  const handlePageSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(event.target.value);
    onPageSizeChange?.(newSize);
  }, [onPageSizeChange]);

  const handleJumpToPage = useCallback(() => {
    const pageNum = parseInt(inputValue, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages && pageNum !== page) {
      onPageChange(pageNum);
    }
    setInputValue('');
  }, [inputValue, totalPages, page, onPageChange]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleJumpToPage();
    }
  }, [handleJumpToPage]);

  if (!total) return null;

  if (simple) {
    return (
      <div className={`w-full flex items-center justify-between gap-2 ${className}`} style={{ height: 26 }}>
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
          共 {total} 项
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1 || loading} aria-label="上一页">
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs px-1 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
            {page} / {totalPages || 1}
          </span>
          <Button variant="ghost" size="xs" onClick={() => onPageChange(Math.min(totalPages || 1, page + 1))} disabled={page >= totalPages || loading} aria-label="下一页">
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`w-full flex items-center gap-1 ${className}`} style={{ height: 26 }}>
      <span className="text-xs whitespace-nowrap shrink-0" style={{ color: 'var(--text-secondary)' }}>
        共 {total} 项
      </span>

      <div className="flex-1 flex items-center justify-end gap-0.5 min-w-0">
        {showFirstLast && (
          <Button variant="ghost" size="xs" onClick={() => onPageChange(1)} disabled={page <= 1 || loading} aria-label="第一页" className="shrink-0">
            <ChevronsLeft size={14} />
          </Button>
        )}

        <Button variant="ghost" size="xs" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading} aria-label="上一页" className="shrink-0">
          <ChevronLeft size={14} />
        </Button>

        {pageList.map((item, idx) =>
          typeof item === 'number' ? (
            <Button
              key={`page-${item}`}
              variant={item === page ? 'primary' : 'ghost'}
              size="xs"
              onClick={() => onPageChange(item)}
              disabled={loading}
              className="shrink-0 min-w-[26px]"
            >
              {item}
            </Button>
          ) : (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex items-center justify-center shrink-0 min-w-[18px] text-xs select-none"
              style={{ color: 'var(--text-muted)', height: 26 }}
            >
              …
            </span>
          ),
        )}

        <Button variant="ghost" size="xs" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading} aria-label="下一页" className="shrink-0">
          <ChevronRight size={14} />
        </Button>

        {showFirstLast && (
          <Button variant="ghost" size="xs" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || loading} aria-label="最后一页" className="shrink-0">
            <ChevronsRight size={14} />
          </Button>
        )}

        {showQuickJumper && (
          <div className="flex items-center gap-1 ml-1 shrink-0">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>前往</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleJumpToPage}
              size="xs"
              className="w-[40px] text-center"
              wrapperClassName="w-auto flex-none"
            />
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>页</span>
          </div>
        )}

        {showSizeChanger && onPageSizeChange && (
          <div className="flex items-center gap-1 ml-1 shrink-0">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>每页</span>
            <select
              value={meta.limit}
              onChange={handlePageSizeChange}
              className="text-xs rounded-[var(--radius-md)] border cursor-pointer shrink-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', height: 26, paddingInline: 4 }}
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