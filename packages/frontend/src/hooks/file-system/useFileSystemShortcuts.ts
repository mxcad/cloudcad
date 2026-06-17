import { useEffect, useRef } from 'react';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';

interface UseFileSystemShortcutsOptions {
  containerRef?: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  onUndo: () => Promise<void>;
  onRedo: () => Promise<void>;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => Promise<void>;
  onDeleteSelected: () => void;
  onRenameSelected: () => void;
  onClearSelection: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canCopy?: boolean;
  canCut?: boolean;
  canDelete?: boolean;
  canPaste?: boolean;
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (document.activeElement?.getAttribute('contenteditable') === 'true') return true;
  return false;
}

function isAnyModalOpen(): boolean {
  return document.querySelector('.modal-enter') !== null;
}

export function useFileSystemShortcuts({
  containerRef,
  enabled = true,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onDeleteSelected,
  onRenameSelected,
  onClearSelection,
  canUndo,
  canRedo,
  canCopy = true,
  canCut = true,
  canDelete = true,
  canPaste = true,
}: UseFileSystemShortcutsOptions) {
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;
  const onCutRef = useRef(onCut);
  onCutRef.current = onCut;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const onDeleteSelectedRef = useRef(onDeleteSelected);
  onDeleteSelectedRef.current = onDeleteSelected;
  const onRenameSelectedRef = useRef(onRenameSelected);
  onRenameSelectedRef.current = onRenameSelected;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;

  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;
  const canCopyRef = useRef(canCopy);
  canCopyRef.current = canCopy;
  const canCutRef = useRef(canCut);
  canCutRef.current = canCut;
  const canDeleteRef = useRef(canDelete);
  canDeleteRef.current = canDelete;
  const canPasteRef = useRef(canPaste);
  canPasteRef.current = canPaste;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      if (containerRef?.current) {
        const activeEl = document.activeElement;
        if (activeEl && activeEl !== document.body && !containerRef.current.contains(activeEl)) {
          return;
        }
      }

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod) {
        switch (e.key.toLowerCase()) {
          case 'z': {
            if (e.shiftKey) {
              if (!canRedoRef.current) return;
              e.preventDefault();
              void onRedoRef.current().catch(() => {});
            } else {
              if (!canUndoRef.current) return;
              e.preventDefault();
              void onUndoRef.current().catch(() => {});
            }
            return;
          }
          case 'y': {
            if (!canRedoRef.current) return;
            e.preventDefault();
            void onRedoRef.current().catch(() => {});
            return;
          }
          case 'c': {
            if (!canCopyRef.current) return;
            e.preventDefault();
            onCopyRef.current();
            return;
          }
          case 'x': {
            if (!canCutRef.current) return;
            e.preventDefault();
            onCutRef.current();
            return;
          }
          case 'v': {
            if (!canPasteRef.current) return;
            e.preventDefault();
            void onPasteRef.current().catch(() => {});
            return;
          }
        }
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Del': {
          if (!canDeleteRef.current) return;
          e.preventDefault();
          onDeleteSelectedRef.current();
          return;
        }
        case 'F2': {
          e.preventDefault();
          onRenameSelectedRef.current();
          return;
        }
        case 'Escape': {
          if (isAnyModalOpen()) return;
          e.preventDefault();
          onClearSelectionRef.current();
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, enabled]);
}
