import type React from 'react';
import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z_LAYERS } from '@/constants/layers';
import { useIsMobile } from '@/hooks/useIsMobile';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export type TooltipTrigger = 'hover' | 'click' | 'focus' | 'longpress';

export interface TooltipProps {
  /** 提示文本内容 */
  content: React.ReactNode;
  /** 触发方式 */
  trigger?: TooltipTrigger;
  /** 显示位置 */
  position?: TooltipPosition;
  /** 延迟显示时间（毫秒） */
  delay?: number;
  /** 延迟隐藏时间（毫秒） */
  hideDelay?: number;
  /** 子元素 */
  children: React.ReactElement;
  /** 自定义类名 */
  className?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 提示框最大宽度 */
  maxWidth?: number | string;
  /** 箭头是否显示 */
  arrow?: boolean;
}

/**
 * Tooltip 组件 - CloudCAD
 *
 * 设计特色：
 * - 支持四种显示位置（上、下、左、右）
 * - 支持主题变量适配深色/亮色主题
 * - 支持延迟显示/隐藏，避免闪烁
 * - 支持多种触发方式（hover、click、focus）
 * - 智能边界检测，自动调整位置
 * - 流畅的动画效果
 * - 基于实际 DOM 尺寸的边界夹持，防止溢出屏幕
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  trigger = 'hover',
  position = 'top',
  delay = 200,
  hideDelay = 150,
  children,
  className = '',
  disabled = false,
  style,
  maxWidth = 320,
  arrow = true,
}) => {
  const isMobile = useIsMobile();
  const effectiveTrigger: TooltipTrigger = isMobile ? 'longpress' : trigger;

  const [isVisible, setIsVisible] = useState(false);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const [actualPosition, setActualPosition] = useState<TooltipPosition>(position);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清除定时器
  const clearTimeouts = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // 计算 Tooltip 位置（相对于视口），使用实际 DOM 尺寸并夹持在视口内
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 使用 tooltip 实际 DOM 尺寸，回退值设大一些（长文件名）
    const tooltipEl = tooltipRef.current;
    const actualWidth = tooltipEl ? tooltipEl.offsetWidth : 200;
    const actualHeight = tooltipEl ? tooltipEl.offsetHeight : 40;
    const offset = 8;
    const viewportPadding = 12;

    let newPosition = position;
    let top = 0;
    let left = 0;

    // 根据期望位置计算初始坐标，并进行方向翻转检测
    switch (position) {
      case 'top':
        left = triggerRect.left + triggerRect.width / 2 - actualWidth / 2;
        top = triggerRect.top - actualHeight - offset;
        if (triggerRect.top < actualHeight + offset + 10) {
          newPosition = 'bottom';
          top = triggerRect.bottom + offset;
        }
        break;
      case 'bottom':
        left = triggerRect.left + triggerRect.width / 2 - actualWidth / 2;
        top = triggerRect.bottom + offset;
        if (viewportHeight - triggerRect.bottom < actualHeight + offset + 10) {
          newPosition = 'top';
          top = triggerRect.top - actualHeight - offset;
        }
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - actualHeight / 2;
        left = triggerRect.left - actualWidth - offset;
        if (triggerRect.left < actualWidth + offset + 10) {
          newPosition = 'right';
          left = triggerRect.right + offset;
        }
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - actualHeight / 2;
        left = triggerRect.right + offset;
        if (viewportWidth - triggerRect.right < actualWidth + offset + 10) {
          newPosition = 'left';
          left = triggerRect.left - actualWidth - offset;
        }
        break;
    }

    // 水平边界夹持：防止 tooltip 超出屏幕左右边缘
    if (left < viewportPadding) {
      left = viewportPadding;
    } else if (left + actualWidth > viewportWidth - viewportPadding) {
      left = viewportWidth - actualWidth - viewportPadding;
    }

    // 垂直边界夹持：防止 tooltip 超出屏幕上下边缘
    if (top < viewportPadding) {
      top = viewportPadding;
    } else if (top + actualHeight > viewportHeight - viewportPadding) {
      top = viewportHeight - actualHeight - viewportPadding;
    }

    setActualPosition(newPosition);
    setTooltipPosition({ top, left });
  }, [position]);

  // 显示 Tooltip
  const showTooltip = useCallback(() => {
    if (disabled) return;
    clearTimeouts();
    calculatePosition();
    const effectiveDelay = isMobile ? 0 : delay;
    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, effectiveDelay);
  }, [disabled, delay, clearTimeouts, calculatePosition, isMobile]);

  // 隐藏 Tooltip
  const hideTooltip = useCallback(() => {
    clearTimeouts();
    const effectiveHideDelay = isMobile ? 0 : hideDelay;
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, effectiveHideDelay);
  }, [hideDelay, clearTimeouts, isMobile]);

  // 切换显示/隐藏（用于 click 触发）
  const toggleTooltip = useCallback(() => {
    if (disabled) return;
    if (isVisible) {
      hideTooltip();
    } else {
      calculatePosition();
      showTooltip();
    }
  }, [disabled, isVisible, showTooltip, hideTooltip, calculatePosition]);

  // 长按检测
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      showTooltip();
    }, 500);
  }, [showTooltip, clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleTouchMove = useCallback(() => {
    clearLongPress();
    if (isVisibleRef.current) {
      hideTooltip();
    }
  }, [clearLongPress, hideTooltip]);

  // Tooltip DOM 渲染后重新计算位置，确保使用实际元素尺寸
  // 解决首次显示时 tooltipRef.current 为 null 导致回退宽度 200px 的偏移问题
  useLayoutEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible, calculatePosition]);

  // 滚动时更新位置
  useEffect(() => {
    if (!isVisible) return;

    const handleScroll = () => {
      calculatePosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isVisible, calculatePosition]);

  // 点击外部关闭（处理弹框遮罩截获鼠标事件导致 onMouseLeave 无法触发的情况）
  useEffect(() => {
    if (!isVisible) return;

    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !tooltipRef.current?.contains(e.target as Node)
      ) {
        clearTimeouts();
        setIsVisible(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [isVisible, clearTimeouts]);

  // 清理定时器
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  // 获取 Tooltip 基础样式
  // 注意：calculatePosition() 已直接计算 left/top 为边缘像素位置并进行了视口边界夹持，
  // 因此这里不再使用 translateX/Y transform 居中，避免与边界夹持冲突。
  const getTooltipStyles = (): React.CSSProperties => {
    return {
      position: 'fixed',
      zIndex: Z_LAYERS.TOOLTIP,
      top: tooltipPosition.top,
      left: tooltipPosition.left,
      maxWidth,
      ...style,
    };
  };

  // 获取箭头样式
  const getArrowStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
    };

    switch (actualPosition) {
      case 'top':
        return {
          ...baseStyles,
          bottom: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: '6px 6px 0',
          borderColor: 'var(--bg-tooltip, rgba(30, 41, 59, 0.95)) transparent transparent transparent',
        };
      case 'bottom':
        return {
          ...baseStyles,
          top: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: '0 6px 6px',
          borderColor: 'transparent transparent var(--bg-tooltip, rgba(30, 41, 59, 0.95)) transparent',
        };
      case 'left':
        return {
          ...baseStyles,
          right: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: '6px 0 6px 6px',
          borderColor: 'transparent transparent transparent var(--bg-tooltip, rgba(30, 41, 59, 0.95))',
        };
      case 'right':
        return {
          ...baseStyles,
          left: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: '6px 6px 6px 0',
          borderColor: 'transparent var(--bg-tooltip, rgba(30, 41, 59, 0.95)) transparent transparent',
        };
      default:
        return baseStyles;
    }
  };

  // 事件处理器
  const getEventHandlers = () => {
    if (disabled) return {};

    switch (effectiveTrigger) {
      case 'hover':
        return {
          onMouseEnter: showTooltip,
          onMouseLeave: hideTooltip,
          onPointerDown: () => { clearTimeouts(); setIsVisible(false); },
        };
      case 'longpress':
        return {
          onTouchStart: handleTouchStart,
          onTouchEnd: handleTouchEnd,
          onTouchMove: handleTouchMove,
        };
      case 'click':
        return {
          onClick: toggleTooltip,
        };
      case 'focus':
        return {
          onFocus: showTooltip,
          onBlur: hideTooltip,
        };
      default:
        return {};
    }
  };

  // Tooltip 内容（通过 Portal 渲染到 body）
  const tooltipContent = isVisible && content && (
    <div
      ref={tooltipRef}
      className={`
        pointer-events-none
        px-3
        py-2
        rounded-lg
        text-sm
        font-medium
        shadow-lg
        backdrop-blur-sm
        whitespace-nowrap
        animate-fade-in
        ${className}
      `}
      style={{
        ...getTooltipStyles(),
        backgroundColor: 'var(--bg-tooltip, rgba(30, 41, 59, 0.95))',
        color: 'var(--text-tooltip, white)',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
      }}
      role="tooltip"
    >
      {content}
      {arrow && <div style={getArrowStyles()} />}
    </div>
  );

  return (
    <div
      ref={triggerRef}
      className="relative"
      style={{ flexShrink: 0 }}
      {...getEventHandlers()}
    >
      {children}
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </div>
  );
};

/**
 * 简化的 Tooltip 使用方式
 * 用于快速给元素添加提示
 */
export interface SimpleTooltipProps extends Omit<TooltipProps, 'children'> {
  /** 目标元素的类名 */
  wrapperClassName?: string;
  /** 目标元素的内容 */
  element: React.ReactNode;
}

export const SimpleTooltip: React.FC<SimpleTooltipProps> = ({
  element,
  wrapperClassName = '',
  ...tooltipProps
}) => {
  return (
    <Tooltip {...tooltipProps}>
      <span className={wrapperClassName}>{element}</span>
    </Tooltip>
  );
};

export default Tooltip;
