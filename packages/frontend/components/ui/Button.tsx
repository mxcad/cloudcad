import type React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ElementType;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';

  const variants = {
    primary:
      'gradient-primary text-white hover:shadow-lg transform hover:-translate-y-0.5 focus:ring-primary-500 border border-transparent',
    secondary:
      'bg-slate-100 text-slate-900 hover:bg-slate-200 hover:shadow-md focus:ring-slate-500 border border-transparent',
    outline:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm focus:ring-primary-500',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-500',
    danger:
      'bg-error-600 text-white hover:bg-error-700 hover:shadow-lg transform hover:-translate-y-0.5 focus:ring-error-500 border border-transparent',
  };

  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && (
        <Icon
          size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16}
          className={`${children ? 'mr-2' : ''}`}
        />
      )}
      {children}
    </button>
  );
};
