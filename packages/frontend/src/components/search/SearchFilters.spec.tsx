import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React, { useState } from 'react';
import {
  SearchFilters,
  type SearchFilterValues,
} from './SearchFilters';

vi.mock('@/languages', () => ({
  t: (m: string) => m,
  $t: (m: string) => m,
}));

vi.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/components/ui/Select', () => ({
  Select: () => null,
}));

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/FileSize', () => ({
  formatFileSize: (n: number) => String(n),
  toBytes: () => 0,
  FileSizeInput: () => null,
}));

/**
 * 回归：文件格式多选与搜索框 ext: 语法 token 的双向同步。
 * 前端把 "ext:.dwg ext:.mxweb" 放进 keyword 交给后端解析（后端累积为多值），
 * 但 SearchFilters 内部 query→filters 同步若只在 token 非空时更新，
 * 删光 token 后列表仍按旧格式过滤（挂载级状态不同步）。
 */
describe('SearchFilters ext sync', () => {
  const Harness = ({
    q,
    onChange,
  }: {
    q: string;
    onChange: (f: SearchFilterValues) => void;
  }) => {
    const [filters, setFilters] = useState<SearchFilterValues>({});
    return (
      <SearchFilters
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          onChange(f);
        }}
        searchQuery={q}
        onSearchQueryChange={() => {}}
      />
    );
  };

  it('syncs multiple ext: tokens from query into extensions filter', () => {
    const onFiltersChange = vi.fn();
    const { rerender } = render(
      <Harness q="ext:.dwg ext:.mxweb" onChange={onFiltersChange} />
    );

    rerender(<Harness q="ext:.dwg ext:.mxweb" onChange={onFiltersChange} />);
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ extensions: ['.dwg', '.mxweb'] })
    );
  });

  it('clears extensions filter when all ext: tokens are removed from query', () => {
    const onFiltersChange = vi.fn();
    const { rerender } = render(
      <Harness q="ext:.dwg" onChange={onFiltersChange} />
    );
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ extensions: ['.dwg'] })
    );

    rerender(<Harness q="hello" onChange={onFiltersChange} />);
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ extensions: undefined })
    );
  });

  it('keeps other filters when ext: tokens change', () => {
    const onFiltersChange = vi.fn();
    const { rerender } = render(<Harness q="" onChange={onFiltersChange} />);

    rerender(<Harness q="ext:.mxweb" onChange={onFiltersChange} />);
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ extensions: ['.mxweb'] })
    );
  });
});
