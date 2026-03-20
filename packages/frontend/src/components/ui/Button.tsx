import type React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ElementType;
  loading?: boolean;
}

/**
 * Button 组件 - CloudCAD
 * 
 * 设计特色：
 * - 支持主题变量适配深色/亮色主题
 * - 渐变主按钮效果
 * - 流畅的悬停和点击动画
 * - 加载状态支持
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  // 基础样式
  const baseStyles = `
    inline-flex 
    items-center 
    justify-center 
    font-semibold 
    transition-all 
    duration-200 
    rounded-xl 
    focus:outline-none 
    focus:ring-2 
    focus:ring-offset-2 
    disabled:opacity-50 
    disabled:cursor-not-allowed 
    disabled:transform-none
    active:scale-[0.98]
  `;

  // 变体样式 - 使用 CSS 变量
  const variants = {
    primary: `
      bg-gradient-to-r from-[var(--primary-600)] to-[var(--primary-500)]
      text-white
      hover:shadow-lg hover:shadow-[var(--primary-500)]/30
      focus:ring-[var(--primary-500)]
      border border-transparent
      hover:-translate-y-0.5
    `,
    secondary: `
      bg-[var(--bg-tertiary)]
      text-[var(--text-secondary)]
      hover:bg-[var(--bg-elevated)]
      hover:shadow-md
      focus:ring-[var(--border-strong)]
      border border-[var(--border-default)]
    `,
    outline: `
      bg-transparent
      text-[var(--text-secondary)]
      border border-[var(--border-default)]
      hover:bg-[var(--bg-tertiary)]
      hover:border-[var(--border-strong)]
      hover:text-[var(--text-primary)]
      focus:ring-[var(--primary-500)]
    `,
    ghost: `
      bg-transparent
      text-[var(--text-tertiary)]
      hover:bg-[var(--bg-tertiary)]
      hover:text-[var(--text-secondary)]
      focus:ring-[var(--border-strong)]
      border border-transparent
    `,
    danger: `
      bg-[var(--error)]
      text-white
      hover:bg-red-600
      hover:shadow-lg hover:shadow-red-500/30
      focus:ring-red-500
      border border-transparent
      hover:-translate-y-0.5
    `,
  };

  // 尺寸样式
  const sizes = {
    sm: 'px-3 py-2 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
  };

  // 图标尺寸
  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20,
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
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
};

export default Button;