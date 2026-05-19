import type React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Z_LAYERS } from '@/constants/layers';

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
  danger?: boolean;
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
        min-w-[160px] rounded-xl p-1 shadow-xl
        animate-in fade-in-0 zoom-in-95
        ${className}
      `}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        zIndex: Z_LAYERS.OVERLAY,
      }}
    >
      {children}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
);

Menu.Item = ({ children, disabled, onClick, className = '', danger }) => (
  <DropdownMenu.Item
    disabled={disabled}
    onSelect={onClick}
    className={`
      flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md
      outline-none cursor-pointer select-none
      transition-colors duration-150
      data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
      data-[highlighted]:bg-[rgba(255,255,255,0.05)]
      data-[highlighted]:text-[var(--text-primary)]
      ${danger ? 'data-[highlighted]:text-[var(--error)]' : ''}
      ${className}
    `}
    style={{
      color: danger ? 'var(--error)' : 'var(--text-secondary)',
    }}
  >
    {children}
  </DropdownMenu.Item>
);

Menu.Separator = () => (
  <DropdownMenu.Separator style={{ height: 1, margin: '4px 8px', background: 'var(--border-subtle)' }} />
);

Menu.displayName = 'Menu';

export default Menu;
