import React from 'react';
import { createPortal } from 'react-dom';
import { Menu } from '@/components/ui/Menu';
import { Z_LAYERS } from '@/constants/layers';
import { useIsMobile } from '@/hooks/useIsMobile';

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
  const isMobile = useIsMobile();

  if (!pos) return null;

  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[15000]"
        onClick={onClose}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 rounded-t-2xl shadow-2xl"
          style={{
            background: 'var(--bg-elevated)',
            maxHeight: '60vh',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div
              className="w-10 h-1 rounded-full"
              style={{ background: 'var(--border-subtle)' }}
            />
          </div>
          <div className="px-2 pb-4 overflow-y-auto max-h-[55vh]">
            {children}
          </div>
        </div>
      </div>,
      document.body
    );
  }

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
