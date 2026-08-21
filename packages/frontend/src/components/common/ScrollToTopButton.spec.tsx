///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { ScrollToTopButton } from './ScrollToTopButton';

function Harness() {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div
        ref={containerRef}
        data-testid="container"
        style={{ height: 400, overflow: 'auto' }}
      >
        <div style={{ height: 2000 }} />
      </div>
      <ScrollToTopButton containerRef={containerRef} />
    </div>
  );
}

describe('ScrollToTopButton', () => {
  beforeEach(() => {
    // happy-dom 无布局：桩化滚动几何
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 400;
      },
    });
  });

  it('滚动未超过 2 屏：按钮隐藏（opacity-0 + pointer-events-none）', () => {
    const { container, getByTestId } = render(<Harness />);
    const scrollContainer = getByTestId('container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 500,
      configurable: true,
      writable: true,
    });
    fireEvent.scroll(scrollContainer);

    const btn = getByTestId('scroll-to-top');
    expect(btn.className).toContain('opacity-0');
    expect(btn.className).toContain('pointer-events-none');
  });

  it('滚动超过 2 屏（> clientHeight×2）：按钮显示', () => {
    const { getByTestId } = render(<Harness />);
    const scrollContainer = getByTestId('container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 1000,
      configurable: true,
      writable: true,
    });
    fireEvent.scroll(scrollContainer);

    const btn = getByTestId('scroll-to-top');
    expect(btn.className).toContain('opacity-100');
    expect(btn.className).not.toContain('pointer-events-none');
  });

  it('回滚到顶部后隐藏', () => {
    const { getByTestId } = render(<Harness />);
    const scrollContainer = getByTestId('container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 1000,
      configurable: true,
      writable: true,
    });
    fireEvent.scroll(scrollContainer);
    expect(getByTestId('scroll-to-top').className).toContain('opacity-100');

    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 0,
      configurable: true,
      writable: true,
    });
    fireEvent.scroll(scrollContainer);
    expect(getByTestId('scroll-to-top').className).toContain('opacity-0');
  });

  it('点击：容器平滑滚动回顶', () => {
    const { getByTestId } = render(<Harness />);
    const scrollContainer = getByTestId('container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      value: 1000,
      configurable: true,
      writable: true,
    });
    fireEvent.scroll(scrollContainer);

    const scrollTo = vi.fn();
    (scrollContainer as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
    fireEvent.click(getByTestId('scroll-to-top'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
