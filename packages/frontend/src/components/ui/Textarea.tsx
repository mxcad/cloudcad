import type React from 'react';
import { forwardRef, useState, useCallback } from 'react';

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  variant?: 'default' | 'error';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

const sizeConfig = {
  xs: { cls: 'px-1.5 py-1 text-xs', minHeight: '48px' },
  sm: { cls: 'px-2 py-1.5 text-xs', minHeight: '56px' },
  md: { cls: 'px-3 py-2 text-xs', minHeight: '72px' },
  lg: { cls: 'px-4 py-3 text-sm', minHeight: '96px' },
} as const;

const resizeMap: Record<string, string> = {
  none: 'resize-none',
  vertical: 'resize-y',
  horizontal: 'resize-x',
  both: 'resize',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({
    variant = 'default',
    size = 'md',
    resize = 'vertical',
    className = '',
    disabled,
    onFocus,
    onBlur,
    style,
    ...props
  }, ref) => {
    const cfg = sizeConfig[size];
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    }, [onFocus]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    }, [onBlur]);

    const borderColor = variant === 'error'
      ? 'var(--error)'
      : isFocused
        ? 'var(--primary-500)'
        : 'var(--border-default)';

    return (
      <textarea
        ref={ref}
        disabled={disabled}
        className={`
          w-full
          transition-all
          duration-200
          outline-none
          ${cfg.cls}
          ${resizeMap[resize]}
          disabled:opacity-50
          disabled:cursor-not-allowed
          ${className}
        `}
        style={{
          background: 'var(--bg-primary)',
          border: `1px solid ${borderColor}`,
          color: 'var(--text-primary)',
          borderRadius: '3px',
          minHeight: cfg.minHeight,
          ...style,
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
