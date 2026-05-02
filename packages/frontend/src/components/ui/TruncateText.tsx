import React, { useMemo } from 'react';
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

  const isTruncated = useMemo(() => {
    if (useCharLimit) {
      return children.length > maxChars;
    }
    return false;
  }, [children, useCharLimit, maxChars]);

  const tooltipDisplayText = useMemo((): string | undefined => {
    if (!showTooltip) return undefined;
    if (tooltipText) return tooltipText;
    if (isTruncated) return children;
    return undefined;
  }, [showTooltip, tooltipText, isTruncated, children]);

  if (mode === 'middle') {
    const lastDotIndex = children.lastIndexOf('.');
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
          style={{
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {baseName}
        </span>
        {hasExtension && (
          <span style={{ flexShrink: 0 }}>{extension}</span>
        )}
      </span>
    );

    if (showTooltip) {
      const tooltipContent = tooltipText || children;
      return (
        <Tooltip  content={tooltipContent} position="top" delay={300}>
          {textElement}
        </Tooltip>
      );
    }
    return textElement;
  }

  if (useCharLimit) {
    const availableChars = maxChars - ellipsisText.length;
    let truncatedText = children;

    if (children.length > maxChars) {
      switch (mode) {
        case 'start':
          truncatedText = `${ellipsisText}${children.slice(-availableChars)}`;
          break;
        case 'middle': {
          const halfChars = Math.floor(availableChars / 2);
          truncatedText = `${children.slice(0, halfChars)}${ellipsisText}${children.slice(-halfChars)}`;
          break;
        }
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
          textOverflow: showEllipsis ? ellipsis : 'clip',
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

  const textElement = (
    <span
      className={`${className} ${responsiveClasses.join(' ')}`}
      style={cssStyle}
    >
      {children}
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
