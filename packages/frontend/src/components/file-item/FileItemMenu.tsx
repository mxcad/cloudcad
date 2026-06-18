import React, { useCallback } from 'react';
import { MoreIcon } from '../FileIcons';
import {
  type ActionType,
  type FileAction,
  ACTION_VARIANT_MAP,
  getActionGroups,
} from './fileActionConfig';
import { Tooltip } from '../ui/Tooltip';
import { Menu } from '../ui/Menu';

interface FileItemMenuProps {
  actions: FileAction[];
  onAction: (type: ActionType) => void;
  showMenu: boolean;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
}

export const FileItemMenu: React.FC<FileItemMenuProps> = ({
  actions,
  onAction,
  showMenu,
  menuButtonRef,
  onOpenMenu,
  onCloseMenu,
}) => {
  const { main, destructive } = getActionGroups(actions);

  const handleClose = useCallback(() => {
    onCloseMenu();
    setTimeout(() => {
      menuButtonRef.current?.blur();
    }, 0);
  }, [onCloseMenu, menuButtonRef]);

  if (actions.length === 0) return null;

  return (
    <>
      <Menu
        open={showMenu}
        onOpenChange={(open) => {
          if (open) onOpenMenu();
          else onCloseMenu();
        }}
        modal={false}
      >
        <Tooltip content="更多操作" position="top">
          <Menu.Trigger>
            <button
              data-tour="file-item-menu-btn"
              ref={menuButtonRef}
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-tertiary)] shadow-sm border border-[var(--border-default)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <MoreIcon size={16} />
            </button>
          </Menu.Trigger>
        </Tooltip>

        <Menu.Content align="end" side="bottom" sideOffset={4}>
          {main.map((action) => (
            <Menu.Item
              key={action.type}
              variant={ACTION_VARIANT_MAP[action.type]}
              icon={action.icon}
              onClick={() => {
                onAction(action.type);
                handleClose();
              }}
              {...(action.props as Record<string, unknown>)}
            >
              {action.label}
            </Menu.Item>
          ))}

          {destructive.length > 0 && main.length > 0 && <Menu.Separator />}

          {destructive.map((action) => (
            <Menu.Item
              key={action.type}
              variant="danger"
              icon={action.icon}
              onClick={() => {
                onAction(action.type);
                handleClose();
              }}
            >
              {action.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu>
    </>
  );
};
