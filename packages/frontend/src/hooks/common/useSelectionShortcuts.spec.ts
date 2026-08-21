import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import type { RefObject } from 'react';
import {
  useSelectionShortcuts,
  type ContainerFocusMode,
  type SelectionShortcutKey,
} from './useSelectionShortcuts';

interface RenderOptions {
  enabled?: boolean;
  canDelete?: boolean;
  withDelete?: boolean;
}

function renderShortcuts(initialProps: RenderOptions = {}) {
  const onClearSelection = vi.fn();
  const onSelectAll = vi.fn();
  const onDeleteSelected = vi.fn();
  const utils = renderHook(
    (props: RenderOptions) =>
      useSelectionShortcuts({
        enabled: props.enabled,
        onClearSelection,
        onSelectAll,
        onDeleteSelected: props.withDelete === false ? undefined : onDeleteSelected,
        canDelete: props.canDelete,
      }),
    {
      initialProps: {
        enabled: initialProps.enabled ?? true,
        canDelete: initialProps.canDelete ?? true,
        withDelete: initialProps.withDelete ?? true,
      },
    }
  );
  return { ...utils, onClearSelection, onSelectAll, onDeleteSelected };
}

/** 触发 document 级 keydown（冒泡路径：body → document） */
function pressKey(key: string, init: KeyboardEventInit = {}) {
  return fireEvent.keyDown(document.body, { key, ...init });
}

