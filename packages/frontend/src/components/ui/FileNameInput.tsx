import { forwardRef } from 'react';
import { Input } from '@/components/ui/Input';
import type { InputProps } from '@/components/ui/Input';

export interface FileNameInputProps extends Omit<InputProps, 'rightNode' | 'rightIcon'> {
  suffix?: string;
  suffixVariant?: 'badge' | 'text';
}

const sizeToBadge: Record<string, string> = {
  xs: 'h-[20px] px-1.5 text-xs rounded-r-[var(--radius-sm)]',
  sm: 'h-[22px] px-2 text-xs rounded-r-[var(--radius-md)]',
  md: 'h-[24px] px-2 text-xs rounded-r-[var(--radius-md)]',
  lg: 'h-[28px] px-2.5 text-sm rounded-r-[var(--radius-lg)]',
};

export const FileNameInput = forwardRef<HTMLInputElement, FileNameInputProps>(
  ({ suffix, suffixVariant = 'badge', size = 'md', className, ...inputProps }, ref) => {
    if (!suffix) {
      return <Input ref={ref} size={size} className={className} {...inputProps} />;
    }

    if (suffixVariant === 'text') {
      return (
        <div className="flex items-center gap-2 w-full">
          <Input ref={ref} size={size} className={className} {...inputProps} />
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
            {suffix}
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center w-full">
        <Input
          ref={ref}
          size={size}
          className={`${className || ''} rounded-r-none`}
          {...inputProps}
        />
        <div
          className={`flex items-center flex-shrink-0 ${sizeToBadge[size]}`}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderLeft: 'none',
            color: 'var(--text-muted)',
          }}
        >
          {suffix}
        </div>
      </div>
    );
  }
);

FileNameInput.displayName = 'FileNameInput';

export default FileNameInput;
