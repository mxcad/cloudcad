import React from 'react';
import { Menu } from '@/components/ui/Menu';
import { Z_LAYERS } from '@/constants/layers';

interface EmptyContextMenuProps {
  pos: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
}

export const EmptyContextMenu: React.FC<EmptyContextMenuProps> = ({
  pos,
  onClose,
  children,
}) => {
  if (!pos) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 0,
        height: 0,
        overflow: 'visible',
        zIndex: Z_LAYERS.POPUP,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Menu
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        modal={false}
      >
        <Menu.Trigger asChild>
          <div style={{ width: 0, height: 0 }} />
        </Menu.Trigger>
        <Menu.Content align="start" side="bottom" sideOffset={0}>
          {children}
        </Menu.Content>
      </Menu>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: -1 }}
        onClick={onClose}
      />
    </div>
  );
};
