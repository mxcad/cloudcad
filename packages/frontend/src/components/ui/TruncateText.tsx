import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

/**
 * 截断模式
 */
export type TruncateMode = 'start' | 'middle' | 'end' | 'clip';

/**
 * TruncateText 组件属性
 */
export interface TruncateTextProps {
  /** 要显示的文本 */
  children: string;
  /** 截断模式，默认 'end' */
  mode?: TruncateMode;
  /** 最大显示字符数，默认 100 */
  maxChars?: number;
  /** 最大宽度（CSS 值），例如 '100px', '50%', '200px' */
  maxWidth?: string | number;
  /** 小屏幕最大宽度 */
  smMaxWidth?: string | number;
  /** 中等屏幕最大宽度 */
  mdMaxWidth?: string | number;
  /** 大屏幕最大宽度 */
  lgMaxWidth?: string | number;
  /** 超大屏幕最大宽度 */
  xlMaxWidth?: string | number;
  /** 是否在鼠标悬停时显示完整文本，默认 true */
  showTooltip?: boolean;
  /** 自定义提示文本，如果不提供则使用完整文本 */
  tooltipText?: string;
  /** 自定义类名 */
  className?: string;
  /** 截断后显示的省略号，默认 '...' */
  ellipsis?: string;
  /** 是否启用字符数限制，默认 false（使用 CSS 截断） */
  useCharLimit?: boolean;
  /** 是否显示截断指示器，默认 true */
  showEllipsis?: boolean;
  /** 自定义样式 */
  style?: React.CSSProperties;
}

