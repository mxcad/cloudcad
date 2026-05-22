import type React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
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
  style?: React.CSSProperties;
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
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
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

const variantClasses: Record<string, string> = {
  default: 'dropdown-item-theme',
  danger: 'dropdown-item-theme dropdown-item-danger',
  success: 'dropdown-item-theme dropdown-item-success',
  info: 'dropdown-item-theme dropdown-item-info',
  warning: 'dropdown-item-theme dropdown-item-warning',
};

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

Menu.Content = ({ children, align = 'start', side = 'bottom', sideOffset = 4, collisionPadding = 8, className = '', style }) => {
  const { width, ...restStyle } = style ?? {};
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        data-menu-content
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={`dropdown-menu-theme ${className}`}
        style={{ zIndex: Z_LAYERS.POPUP, ...restStyle }}
      >
        <div style={{ width, minWidth: width || undefined }}>
          {children}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
};

Menu.Item = ({ children, disabled, onClick, className = '', variant = 'default', icon, description }) => {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      className={`${variantClasses[variant]} ${className}`}
    >
      {icon && <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[var(--text-tertiary)]">{icon}</span>}
      <div className="flex-1">
        <div className="whitespace-nowrap">{children}</div>
        {description && <div className="text-[var(--text-xs)] text-[var(--text-muted)] whitespace-nowrap mt-0.5">{description}</div>}
      </div>
    </DropdownMenu.Item>
  );
};

Menu.Separator = () => (
  <DropdownMenu.Separator className="h-[1px] my-1 mx-1.5 bg-[var(--border-subtle)]" />
);

Menu.Submenu = ({ children, label, icon, disabled }) => (
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger
      disabled={disabled}
      className="dropdown-item-theme group"
    >
      {icon && <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[var(--text-tertiary)]">{icon}</span>}
      <span className="flex-1 whitespace-nowrap text-left">{label}</span>
      <ChevronRight size={14} className="flex-shrink-0 text-[var(--text-muted)] group-data-[highlighted]:text-[var(--text-secondary)] transition-colors duration-150" />
    </DropdownMenu.SubTrigger>
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        sideOffset={4}
        collisionPadding={8}
        className="dropdown-menu-theme"
        style={{ zIndex: Z_LAYERS.POPUP }}
      >
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  </DropdownMenu.Sub>
);

Menu.Group = ({ children, label, className = '' }) => (
  <DropdownMenu.Group className={className}>
    {label && <div className="px-2.5 py-1.5 text-[var(--text-xs)] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</div>}
    {children}
  </DropdownMenu.Group>
);

Menu.Loading = ({ children, className = '' }) => (
  <div className={`flex items-center justify-center gap-2 px-2.5 py-3 text-[var(--text-sm)] text-[var(--text-muted)] ${className}`}>{children}</div>
);

Menu.Empty = ({ children, className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-2 px-2.5 py-4 text-[var(--text-sm)] text-[var(--text-muted)] ${className}`}>{children}</div>
);

Menu.Error = ({ children, className = '' }) => (
  <div className={`px-2.5 py-3 text-[var(--text-sm)] text-[var(--error)] text-center ${className}`}>{children}</div>
);

Menu.displayName = 'Menu';

export default Menu;
