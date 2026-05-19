import type React from 'react';

export type BoxSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type BoxBackground = 'canvas' | 'primary' | 'secondary' | 'tertiary' | 'elevated' | 'overlay' | 'transparent';
export type BoxRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type BoxDisplay = 'flex' | 'grid' | 'block' | 'inline-flex' | 'inline-block' | 'none';
export type BoxFlex = '1' | 'auto' | 'none';
export type BoxFlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type BoxAlignItems = 'center' | 'flex-start' | 'flex-end' | 'stretch' | 'baseline';
export type BoxJustifyContent = 'center' | 'flex-start' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
export type BoxElement = 'div' | 'span' | 'section' | 'article' | 'main' | 'header' | 'footer' | 'aside' | 'nav';

const spacingMap: Record<BoxSpacing, string> = {
  none: '0',
  xs: '1',
  sm: '2',
  md: '3',
  lg: '4',
  xl: '6',
  '2xl': '8',
};

const bgMap: Record<BoxBackground, string> = {
  canvas: 'bg-[var(--bg-canvas)]',
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
  elevated: 'bg-[var(--bg-elevated)]',
  overlay: 'bg-[var(--bg-overlay)]',
  transparent: 'bg-transparent',
};

const radiusMap: Record<BoxRadius, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

const displayMap: Record<BoxDisplay, string> = {
  flex: 'flex',
  grid: 'grid',
  block: 'block',
  'inline-flex': 'inline-flex',
  'inline-block': 'inline-block',
  none: 'hidden',
};

const flexMap: Record<BoxFlex, string> = {
  '1': 'flex-1',
  auto: 'flex-auto',
  none: 'flex-none',
};

const flexDirectionMap: Record<BoxFlexDirection, string> = {
  row: 'flex-row',
  column: 'flex-col',
  'row-reverse': 'flex-row-reverse',
  'column-reverse': 'flex-col-reverse',
};

const alignItemsMap: Record<BoxAlignItems, string> = {
  center: 'items-center',
  'flex-start': 'items-start',
  'flex-end': 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyContentMap: Record<BoxJustifyContent, string> = {
  center: 'justify-center',
  'flex-start': 'justify-start',
  'flex-end': 'justify-end',
  'space-between': 'justify-between',
  'space-around': 'justify-around',
  'space-evenly': 'justify-evenly',
};

export interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: BoxElement;
  display?: BoxDisplay;
  flex?: BoxFlex;
  flexDirection?: BoxFlexDirection;
  alignItems?: BoxAlignItems;
  justifyContent?: BoxJustifyContent;
  gap?: BoxSpacing;
  p?: BoxSpacing;
  px?: BoxSpacing;
  py?: BoxSpacing;
  m?: BoxSpacing;
  mx?: BoxSpacing;
  my?: BoxSpacing;
  bg?: BoxBackground;
  rounded?: BoxRadius;
  border?: boolean;
}

export const Box: React.FC<BoxProps> = ({
  as: Tag = 'div',
  display,
  flex,
  flexDirection,
  alignItems,
  justifyContent,
  gap,
  p,
  px,
  py,
  m,
  mx,
  my,
  bg,
  rounded,
  border = false,
  className = '',
  children,
  ...props
}) => {
  const classes: string[] = [];

  if (display) classes.push(displayMap[display]);
  if (flex) classes.push(flexMap[flex]);
  if (flexDirection) classes.push(flexDirectionMap[flexDirection]);
  if (alignItems) classes.push(alignItemsMap[alignItems]);
  if (justifyContent) classes.push(justifyContentMap[justifyContent]);
  if (gap) classes.push(`gap-${spacingMap[gap]}`);
  if (p) classes.push(`p-${spacingMap[p]}`);
  if (px) classes.push(`px-${spacingMap[px]}`);
  if (py) classes.push(`py-${spacingMap[py]}`);
  if (m) classes.push(`m-${spacingMap[m]}`);
  if (mx) classes.push(`mx-${spacingMap[mx]}`);
  if (my) classes.push(`my-${spacingMap[my]}`);
  if (bg) classes.push(bgMap[bg]);
  if (rounded) classes.push(radiusMap[rounded]);
  if (border) classes.push('border border-[var(--border-default)]');

  return (
    <Tag className={`${classes.join(' ')} ${className}`} {...(props as React.HTMLAttributes<HTMLElement>)}>
      {children}
    </Tag>
  );
};

Box.displayName = 'Box';

export default Box;