/**
 * 文字截断组件
 *
 * 支持多种截断模式：
 * - 'end': 尾部截断（默认），适用于大多数文本
 * - 'start': 头部截断，适用于需要保留后缀的情况（如文件扩展名）
 * - 'middle': 中间截断，适用于文件名等需要保留两端的情况
 * - 'clip': 直接裁剪，不显示省略号
 *
 * @example
 * // 尾部截断（默认）
 * <TruncateText>这是一段很长的文本</TruncateText>
 *
 * @example
 * // 中间截断（适合文件名）
 * <TruncateText mode="middle">very_long_file_name.dwg</TruncateText>
 *
 * @example
 * // 头部截断
 * <TruncateText mode="start">...suffix.txt</TruncateText>
 *
 * @example
 * // 限制最大宽度
 * <TruncateText maxWidth="200px">长文本内容</TruncateText>
 *
 * @example
 * // 使用字符数限制
 * <TruncateText useCharLimit maxChars={20}>这是一段很长的文本</TruncateText>
 */
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
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncatedText, setTruncatedText] = useState(children);
  const [isTruncated, setIsTruncated] = useState(false);

  // 生成截断后的文本（用于字符数限制模式）
  const getTruncatedTextByChars = useCallback((): string => {
    if (children.length <= maxChars) {
      return children;
    }

    const ellipsisText = showEllipsis ? ellipsis : '';
    const availableChars = maxChars - ellipsisText.length;

    if (availableChars <= 0) {
      return ellipsisText;
    }

    switch (mode) {
      case 'start':
        return `${ellipsisText}${children.slice(-availableChars)}`;
      case 'middle': {
        const halfChars = Math.floor(availableChars / 2);
        return `${children.slice(0, halfChars)}${ellipsisText}${children.slice(-halfChars)}`;
      }
      case 'end':
        return `${children.slice(0, availableChars)}${ellipsisText}`;
      case 'clip':
        return children.slice(0, maxChars);
      default:
        return children;
    }
  }, [children, mode, maxChars, ellipsis, showEllipsis]);

  // 使用 Canvas 精确测量文本宽度
  const measureTextWidth = useCallback((text: string, font: string): number => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = font;
    return ctx.measureText(text).width;
  }, []);

  // 计算中间截断的文本
  const calculateMiddleTruncate = useCallback((): string => {
    if (!textRef.current) return children;

    const element = textRef.current;
    const parent = element.parentElement;
    if (!parent) return children;

    const visibleWidth = parent.clientWidth;
    const styles = window.getComputedStyle(element);
    const font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;

    // 如果容器宽度为0或很小，返回完整文本
    if (visibleWidth <= 10) {
      return children;
    }

    // 先测量完整文本的宽度
    const fullWidth = measureTextWidth(children, font);

    // 如果完整文本宽度小于容器宽度，直接返回完整文本
    if (fullWidth <= visibleWidth) {
      return children;
    }

    const totalChars = children.length;
    const ellipsisLength = ellipsis.length;

    // 如果文本太短，直接返回省略号
    if (totalChars <= ellipsisLength) {
      return ellipsis;
    }

    // 测量省略号的宽度
    const ellipsisWidth = measureTextWidth(ellipsis, font);

    // 计算可用宽度
    const availableWidth = visibleWidth - ellipsisWidth;

    // 如果可用宽度不足，只返回省略号
    if (availableWidth <= 0) {
      return ellipsis;
    }

    // 使用二分查找找到最佳截断点
    let left = 1;
    let right = Math.floor((totalChars - ellipsisLength) / 2);
    let bestResult = children;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const testText = `${children.slice(0, mid)}${ellipsis}${children.slice(-mid)}`;
      const testWidth = measureTextWidth(testText, font);

      if (testWidth <= availableWidth) {
        bestResult = testText;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return bestResult;
  }, [children, ellipsis, measureTextWidth]);

  // 检测文本是否被截断并更新截断后的文本
  useEffect(() => {
    if (useCharLimit) {
      const newText = getTruncatedTextByChars();
      setTruncatedText(newText);
      setIsTruncated(children.length > maxChars);
      return;
    }

    if (mode === 'middle') {
      const newText = calculateMiddleTruncate();
      setTruncatedText(newText);
      setIsTruncated(newText !== children);

      // 监听父容器大小变化
      if (textRef.current?.parentElement) {
        const resizeObserver = new ResizeObserver(() => {
          const updatedText = calculateMiddleTruncate();
          setTruncatedText(updatedText);
          setIsTruncated(updatedText !== children);
        });
        resizeObserver.observe(textRef.current.parentElement);
        return () => resizeObserver.disconnect();
      }
      return;
    } else {
      setTruncatedText(children);
      setIsTruncated(false);
      return;
    }
  }, [
    children,
    mode,
    useCharLimit,
    maxChars,
    ellipsis,
    showEllipsis,
    getTruncatedTextByChars,
    calculateMiddleTruncate,
  ]);

  // 确定 tooltip 文本
  const tooltipDisplayText = useMemo((): string | undefined => {
    if (!showTooltip) return undefined;
    if (tooltipText) return tooltipText;
    if (isTruncated) return children;
    return undefined;
  }, [showTooltip, tooltipText, isTruncated, children]);

  // 生成响应式宽度类名
  const getResponsiveClasses = useCallback((): string[] => {
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
  }, [maxWidth, smMaxWidth, mdMaxWidth, lgMaxWidth, xlMaxWidth]);

  // CSS 截断模式（start、end、clip）
  if (!useCharLimit && mode !== 'middle') {
    const responsiveClasses = getResponsiveClasses();

    const cssStyle: React.CSSProperties = {
      ...style,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    };

    if (mode === 'start') {
      cssStyle.direction = 'rtl';
      cssStyle.textAlign = 'left';
      cssStyle.textOverflow = showEllipsis ? ellipsis : 'clip';
    } else if (mode === 'end') {
      cssStyle.textOverflow = showEllipsis ? ellipsis : 'clip';
    } else if (mode === 'clip') {
      cssStyle.textOverflow = 'clip';
    }

    return (
      <span
        className={`${className} ${responsiveClasses.join(' ')}`}
        style={cssStyle}
        title={tooltipDisplayText}
      >
        {children}
      </span>
    );
  }

  // 字符数限制模式或中间截断模式
  const responsiveClasses = getResponsiveClasses();

  return (
    <span
      ref={textRef}
      className={`${className} ${responsiveClasses.join(' ')}`}
      style={{
        ...style,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
      title={tooltipDisplayText}
    >
      {truncatedText}
    </span>
  );
};

/**
 * 文件名专用截断组件（中间截断）
 */
export const FileNameText: React.FC<Omit<TruncateTextProps, 'mode'>> = (
  props
) => {
  return <TruncateText {...props} mode="middle" />;
};

/**
 * 路径专用截断组件（头部截断）
 */
export const PathText: React.FC<Omit<TruncateTextProps, 'mode'>> = (props) => {
  return <TruncateText {...props} mode="start" />;
};

/**
 * 描述文本专用截断组件（尾部截断）
 */
export const DescriptionText: React.FC<Omit<TruncateTextProps, 'mode'>> = (
  props
) => {
  return <TruncateText {...props} mode="end" />;
};

export default TruncateText;
