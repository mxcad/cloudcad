import type React from 'react';

export type TagVariant = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral';
export type TagSize = 'xs' | 'sm';

export interface TagProps {
  variant?: TagVariant;
  size?: TagSize;
  dot?: boolean;
  icon?: React.ElementType;
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

export const Tag: React.FC<TagProps> = ({
  variant = 'neutral',
  size = 'xs',
  dot = false,
  icon: Icon,
  children,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
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