describe('useSelectionShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ESC 清空选择', () => {
    const { onClearSelection } = renderShortcuts();
    pressKey('Escape');
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('Modal 打开时 ESC 让位（不抢关闭键）', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-enter';
    document.body.appendChild(modal);
    const { onClearSelection } = renderShortcuts();
    pressKey('Escape');
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('Ctrl+A 全选并阻止浏览器默认行为', () => {
    const { onSelectAll } = renderShortcuts();
    const notCanceled = pressKey('a', { ctrlKey: true });
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    // fireEvent 返回 false 表示默认行为已被 preventDefault
    expect(notCanceled).toBe(false);
  });

  it('Cmd+A（macOS）同样触发全选', () => {
    const { onSelectAll } = renderShortcuts();
    pressKey('a', { metaKey: true });
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('Delete 触发删除回调', () => {
    const { onDeleteSelected } = renderShortcuts();
    pressKey('Delete');
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it('canDelete=false 时 Delete 不触发', () => {
    const { onDeleteSelected } = renderShortcuts({ canDelete: false });
    pressKey('Delete');
    expect(onDeleteSelected).not.toHaveBeenCalled();
  });

  it('未提供 onDeleteSelected 时 Delete 不触发', () => {
    const { onDeleteSelected } = renderShortcuts({ withDelete: false });
    pressKey('Delete');
    expect(onDeleteSelected).not.toHaveBeenCalled();
  });

  it('输入框聚焦时不触发快捷键', () => {
    const { onClearSelection, onSelectAll } = renderShortcuts();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    pressKey('Escape');
    pressKey('a', { ctrlKey: true });
    expect(onClearSelection).not.toHaveBeenCalled();
    expect(onSelectAll).not.toHaveBeenCalled();
  });

  it('enabled=false 时不监听', () => {
    const { onClearSelection, onSelectAll } = renderShortcuts({ enabled: false });
    pressKey('Escape');
    pressKey('a', { ctrlKey: true });
    expect(onClearSelection).not.toHaveBeenCalled();
    expect(onSelectAll).not.toHaveBeenCalled();
  });
});

describe('useSelectionShortcuts 文件系统键位超集（ADR-0052 合并 useFileSystemShortcuts）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  interface FsRenderOptions {
    enabledKeys?: SelectionShortcutKey[];
    canUndo?: boolean;
    canRedo?: boolean;
    canCopy?: boolean;
    canCut?: boolean;
    canPaste?: boolean;
    canRename?: boolean;
    withFsCallbacks?: boolean;
    containerRef?: RefObject<HTMLElement | null>;
    containerFocusMode?: ContainerFocusMode;
  }

  function renderFsShortcuts(initialProps: FsRenderOptions = {}) {
    const onClearSelection = vi.fn();
    const onSelectAll = vi.fn();
    const onUndo = vi.fn(() => Promise.resolve());
    const onRedo = vi.fn(() => Promise.resolve());
    const onCopy = vi.fn();
    const onCut = vi.fn();
    const onPaste = vi.fn(() => Promise.resolve());
    const onRenameSelected = vi.fn();
    const utils = renderHook(
      (props: FsRenderOptions) =>
        useSelectionShortcuts({
          enabled: true,
          enabledKeys: props.enabledKeys,
          containerRef: props.containerRef,
          containerFocusMode: props.containerFocusMode,
          onClearSelection,
          onSelectAll,
          onUndo: props.withFsCallbacks === false ? undefined : onUndo,
          onRedo: props.withFsCallbacks === false ? undefined : onRedo,
          onCopy: props.withFsCallbacks === false ? undefined : onCopy,
          onCut: props.withFsCallbacks === false ? undefined : onCut,
          onPaste: props.withFsCallbacks === false ? undefined : onPaste,
          onRenameSelected:
            props.withFsCallbacks === false ? undefined : onRenameSelected,
          canUndo: props.canUndo,
          canRedo: props.canRedo,
          canCopy: props.canCopy,
          canCut: props.canCut,
          canPaste: props.canPaste,
          canRename: props.canRename,
        }),
      {
        initialProps: {
          enabledKeys: initialProps.enabledKeys,
          containerRef: initialProps.containerRef,
          containerFocusMode: initialProps.containerFocusMode ?? 'strict',
          withFsCallbacks: initialProps.withFsCallbacks ?? true,
          canUndo: initialProps.canUndo ?? true,
          canRedo: initialProps.canRedo ?? true,
          canCopy: initialProps.canCopy ?? true,
          canCut: initialProps.canCut ?? true,
          canPaste: initialProps.canPaste ?? true,
          canRename: initialProps.canRename ?? true,
        },
      }
    );
    return {
      ...utils,
      onClearSelection,
      onSelectAll,
      onUndo,
      onRedo,
      onCopy,
      onCut,
      onPaste,
      onRenameSelected,
    };
  }

  it('Ctrl+Z 触发 undo 并阻止默认行为', () => {
    const { onUndo } = renderFsShortcuts();
    const notCanceled = pressKey('z', { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(false);
  });

  it('Ctrl+Shift+Z 与 Ctrl+Y 均触发 redo', () => {
    const { onRedo } = renderFsShortcuts();
    pressKey('z', { ctrlKey: true, shiftKey: true });
    pressKey('y', { ctrlKey: true });
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it('Ctrl+C / Ctrl+X / Ctrl+V 触发 copy / cut / paste', () => {
    const { onCopy, onCut, onPaste } = renderFsShortcuts();
    pressKey('c', { ctrlKey: true });
    pressKey('x', { ctrlKey: true });
    pressKey('v', { ctrlKey: true });
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCut).toHaveBeenCalledTimes(1);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('F2 触发重命名', () => {
    const { onRenameSelected } = renderFsShortcuts();
    const notCanceled = pressKey('F2');
    expect(onRenameSelected).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(false);
  });

  it('can* 守卫：false 时不触发对应键', () => {
    const { onUndo, onRedo, onCopy, onRenameSelected } = renderFsShortcuts({
      canUndo: false,
      canRedo: false,
      canCopy: false,
      canRename: false,
    });
    pressKey('z', { ctrlKey: true });
    pressKey('y', { ctrlKey: true });
    pressKey('c', { ctrlKey: true });
    pressKey('F2');
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onRenameSelected).not.toHaveBeenCalled();
  });

  it('未提供回调时（undefined）对应键不触发', () => {
    const { onUndo, onCopy, onRenameSelected } = renderFsShortcuts({
      withFsCallbacks: false,
    });
    pressKey('z', { ctrlKey: true });
    pressKey('c', { ctrlKey: true });
    pressKey('F2');
    expect(onUndo).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onRenameSelected).not.toHaveBeenCalled();
  });

  it('enabledKeys 子集只启用指定键', () => {
    const { onUndo, onCopy, onSelectAll } = renderFsShortcuts({
      enabledKeys: ['undo'],
    });
    pressKey('z', { ctrlKey: true });
    pressKey('c', { ctrlKey: true });
    pressKey('a', { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onSelectAll).not.toHaveBeenCalled();
  });

  it('containerRef 焦点限定：焦点在容器内触发，容器外不触发（strict 默认）', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const outside = document.createElement('div');
    outside.tabIndex = 0;
    document.body.appendChild(outside);
    const { onUndo } = renderFsShortcuts({
      containerRef: { current: container },
    });

    outside.focus();
    pressKey('z', { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();

    const inner = document.createElement('button');
    container.appendChild(inner);
    inner.focus();
    pressKey('z', { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
    document.body.removeChild(outside);
  });

  it('loose 模式：容器外导航焦点（侧边栏/顶栏）放行，快捷键照常触发', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const navLink = document.createElement('button');
    navLink.tabIndex = 0;
    document.body.appendChild(navLink);
    const { onUndo, onClearSelection } = renderFsShortcuts({
      containerRef: { current: container },
      containerFocusMode: 'loose',
    });

    navLink.focus();
    pressKey('z', { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    pressKey('Escape');
    expect(onClearSelection).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
    document.body.removeChild(navLink);
  });

  it('loose 模式：容器外模态浮层（弹窗/菜单）内焦点仍让位，防误触', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const modal = document.createElement('div');
    modal.className = 'modal-enter';
    const modalButton = document.createElement('button');
    modal.appendChild(modalButton);
    document.body.appendChild(modal);
    const { onUndo, onClearSelection } = renderFsShortcuts({
      containerRef: { current: container },
      containerFocusMode: 'loose',
    });

    modalButton.focus();
    pressKey('z', { ctrlKey: true });
    pressKey('Escape');
    expect(onUndo).not.toHaveBeenCalled();
    expect(onClearSelection).not.toHaveBeenCalled();

    document.body.removeChild(container);
    document.body.removeChild(modal);
  });

  it('Modal 打开时 Delete/F2 让位（防确认框叠加/二次触发）', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-enter';
    document.body.appendChild(modal);
    const { onRenameSelected } = renderFsShortcuts();

    pressKey('Delete');
    pressKey('F2');
    expect(onRenameSelected).not.toHaveBeenCalled();

    document.body.removeChild(modal);
  });

  it('输入框聚焦时超集键同样让位', () => {
    const { onUndo, onRenameSelected } = renderFsShortcuts();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    pressKey('z', { ctrlKey: true });
    pressKey('F2');
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRenameSelected).not.toHaveBeenCalled();
  });

  it('输入框失焦后 Ctrl+Z 恢复触发（点击列表 blur 滞留焦点 → 快捷键恢复）', () => {
    const { onUndo } = renderFsShortcuts();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    pressKey('z', { ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();

    // 模拟 useRubberBandSelection 的 blur：点击列表后焦点离开输入框
    input.blur();
    pressKey('z', { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);

    document.body.removeChild(input);
  });
});
