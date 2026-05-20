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
  modal?: boolean;
}

interface MenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
}

interface MenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  collisionPadding?: number;
  className?: string;
}

interface MenuItemProps {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: (e: Event) => void;
  className?: string;
  variant?: 'default' | 'danger' | 'success' | 'info' | 'warning';
  icon?: React.ReactNode;
  description?: string;
}

interface MenuSubmenuProps {
  children: React.ReactNode;
  trigger: React.ReactNode;
}

interface MenuGroupProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
}

interface MenuStateProps {
  children: React.ReactNode;
  className?: string;
}

export const Menu: React.FC<MenuProps> & {
  Trigger: React.FC<MenuTriggerProps>;
  Content: React.FC<MenuContentProps>;
  Item: React.FC<MenuItemProps>;
  Separator: React.FC;
  Submenu: React.FC<MenuSubmenuProps>;
  Group: React.FC<MenuGroupProps>;
  Loading: React.FC<MenuStateProps>;
  Empty: React.FC<MenuStateProps>;
  Error: React.FC<MenuStateProps>;
} = ({ children, open, defaultOpen, onOpenChange, modal = false }) => {
  return (
    <DropdownMenu.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={modal}>
      {children}
    </DropdownMenu.Root>
  );
};

Menu.Trigger = ({ children, asChild = true, className = '' }) => (
  <DropdownMenu.Trigger asChild={asChild} className={className}>
    {children}
  </DropdownMenu.Trigger>
);

Menu.Content = ({ children, align = 'start', side = 'bottom', sideOffset = 4, collisionPadding = 8, className = '' }) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      align={align}
      side={side}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
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

Menu.Item = ({ children, disabled, onClick, className = '', variant = 'default', icon, description }) => {
  const variantStyles = {
    default: 'data-[highlighted]:bg-[var(--bg-tertiary)] data-[highlighted]:text-[var(--text-primary)]',
    danger: 'data-[highlighted]:bg-[rgba(239,68,68,0.1)]',
    success: 'data-[highlighted]:bg-[rgba(34,197,94,0.1)]',
    info: 'data-[highlighted]:bg-[rgba(59,130,246,0.1)]',
    warning: 'data-[highlighted]:bg-[rgba(245,158,11,0.1)]',
  };

  const variantColors = {
    default: 'var(--text-secondary)',
    danger: 'var(--error)',
    success: 'var(--success)',
    info: 'var(--info)',
    warning: 'var(--warning)',
  };

  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onClick}
      className={`
        flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md
        outline-none cursor-pointer select-none
        transition-colors duration-150
        data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
        ${variantStyles[variant]}
        ${className}
      `}
      style={{
        color: variantColors[variant],
      }}
    >
      {icon && <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="truncate">{children}</div>
        {description && (
          <div className="text-[10px] opacity-60 truncate mt-0.5">{description}</div>
        )}
      </div>
    </DropdownMenu.Item>
  );
};

Menu.Separator = () => (
  <DropdownMenu.Separator style={{ height: 1, margin: '4px 8px', background: 'var(--border-subtle)' }} />
);

Menu.Submenu = ({ children, trigger }) => (
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md outline-none cursor-pointer select-none transition-colors duration-150 data-[highlighted]:bg-[var(--bg-tertiary)] data-[highlighted]:text-[var(--text-primary)] text-[var(--text-secondary)]">
      {trigger}
    </DropdownMenu.SubTrigger>
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        sideOffset={4}
        collisionPadding={8}
        className="min-w-[160px] rounded-xl p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          zIndex: Z_LAYERS.POPUP,
        }}
      >
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  </DropdownMenu.Sub>
);

Menu.Group = ({ children, label, className = '' }) => (
  <DropdownMenu.Group className={className}>
    {label && (
      <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
    )}
    {children}
  </DropdownMenu.Group>
);

Menu.Loading = ({ children, className = '' }) => (
  <div className={`flex items-center justify-center gap-2 px-2.5 py-3 text-xs text-[var(--text-muted)] ${className}`}>
    {children}
  </div>
);

Menu.Empty = ({ children, className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-2 px-2.5 py-4 text-xs text-[var(--text-muted)] ${className}`}>
    {children}
  </div>
);

Menu.Error = ({ children, className = '' }) => (
  <div className={`px-2.5 py-3 text-xs text-[var(--error)] text-center ${className}`}>
    {children}
  </div>
);

Menu.displayName = 'Menu';

export default Menu;
