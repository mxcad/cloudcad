import type React from 'react';

export type TagVariant = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral';
export type TagSize = 'xs' | 'sm';
export type TagRound = 'full' | 'sm';

export interface TagProps {
  variant?: TagVariant;
  size?: TagSize;
  rounded?: TagRound;
  dot?: boolean;
  icon?: React.ElementType;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<TagVariant, string> = {
  success: 'bg-[var(--success-dim)] text-[var(--success)]',
  warning: 'bg-[var(--warning-dim)] text-[var(--warning)]',
  error: 'bg-[var(--error-dim)] text-[var(--error)]',
  info: 'bg-[var(--info-dim)] text-[var(--info)]',
  primary: 'bg-[var(--primary-100)] text-[var(--primary-600)]',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
};

const sizeStyles: Record<TagSize, string> = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-1 text-xs',
};

const roundStyles: Record<TagRound, string> = {
  full: 'rounded-full',
  sm: 'rounded-sm',
};

export const Tag: React.FC<TagProps> = ({
  variant = 'neutral',
  size = 'xs',
  rounded = 'full',
  dot = false,
  icon: Icon,
  onClick,
  children,
  className = '',
}) => {
  const classes = `inline-flex items-center gap-1 font-medium whitespace-nowrap ${roundStyles[rounded]} ${variantStyles[variant]} ${sizeStyles[size]} ${onClick ? 'cursor-pointer' : ''} ${className}`;

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {dot && (
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              background: 'currentColor',
              boxShadow: '0 0 6px currentColor',
            }}
          />
        )}
        {Icon && <Icon size={12} />}
        {children}
      </button>
    );
  }

  return (
    <span className={classes}>
      {dot && (
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{
            background: 'currentColor',
            boxShadow: '0 0 6px currentColor',
          }}
        />
      )}
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
};

export default Tag;
