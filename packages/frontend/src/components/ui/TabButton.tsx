import { Button } from './Button';
import type { ButtonProps } from './Button';

export interface TabButtonProps extends Omit<ButtonProps, 'variant'> {
  active?: boolean;
  tabVariant?: 'secondary' | 'primary' | 'outline' | 'ghost';
}

export const TabButton: React.FC<TabButtonProps> = ({
  active = false,
  size = 'md',
  tabVariant = 'secondary',
  className = '',
  children,
  ...props
}) => {
  return (
    <Button
      variant={active ? tabVariant : 'ghost'}
      size={size}
      className={`font-medium transition-all duration-200 ${
        active ? 'shadow-sm border-[var(--border-default)]' : 'border-transparent'
      } ${className}`}
      style={
        active
          ? {
              backgroundColor: 'var(--tab-active-bg)',
              color: 'var(--tab-active-text)',
            }
          : undefined
      }
      {...props}
    >
      {children}
    </Button>
  );
};

export default TabButton;
