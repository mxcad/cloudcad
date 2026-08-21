///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { t } from '@/languages';
import type { RefObject } from 'react';

interface ScrollToTopButtonProps {
  /** 滚动容器（absolute 定位以容器为 containing block，需父层提供 relative） */
  containerRef: RefObject<HTMLElement | null>;
  /** 显示阈值（屏数）：滚动超过该屏数才显示，默认 2 */
  minScrollPages?: number;
}

/**
 * ScrollToTopButton - 列表页回顶浮动按钮
 *
 * 监听容器 scroll（被动监听 + 跨阈值才 setState），滚动超过
 * minScrollPages 屏后显示于容器右下角，点击平滑回顶。
 */
export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  containerRef,
  minScrollPages = 2,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = container.clientHeight * minScrollPages;
      const next = container.scrollTop > threshold;
      setVisible((prev) => (prev === next ? prev : next));
    };
    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, minScrollPages]);

  return (
    <button
      type="button"
      data-testid="scroll-to-top"
      aria-label={t('回到顶部')}
      title={t('回到顶部')}
      onClick={() =>
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
      className={`absolute bottom-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      // z-10：局部层叠上下文内的浮层按钮（滚动容器 relative 定位，不参与全局 Z_LAYERS）
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-secondary)',
      }}
    >
      <ArrowUp size={16} />
    </button>
  );
};

export default ScrollToTopButton;
