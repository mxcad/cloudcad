import type React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export interface MenuItemData {
  key: string;
  label: string | React.ReactNode;
  icon?: React.ElementType;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

interface MenuProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface MenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
}

interface MenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}

interface MenuItemProps {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: (e: Event) => void;
  className?: string;
}

export const Menu: React.FC<MenuProps> & {
  Trigger: React.FC<MenuTriggerProps>;
  Content: React.FC<MenuContentProps>;
  Item: React.FC<MenuItemProps>;
  Separator: React.FC;
} = ({ children, open, defaultOpen, onOpenChange }) => {
  return (
    <DropdownMenu.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {children}
    </DropdownMenu.Root>
  );
};

Menu.Trigger = ({ children, asChild = true, className = '' }) => (
  <DropdownMenu.Trigger asChild={asChild} className={className}>
    {children}
  </DropdownMenu.Trigger>
);

Menu.Content = ({ children, align = 'start', sideOffset = 4, className = '' }) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      align={align}
      sideOffset={sideOffset}
      className={`
        min-w-[180px] rounded-xl p-1.5 shadow-lg
        animate-in fade-in-0 zoom-in-95
        ${className}
      `}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
      }}
    >
      {children}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
);

Menu.Item = ({ children, disabled, onClick, className = '' }) => (
  <DropdownMenu.Item
    disabled={disabled}
    onSelect={onClick}
    className={`
      flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg
      outline-none cursor-pointer
      transition-colors duration-150
      data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
      ${className}
    `}
    style={{
      color: 'var(--text-secondary)',
    }}
    onFocus={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
    onBlur={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
  >
    {children}
  </DropdownMenu.Item>
);

Menu.Separator = () => (
  <DropdownMenu.Separator style={{ height: 1, margin: '4px 8px', background: 'var(--border-subtle)' }} />
);

Menu.displayName = 'Menu';

export default Menu;
