import { useCallback } from 'react';
import { useIsMobile } from './useIsMobile';

export function useMobileInteraction() {
  const isMobile = useIsMobile();

  const getEventHandlers = useCallback(
    <T extends HTMLElement>(handlers: {
      onMouseEnter?: (e: React.MouseEvent<T>) => void;
      onMouseLeave?: (e: React.MouseEvent<T>) => void;
      onTouchStart?: (e: React.TouchEvent<T>) => void;
      onClick?: (e: React.MouseEvent<T>) => void;
    }) => {
      if (isMobile) {
        return {
          onTouchStart: handlers.onTouchStart,
          onClick: handlers.onClick,
        };
      }
      return handlers;
    },
    [isMobile]
  );

  return { isMobile, getEventHandlers };
}
