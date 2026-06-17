import type React from 'react';
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: 'default' | 'error';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  leftIcon?: React.ElementType;
  rightIcon?: React.ElementType;
  rightNode?: React.ReactNode;
  wrapperClassName?: string;
  showPasswordToggle?: boolean;
}

const sizeConfig = {
  xs: {
    cls: 'px-1.5 py-0 text-xs gap-1 h-[20px] rounded-[2px]',
    iconSize: 10,
    btnSize: 14,
    pl: 'pl-5',
    pr: 'pr-5',
    prToggle: 'pr-5',
    leftOffset: 'left-1',
    rightOffset: 'right-1',
  },
  sm: {
    cls: 'px-2 py-0.5 text-xs gap-1 h-[22px] rounded-[3px]',
    iconSize: 12,
    btnSize: 14,
    pl: 'pl-6',
    pr: 'pr-6',
    prToggle: 'pr-6',
    leftOffset: 'left-1.5',
    rightOffset: 'right-1.5',
  },
  md: {
    cls: 'px-2 py-1 text-xs gap-1.5 h-[24px] rounded-[3px]',
    iconSize: 14,
    btnSize: 16,
    pl: 'pl-7',
    pr: 'pr-7',
    prToggle: 'pr-7',
    leftOffset: 'left-2',
    rightOffset: 'right-2',
  },
  lg: {
    cls: 'px-2.5 py-1 text-sm gap-2 h-[28px] rounded-[4px]',
    iconSize: 16,
    btnSize: 18,
    pl: 'pl-8',
    pr: 'pr-8',
    prToggle: 'pr-8',
    leftOffset: 'left-2.5',
    rightOffset: 'right-2.5',
  },
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
    showPasswordToggle = false,
    type,
    ...props
  }, ref) => {
    const cfg = sizeConfig[size];
    const hasLeftIcon = !!LeftIcon;
    const hasRightContent = !!RightIcon || !!rightNode || showPasswordToggle;
    const [passwordVisible, setPasswordVisible] = useState(false);

    const resolvedType = showPasswordToggle && type === 'password'
      ? (passwordVisible ? 'text' : 'password')
      : type;

    const paddingLeftClass = hasLeftIcon ? cfg.pl : '';
    const paddingRightClass = hasRightContent ? cfg.pr : '';

    return (
      <div
        className={`relative flex items-center w-full flex-1 ${wrapperClassName}`}
      >
        {LeftIcon && (
          <span className={`absolute ${cfg.leftOffset} pointer-events-none`} style={{ color: 'var(--text-muted)' }}>
            <LeftIcon size={cfg.iconSize} />
          </span>
        )}
        <input
          ref={ref}
          type={resolvedType}
          disabled={disabled}
          className={`
            w-full
            transition-all
            duration-200
            outline-none
            ${cfg.cls}
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
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border-default)';
            props.onBlur?.(e);
          }}
          {...props}
        />
        {showPasswordToggle && type === 'password' && (
          <button
            type="button"
            tabIndex={-1}
            className={`absolute ${cfg.rightOffset} top-1/2 -translate-y-1/2 flex items-center justify-center p-0.5 rounded`}
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setPasswordVisible((v) => !v)}
            aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
          >
            {passwordVisible ? <EyeOff size={cfg.btnSize} /> : <Eye size={cfg.btnSize} />}
          </button>
        )}
        {RightIcon && !showPasswordToggle && (
          <span className={`absolute ${cfg.rightOffset} pointer-events-none`} style={{ color: 'var(--text-muted)' }}>
            <RightIcon size={cfg.iconSize} />
          </span>
        )}
        {rightNode && !showPasswordToggle && (
          <div className={`absolute ${cfg.rightOffset} top-1/2 -translate-y-1/2 flex items-center gap-0.5`}>
            {rightNode}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
