import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Tooltip } from './Tooltip';

export type TruncateMode = 'start' | 'middle' | 'end' | 'clip';

export interface TruncateTextProps {
  children: string;
  mode?: TruncateMode;
  maxChars?: number;
  maxWidth?: string | number;
  smMaxWidth?: string | number;
  mdMaxWidth?: string | number;
  lgMaxWidth?: string | number;
  xlMaxWidth?: string | number;
  showTooltip?: boolean;
  tooltipText?: string;
  className?: string;
  ellipsis?: string;
  useCharLimit?: boolean;
  showEllipsis?: boolean;
  style?: React.CSSProperties;
}

/**
 * 检测 CSS 文本溢出（scrollWidth > clientWidth）
 * 用于 CSS text-overflow: ellipsis 路径，弥补 useCharLimit=false 时
 * isTruncated 永远为 false 的缺陷。
 */
function useOverflowDetector(ref: React.RefObject<HTMLElement | null>) {
  const [isOverflowing, setIsOverflowing] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 使用 1px 容差避免浮点舍入误差
    setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, [ref]);

  useEffect(() => {
    // 初始检测（DOM 已挂载）
    // requestAnimationFrame 确保浏览器已完成布局
    const raf = requestAnimationFrame(checkOverflow);
    return () => cancelAnimationFrame(raf);
  }, [checkOverflow]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // ResizeObserver 监听容器尺寸变化（窗口缩放、侧边栏拖拽等）
    const observer = new ResizeObserver(() => {
      checkOverflow();
    });
    observer.observe(el);

    // 同时监听父级尺寸变化（父级可能不在 ResizeObserver 范围内）
    if (el.parentElement) {
      observer.observe(el.parentElement);
    }

    return () => observer.disconnect();
  }, [checkOverflow, ref]);

  return isOverflowing;
}

