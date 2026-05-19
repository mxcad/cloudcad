import type React from 'react';
import { forwardRef } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: 'default' | 'error';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  leftIcon?: React.ElementType;
  rightIcon?: React.ElementType;
  rightNode?: React.ReactNode;
  wrapperClassName?: string;
}

const sizeClasses = {
  xs: 'px-1.5 py-0 text-xs gap-1 h-[24px] rounded-[var(--radius-sm)]',
  sm: 'px-3 py-2 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2.5',
};

const iconSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    variant = 'default',
    size = 'md',
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    rightNode,
    className = '',
    wrapperClassName = '',
    disabled,
    ...props
  }, ref) => {
    const hasLeftIcon = !!LeftIcon;
    const hasRightContent = !!RightIcon || !!rightNode;

    const paddingLeftClass = hasLeftIcon ? 'pl-10' : '';
    const paddingRightClass = hasRightContent ? 'pr-10' : '';

    return (
      <div
        className={`relative flex items-center w-full flex-1 ${wrapperClassName}`}
      >
        {LeftIcon && (
          <span className="absolute left-3 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
            <LeftIcon size={iconSizes[size]} />
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={`
            w-full
            rounded-xl
            transition-all
            duration-200
            outline-none
            ${sizeClasses[size]}
            ${paddingLeftClass}
            ${paddingRightClass}
            disabled:opacity-50
            disabled:cursor-not-allowed
            ${className}
          `}
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--primary-500)';
            e.target.style.boxShadow = '0 0 0 3px var(--primary-100)';
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border-default)';
            e.target.style.boxShadow = 'none';
            props.onBlur?.(e);
          }}
          {...props}
        />
        {RightIcon && (
          <span className="absolute right-3 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
            <RightIcon size={iconSizes[size]} />
          </span>
        )}
        {rightNode && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {rightNode}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
