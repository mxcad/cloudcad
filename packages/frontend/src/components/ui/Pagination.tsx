import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { ChevronsLeft } from 'lucide-react';
import { ChevronsRight } from 'lucide-react';
import { Button } from './Button';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
  showSizeChanger?: boolean;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  onPageChange,
  className = '',
  showSizeChanger = false,
  pageSizeOptions = [20, 50, 100],
  onPageSizeChange,
}) => {
  const { total, page, limit, totalPages } = meta;

  // 始终显示分页（即使只有一页）
  // 如果只有一页且不需要显示每页数量选择器，返回空
  if (totalPages <= 1 && !showSizeChanger && total === 0) {
    return null;
  }

  // 计算显示的页码范围
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // 如果总页数少于最大显示页数，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 否则，显示部分页码
      if (page <= 3) {
        // 当前页在前面
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (page >= totalPages - 2) {
        // 当前页在后面
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // 当前页在中间
        pages.push(1);
        pages.push('...');
        for (let i = page - 1; i <= page + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      {/* 左侧：显示信息 */}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span>
          共 <span className="font-semibold text-slate-900">{total}</span> 项
        </span>
        <span className="text-slate-400">|</span>
        <span>
          第 <span className="font-semibold text-slate-900">{page}</span> /{' '}
          {totalPages} 页
        </span>
      </div>

      {/* 中间：页码按钮 */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          title="首页"
        >
          <ChevronsLeft size={14} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          title="上一页"
        >
          <ChevronLeft size={14} />
        </Button>

        {pageNumbers.map((pageNum, index) => (
          <React.Fragment key={index}>
            {pageNum === '...' ? (
              <span className="px-3 py-2 text-sm text-slate-400">...</span>
            ) : (
              <Button
                variant={pageNum === page ? 'primary' : 'outline'}
                size="sm"
                onClick={() => onPageChange(pageNum as number)}
                className={pageNum === page ? '' : 'text-slate-700'}
              >
                {pageNum}
              </Button>
            )}
          </React.Fragment>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          title="下一页"
        >
          <ChevronRight size={14} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          title="末页"
        >
          <ChevronsRight size={14} />
        </Button>
      </div>

      {/* 右侧：每页显示数量选择器 */}
      {showSizeChanger && onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>每页显示</span>
          <select
            value={limit}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>项</span>
        </div>
      )}
    </div>
  );
};
