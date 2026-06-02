import React from 'react';

export type CardVariant = 'elevated' | 'outlined' | 'filled' | 'ghost';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardRadius =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | 'full';

const radiusStyles: Record<CardRadius, string> = {
  none: 'rounded-none',
  sm: 'rounded-[var(--radius-sm)]',
  md: 'rounded-[var(--radius-md)]',
  lg: 'rounded-[var(--radius-lg)]',
  xl: 'rounded-[var(--radius-xl)]',
  '2xl': 'rounded-[var(--radius-2xl)]',
  '3xl': 'rounded-[var(--radius-3xl)]',
  full: 'rounded-[var(--radius-full)]',
};

const variantStyles: Record<CardVariant, string> = {
  elevated:
    'bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-xl)]',
  outlined: 'bg-[var(--bg-secondary)] border border-[var(--border-default)]',
  filled: 'bg-[var(--bg-tertiary)]',
  ghost: 'bg-transparent',
};

const hoverStyles =
  'transition-all duration-200 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5';

const paddingStyles: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-1',
  md: 'p-5',
  lg: 'p-8',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  radius?: CardRadius;
  hover?: boolean;
}

const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'outlined',
      padding,
      radius = 'md',
      hover: enableHover = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`
        ${radiusStyles[radius]}
        ${variantStyles[variant]}
        ${enableHover ? hoverStyles : ''}
        ${padding ? paddingStyles[padding] : ''}
        ${className}
      `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardRoot.displayName = 'Card';

CardRoot.displayName = 'Card';

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const CardHeader: React.FC<CardHeaderProps> = ({
  padding = 'sm',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`
        flex items-center justify-between
        border-b border-[var(--border-default)]
        ${paddingStyles[padding]}
        ${className}
      `}
      style={{ padding: '6px 16px' }}
      {...props}
    >
      {children}
    </div>
  );
};

CardHeader.displayName = 'Card.Header';

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

const CardTitle: React.FC<CardTitleProps> = ({
  as: Tag = 'h3',
  className = '',
  children,
  ...props
}) => {
  return (
    <Tag
      className={`text-sm font-semibold ${className}`}
      style={{ color: 'var(--text-primary)' }}
      {...props}
    >
      {children}
    </Tag>
  );
};

CardTitle.displayName = 'Card.Title';

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const CardDescription: React.FC<CardDescriptionProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p
      className={`text-sm mt-1 ${className}`}
      style={{ color: 'var(--text-secondary)' }}
      {...props}
    >
      {children}
    </p>
  );
};

CardDescription.displayName = 'Card.Description';

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const CardBody: React.FC<CardBodyProps> = ({
  padding = 'md',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`${paddingStyles[padding]} ${className}`}
      style={{ color: 'var(--text-secondary)', padding: '12px 16px' }}
      {...props}
    >
      {children}
    </div>
  );
};

CardBody.displayName = 'Card.Body';

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const CardFooter: React.FC<CardFooterProps> = ({
  padding = 'md',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`
        flex items-center justify-end gap-3
        border-t border-[var(--border-default)]
        ${paddingStyles[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

CardFooter.displayName = 'Card.Footer';

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Body: CardBody,
  Footer: CardFooter,
});

export default Card;
