import type React from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  error?: boolean;
}

const sizeConfig = {
  xs: { box: 'w-3.5 h-3.5', icon: 10, label: 'text-xs', gap: 'gap-1.5' },
  sm: { box: 'w-4 h-4', icon: 12, label: 'text-xs', gap: 'gap-2' },
  md: { box: 'w-[18px] h-[18px]', icon: 14, label: 'text-sm', gap: 'gap-2' },
  lg: { box: 'w-5 h-5', icon: 16, label: 'text-base', gap: 'gap-2.5' },
};

export const Checkbox: React.FC<CheckboxProps> = ({
  size = 'md',
  label,
  error = false,
  className = '',
  disabled,
  id,
  checked,
  onChange,
  ...props
}) => {
  const cfg = sizeConfig[size];
  const checkboxId = id || `checkbox-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <label
      htmlFor={checkboxId}
      className={`inline-flex items-center cursor-pointer ${cfg.gap} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          id={checkboxId}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div
          className={`
            ${cfg.box}
            rounded-[3px]
            border
            transition-all
            duration-200
            flex
            items-center
            justify-center
            peer-checked:bg-[var(--primary-500)]
            peer-checked:border-[var(--primary-500)]
            peer-focus-visible:ring-2
            peer-focus-visible:ring-[var(--primary-500)]
            peer-focus-visible:ring-offset-1
            ${error ? 'border-[var(--error)]' : 'border-[var(--border-default)]'}
            ${disabled ? 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]' : 'bg-[var(--bg-primary)]'}
            peer-hover:${disabled ? '' : 'border-[var(--border-strong)]'}
          `}
        >
          <Check
            size={cfg.icon}
            className="text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
            strokeWidth={3}
          />
        </div>
      </div>
      {label && (
        <span className={`${cfg.label} text-[var(--text-secondary)] select-none ${disabled ? 'text-[var(--text-muted)]' : ''}`}>
          {label}
        </span>
      )}
    </label>
  );
};

export default Checkbox;
