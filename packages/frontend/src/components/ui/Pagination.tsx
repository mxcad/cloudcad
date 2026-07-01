import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { t } from '@/languages';

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

const BTN_W = 24;
const ARROW_W = 28;
const GAP = 2;
const TOTAL_TEXT_W = 60;
const JUMPER_W = 100;
const SIZE_CHANGER_W = 40;

function buildPageList(
  totalPages: number,
  current: number,
  maxSlots: number,
): (number | '...')[] {
  if (totalPages <= 0) return [];
  if (totalPages <= maxSlots) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const result: (number | '...')[] = [];
  const half = Math.floor((maxSlots - 2) / 2);

  if (current <= half + 2) {
    result.push(...Array.from({ length: maxSlots - 2 }, (_, i) => i + 1));
    result.push('...');
    result.push(totalPages);
  } else if (current >= totalPages - half - 1) {
    result.push(1);
    result.push('...');
    for (let i = totalPages - (maxSlots - 3); i <= totalPages; i++) {
      result.push(i);
    }
  } else {
    result.push(1);
    result.push('...');
    for (let i = current - half + 1; i <= current + half - 1; i++) {
      if (i > 1 && i < totalPages) result.push(i);
    }
    result.push('...');
    result.push(totalPages);
  }

  return result;
}

type Layout = 'full' | 'medium' | 'compact';

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  onPageChange,
  onPageSizeChange,
  showSizeChanger = false,
  showQuickJumper = false,
  showFirstLast = true,
  simple = false,
  loading = false,
  pageSizeOptions = [30, 50, 100],
  className = '',
}) => {
  const { page, totalPages, total } = meta;
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>('full');
  const layoutRef = useRef(layout);
  const [maxPageSlots, setMaxPageSlots] = useState(7);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      let newLayout: Layout;
      if (w < 220) {
        newLayout = 'compact';
      } else if (w < 400) {
        newLayout = 'medium';
      } else {
        newLayout = 'full';
      }
      if (newLayout !== layoutRef.current) {
        layoutRef.current = newLayout;
        setLayout(newLayout);
      }

      let fixed = TOTAL_TEXT_W + GAP;
      fixed += (showFirstLast ? ARROW_W + GAP : 0) * 2;
      if (!showFirstLast) fixed += ARROW_W + GAP;
      if (showFirstLast) fixed += ARROW_W + GAP;
      if (newLayout === 'full' && showQuickJumper) fixed += JUMPER_W + GAP;
      if (newLayout !== 'compact' && showSizeChanger) fixed += SIZE_CHANGER_W + GAP;

      const remaining = w - fixed;
      const count = Math.max(3, Math.floor(remaining / (BTN_W + GAP)));
      setMaxPageSlots(count);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [showFirstLast, showQuickJumper, showSizeChanger]);

  const pageList = useMemo(
    () => buildPageList(totalPages, page, maxPageSlots),
    [totalPages, page, maxPageSlots],
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

  if (simple || layout === 'compact') {
    return (
      <div ref={containerRef} className={`w-full flex items-center justify-center ${className}`} style={{ height: 24 }}>
        <div className="flex items-center gap-0.5">
          {showFirstLast && (
            <Button variant="secondary" icon={ChevronsLeft} onClick={() => onPageChange(1)} disabled={page <= 1 || loading} aria-label={t("第一页")} tooltip={t("第一页")} />
          )}
          <Button variant="secondary" icon={ChevronLeft} onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading} aria-label={t("上一页")} tooltip={t("上一页")} />
          <Button variant="secondary" icon={ChevronRight} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading} aria-label={t("下一页")} tooltip={t("下一页")} />
          {showFirstLast && (
            <Button variant="secondary" icon={ChevronsRight} onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || loading} aria-label={t("最后一页")} tooltip={t("最后一页")} />
          )}
        </div>
      </div>
    );
  }

  const showJumper = showQuickJumper;
  const showSize = showSizeChanger;

  return (
    <div ref={containerRef} className={`w-full flex items-center ${className}`} style={{ height: 24 }}>
      <div className="flex-1 flex items-center justify-center gap-0.5 min-w-0">
        {showFirstLast && (
          <Button variant="secondary" icon={ChevronsLeft} onClick={() => onPageChange(1)} disabled={page <= 1 || loading} aria-label={t("第一页")} tooltip={t("第一页")} />
        )}

        <Button variant="secondary" icon={ChevronLeft} onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading} aria-label={t("上一页")} tooltip={t("上一页")} />

        {pageList.map((item, idx) =>
          typeof item === 'number' ? (
            <Button
              key={`page-${item}`}
              variant={item === page ? 'primary' : 'ghost'}
              size="xs"
              onClick={() => onPageChange(item)}
              disabled={loading}
              className={`shrink-0 !min-w-[24px] !px-1 ${item === page ? 'font-bold' : ''}`}
            >
              {item}
            </Button>
          ) : (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex items-center justify-center shrink-0 w-[18px] text-[11px] select-none"
              style={{ color: 'var(--text-muted)', height: 24 }}
            >
              …
            </span>
          ),
        )}

        <Button variant="secondary" icon={ChevronRight} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading} aria-label={t("下一页")} tooltip={t("下一页")} />

        {showFirstLast && (
          <Button variant="secondary" icon={ChevronsRight} onClick={() => onPageChange(totalPages)} disabled={page >= totalPages || loading} aria-label={t("最后一页")} tooltip={t("最后一页")} />
        )}

        {showJumper && (
          <div className="flex items-center gap-1 shrink-0 ml-0.5">
            <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{t("前往")}</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleJumpToPage}
              size="xs"
              className="!w-[32px] text-center !px-0"
              wrapperClassName="!w-auto flex-none"
            />
            <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{t("页")}</span>
          </div>
        )}

        {showSize && onPageSizeChange && (
          <div className="flex items-center shrink-0 ml-0.5">
            <select
              value={meta.limit}
              onChange={handlePageSizeChange}
              className="text-[11px] rounded-[3px] border cursor-pointer shrink-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', height: 22, paddingInline: 1, minWidth: 36, maxWidth: 36 }}
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;