///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ListSkeleton } from './ListSkeleton';

describe('ListSkeleton', () => {
  it('grid 形态：默认渲染 6 张卡片骨架（缩略图块 + 文字条）', () => {
    const { container } = render(<ListSkeleton variant="grid" />);
    expect(
      container.querySelector('[data-testid="list-skeleton"]')
    ).not.toBeNull();
    expect(container.querySelectorAll('.aspect-square')).toHaveLength(6);
  });

  it('grid 形态：count 可自定义卡片数量', () => {
    const { container } = render(<ListSkeleton variant="grid" count={3} />);
    expect(container.querySelectorAll('.aspect-square')).toHaveLength(3);
  });

  it('list 形态：默认渲染 3 行骨架（图标块 + 文字条）', () => {
    const { container } = render(<ListSkeleton variant="list" />);
    expect(container.querySelectorAll('.py-3')).toHaveLength(3);
  });

  it('list 形态：count 可自定义行数', () => {
    const { container } = render(<ListSkeleton variant="list" count={5} />);
    expect(container.querySelectorAll('.py-3')).toHaveLength(5);
  });

  it('aria-hidden：对辅助技术隐藏（纯装饰占位）', () => {
    const { container } = render(<ListSkeleton variant="list" />);
    expect(
      container.querySelector('[data-testid="list-skeleton"]')
    ).toHaveAttribute('aria-hidden', 'true');
  });
});
