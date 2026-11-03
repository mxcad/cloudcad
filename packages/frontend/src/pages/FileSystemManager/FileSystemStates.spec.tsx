import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileSystemStates } from './FileSystemStates';

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

// useDelayedLoading 依赖 delay；直接 mock 为透传 loading
vi.mock('@/hooks/common/useDelayedLoading', () => ({
  useDelayedLoading: (loading: boolean) => loading,
}));

function renderStates(overrides: Record<string, unknown> = {}) {
  const props = {
    loading: false,
    error: null,
    isEmpty: true,
    isAtRoot: false,
    isTrashView: false,
    searchTerm: '',
    canCreateProject: true,
    projectFilter: 'all' as never,
    onRefresh: vi.fn(),
    onCreateProject: vi.fn(),
    ...overrides,
  };
  return render(<FileSystemStates {...(props as never)} />);
}

describe('FileSystemStates — 搜索无结果空态文案（BUG-FS-03）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('项目内搜索无结果：主标题显示「未找到匹配的内容」而非「项目中暂无文件」', () => {
    renderStates({
      searchTerm: 'zzz不存在xyz',
      isEmptyProject: true,
    });
    expect(screen.getByText('未找到匹配的内容')).toBeTruthy();
    expect(screen.queryByText('项目中暂无文件')).toBeNull();
  });

  it('项目内搜索无结果：副标题仍为「没有找到匹配的内容」', () => {
    renderStates({
      searchTerm: 'zzz不存在xyz',
      isEmptyProject: true,
    });
    expect(screen.getByText('没有找到匹配的内容')).toBeTruthy();
  });

  it('非搜索的项目为空：主标题仍显示「项目中暂无文件」', () => {
    renderStates({ searchTerm: '', isEmptyProject: true });
    expect(screen.getByText('项目中暂无文件')).toBeTruthy();
    expect(screen.queryByText('未找到匹配的内容')).toBeNull();
  });

  it('普通文件夹搜索无结果：主标题「未找到匹配的内容」，非「这个文件夹是空的」', () => {
    renderStates({ searchTerm: 'abc', isEmptyProject: false });
    expect(screen.getByText('未找到匹配的内容')).toBeTruthy();
    expect(screen.queryByText('这个文件夹是空的')).toBeNull();
  });
});