export const TruncateText: React.FC<TruncateTextProps> = ({
  children,
  mode = 'end',
  maxChars = 100,
  maxWidth,
  smMaxWidth,
  mdMaxWidth,
  lgMaxWidth,
  xlMaxWidth,
  showTooltip = true,
  tooltipText,
  className = '',
  ellipsis = '...',
  useCharLimit = false,
  showEllipsis = true,
  style = {},
}) => {
  const ellipsisText = showEllipsis ? ellipsis : '';

  // CSS 截断路径的溢出检测
  const textRef = useRef<HTMLSpanElement | null>(null);
  const cssOverflowing = useOverflowDetector(textRef);

  const getResponsiveClasses = (): string[] => {
    const classes: string[] = [];
    if (maxWidth !== undefined) {
      const widthValue =
        typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
      classes.push(`max-w-[${widthValue}]`);
    }
    if (smMaxWidth !== undefined) {
      const widthValue =
        typeof smMaxWidth === 'number' ? `${smMaxWidth}px` : smMaxWidth;
      classes.push(`sm:max-w-[${widthValue}]`);
    }
    if (mdMaxWidth !== undefined) {
      const widthValue =
        typeof mdMaxWidth === 'number' ? `${mdMaxWidth}px` : mdMaxWidth;
      classes.push(`md:max-w-[${widthValue}]`);
    }
    if (lgMaxWidth !== undefined) {
      const widthValue =
        typeof lgMaxWidth === 'number' ? `${lgMaxWidth}px` : lgMaxWidth;
      classes.push(`lg:max-w-[${widthValue}]`);
    }
    if (xlMaxWidth !== undefined) {
      const widthValue =
        typeof xlMaxWidth === 'number' ? `${xlMaxWidth}px` : xlMaxWidth;
      classes.push(`xl:max-w-[${widthValue}]`);
    }
    return classes;
  };

  const responsiveClasses = getResponsiveClasses();

  // 字符数截断判断
  const charTruncated = useMemo(() => {
    if (useCharLimit) {
      return children.length > maxChars;
    }
    return false;
  }, [children, useCharLimit, maxChars]);

  // 综合判断是否被截断：字符截断 或 CSS 溢出
  const isTruncated = useCharLimit ? charTruncated : cssOverflowing;

  const tooltipDisplayText = useMemo((): string | undefined => {
    if (!showTooltip) return undefined;
    if (tooltipText) return tooltipText;
    if (isTruncated) return children;
    return undefined;
  }, [showTooltip, tooltipText, isTruncated, children]);

  // --- middle 模式：保留扩展名，截断中间部分 ---
  if (mode === 'middle') {
    const lastDotIndex = children.lastIndexOf('.') + 1;
    const hasExtension = lastDotIndex !== -1 && lastDotIndex < children.length - 1;

    const baseName = hasExtension ? children.slice(0, lastDotIndex) : children;
    const extension = hasExtension ? children.slice(lastDotIndex) : '';

    const textElement = (
      <span
        className={`${className} ${responsiveClasses.join(' ')}`}
        style={{
          ...style,
          display: 'flex',
          width: '100%',
          minWidth: 0,
        }}
      >
        <span
          ref={textRef}
          style={{
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {baseName}
        </span>{hasExtension && (
          <span style={{
            flexShrink: 0,
            position: "relative",
          }}>{extension}</span>
        )}
      </span>
    );

    const tooltipContent = tooltipText || children;
    // middle 模式使用 cssOverflowing 而非 isTruncated，因为 baseName 才是实际截断的部分
    if (showTooltip && cssOverflowing) {
      return (
        <Tooltip content={tooltipContent} position="top" delay={300}>
          {textElement}
        </Tooltip>
      );
    }
    return textElement;
  }

  // --- useCharLimit 模式：JS 层面按字符数截断 ---
  if (useCharLimit) {
    const availableChars = maxChars - ellipsisText.length;
    let truncatedText = children;

    if (children.length > maxChars) {
      switch (mode) {
        case 'start':
          truncatedText = `${ellipsisText}${children.slice(-availableChars)}`;
          break;
        case 'end':
          truncatedText = `${children.slice(0, availableChars)}${ellipsisText}`;
          break;
        case 'clip':
          truncatedText = children.slice(0, maxChars);
          break;
        default:
          truncatedText = children;
      }
    }

    const textElement = (
      <span
        className={`${className} ${responsiveClasses.join(' ')}`}
        style={{
          ...style,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: showEllipsis ? 'ellipsis' : 'clip',
        }}
      >
        {truncatedText}
      </span>
    );

    if (showTooltip && tooltipDisplayText) {
      return (
        <Tooltip content={tooltipDisplayText} position="top" delay={300}>
          {textElement}
        </Tooltip>
      );
    }
    return textElement;
  }

  // --- CSS 截断路径（默认）：使用 CSS text-overflow + native title ---
  // 注意：不使用 <Tooltip> 包装，避免 inline-flex 容器破坏 width:100% 约束
  const cssStyle: React.CSSProperties = {
    ...style,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  };

  if (mode === 'start') {
    cssStyle.direction = 'rtl';
    cssStyle.textAlign = 'left';
    cssStyle.textOverflow = showEllipsis ? 'ellipsis' : 'clip';
  } else if (mode === 'end') {
    cssStyle.textOverflow = showEllipsis ? 'ellipsis' : 'clip';
  } else if (mode === 'clip') {
    cssStyle.textOverflow = 'clip';
  }

  return (
    <span
      ref={textRef}
      className={`${className} ${responsiveClasses.join(' ')}`}
      style={cssStyle}
      title={showTooltip && tooltipDisplayText ? tooltipDisplayText : undefined}
    >
      {children}
    </span>
  );
};

export const FileNameText: React.FC<Omit<TruncateTextProps, 'mode'>> = (
  props
) => {
  return <TruncateText {...props} mode="middle" />;
};

export const PathText: React.FC<Omit<TruncateTextProps, 'mode'>> = (props) => {
  return <TruncateText {...props} mode="start" />;
};

export const DescriptionText: React.FC<Omit<TruncateTextProps, 'mode'>> = (
  props
) => {
  return <TruncateText {...props} mode="end" />;
};

export default TruncateText;
