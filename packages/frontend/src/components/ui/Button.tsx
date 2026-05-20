import React, { Children, isValidElement, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Tooltip, type TooltipPosition } from './Tooltip';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'icon';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: React.ElementType;
  loading?: boolean;
  /** 图标按钮提示文本 */
  tooltip?: string;
  /** 提示框位置 */
  tooltipPosition?: TooltipPosition;
  /** 提示延迟（毫秒） */
  tooltipDelay?: number;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  className = '',
  disabled,
  tooltip,
  tooltipPosition = 'top',
  tooltipDelay = 300,
  ...props
}) => {
  const baseStyles = `
    inline-flex
    items-center
    justify-center
    font-semibold
    transition-all
    duration-200
    focus:outline-none
    disabled:opacity-50
    disabled:cursor-not-allowed
    disabled:transform-none
    active:scale-[0.98]
  `;

  const variants = {
    primary: `
      bg-[var(--btn-primary-bg)]
      text-white
      hover:bg-[var(--btn-primary-hover)]
      hover:shadow-lg hover:shadow-[var(--primary-500)]/30
      border border-transparent
      hover:-translate-y-0.5
      active:bg-[var(--btn-primary-active)]
    `,
    secondary: `
      bg-[var(--btn-default-bg)]
      text-[var(--text-secondary)]
      hover:bg-[var(--btn-default-hover)]
      hover:shadow-md
      border border-[var(--border-default)]
      active:bg-[var(--btn-default-active)]
    `,
    outline: `
      bg-transparent
      text-[var(--text-secondary)]
      border border-[var(--border-default)]
      hover:bg-[var(--btn-default-bg)]
      hover:border-[var(--border-strong)]
      hover:text-[var(--text-primary)]
      active:bg-[var(--btn-default-active)]
    `,
    ghost: `
      bg-transparent
      text-[var(--text-tertiary)]
      hover:bg-[var(--btn-default-bg)]
      hover:text-[var(--text-secondary)]
      border border-transparent
      active:bg-[var(--btn-default-active)]
    `,
    danger: `
      bg-[var(--error)]
      text-white
      hover:bg-red-600
      hover:shadow-lg hover:shadow-red-500/30
      border border-transparent
      hover:-translate-y-0.5
    `,
    icon: `
      bg-transparent
      text-[var(--text-tertiary)]
      hover:bg-[var(--btn-default-bg)]
      hover:text-[var(--text-secondary)]
      border border-transparent
      active:bg-[var(--btn-default-active)]
    `,
  };

  const sizes = {
    xs: 'px-1.5 py-0 text-[var(--text-xs)] gap-1 h-[20px] rounded-[var(--radius-sm)]',
    sm: 'px-2 py-0.5 text-[var(--text-sm)] gap-1 h-[22px] rounded-[var(--radius-md)]',
    md: 'px-3 py-1.5 text-[var(--text-base)] gap-1.5 h-[28px] rounded-[var(--radius-md)]',
    lg: 'px-5 py-2.5 text-[var(--text-md)] gap-2 h-[40px] rounded-[var(--radius-lg)]',
  };

  const iconSizes = {
    xs: 14,
    sm: 14,
    md: 16,
    lg: 20,
  };

  const isIconButton = useMemo(() => {
    if (!Icon) return false;
    if (!children) return true;
    const hasElementChild = Children.toArray(children).some(isValidElement);
    if (hasElementChild) return false;
    const textContent = Children.toArray(children)
      .filter((child): child is string => typeof child === 'string')
      .join('');
    return textContent.trim() === '';
  }, [Icon, children]);

  const iconButtonSizes = {
    xs: 'w-[20px] h-[20px] p-0 rounded-[var(--radius-sm)]',
    sm: 'w-[22px] h-[22px] p-0 rounded-[var(--radius-md)]',
    md: 'w-[28px] h-[28px] p-0 rounded-[var(--radius-md)]',
    lg: 'w-[40px] h-[40px] p-0 rounded-[var(--radius-lg)]',
  };

  const sizeClasses = isIconButton ? iconButtonSizes[size] : sizes[size];

  const buttonContent = (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizeClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 
          size={iconSizes[size]} 
          className="animate-spin" 
        />
      ) : (
        Icon && (
          <Icon
            size={iconSizes[size]}
          />
        )
      )}
      {children}
    </button>
  );

  if (isIconButton && tooltip) {
    return (
      <Tooltip content={tooltip} position={tooltipPosition} delay={tooltipDelay}>
        {buttonContent}
      </Tooltip>
    );
  }

  return buttonContent;
};

export default Button;