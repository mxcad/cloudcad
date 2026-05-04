import type React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export type TooltipTrigger = 'hover' | 'click' | 'focus';

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
  const [isVisible, setIsVisible] = useState(false);
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

  // 计算 Tooltip 位置（相对于视口）
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 预估 Tooltip 尺寸
    const estimatedWidth = 100;
    const estimatedHeight = 40;
    const offset = 8;

    let newPosition = position;
    let top = 0;
    let left = 0;

    // 根据位置计算坐标，并进行边界检测
    switch (position) {
      case 'top':
        top = triggerRect.top - estimatedHeight - offset;
        left = triggerRect.left + triggerRect.width / 2;
        // 边界检测：如果上方空间不够，切换到下方
        if (triggerRect.top < estimatedHeight + offset + 10) {
          newPosition = 'bottom';
          top = triggerRect.bottom + offset;
        }
        break;
      case 'bottom':
        top = triggerRect.bottom + offset;
        left = triggerRect.left + triggerRect.width / 2;
        // 边界检测：如果下方空间不够，切换到上方
        if (viewportHeight - triggerRect.bottom < estimatedHeight + offset + 10) {
          newPosition = 'top';
          top = triggerRect.top - estimatedHeight - offset;
        }
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2;
        left = triggerRect.left - estimatedWidth - offset;
        // 边界检测：如果左侧空间不够，切换到右侧
        if (triggerRect.left < estimatedWidth + offset + 10) {
          newPosition = 'right';
          left = triggerRect.right + offset;
        }
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2;
        left = triggerRect.right + offset;
        // 边界检测：如果右侧空间不够，切换到左侧
        if (viewportWidth - triggerRect.right < estimatedWidth + offset + 10) {
          newPosition = 'left';
          left = triggerRect.left - estimatedWidth - offset;
        }
        break;
    }

    setActualPosition(newPosition);
    setTooltipPosition({ top, left });
  }, [position]);

  // 显示 Tooltip
  const showTooltip = useCallback(() => {
    if (disabled) return;
    clearTimeouts();
    calculatePosition();
    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [disabled, delay, clearTimeouts, calculatePosition]);

  // 隐藏 Tooltip
  const hideTooltip = useCallback(() => {
    clearTimeouts();
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, hideDelay);
  }, [hideDelay, clearTimeouts]);

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

  // 清理定时器
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  // 获取 Tooltip 基础样式
  const getTooltipStyles = (): React.CSSProperties => {
    const transform = actualPosition === 'top' || actualPosition === 'bottom'
      ? 'translateX(-50%)'
      : 'translateY(-50%)';

    return {
      position: 'fixed',
      zIndex: 99999,
      top: tooltipPosition.top,
      left: tooltipPosition.left,
      transform,
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

    switch (trigger) {
      case 'hover':
        return {
          onMouseEnter: showTooltip,
          onMouseLeave: hideTooltip,
          onFocus: showTooltip,
          onBlur: hideTooltip,
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
      className="relative inline-flex"
      style={{ minWidth: 0 }}
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
