import { useEffect, useRef } from 'react';

export type SelectionShortcutKey =
  | 'clear'
  | 'select-all'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'rename';

/** 容器外焦点策略（见 UseSelectionShortcutsOptions.containerFocusMode） */
export type ContainerFocusMode = 'strict' | 'loose';

interface UseSelectionShortcutsOptions {
  /** 是否启用监听（页面不可见/无数据时关闭） */
  enabled?: boolean;
  /** 需要启用的键，缺省全部启用 */
  enabledKeys?: SelectionShortcutKey[];
  /**
   * 焦点限定容器：提供后仅当焦点元素在容器内（或为 body）时触发，
   * 防止全局监听抢走页面其他区域的快捷键（文件系统全屏页等）。
   */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * 容器外焦点策略（仅当传入 containerRef 时生效）：
   * - 'strict'（默认）：焦点必须在容器内（或 body）才响应 —— CAD 编辑器侧边栏等，
   *   避免画布编辑时误触发侧边栏操作。
   * - 'loose'：容器外焦点仅当处于模态浮层（弹窗/菜单/下拉）内时让位；
   *   侧边栏/顶栏等 Layout 常驻导航持焦点时照常响应 —— 文件系统/公共资源库等全屏页。
   *   修复「从导航点击跳转进入后快捷键全部失效」：点击导航后焦点停留在导航元素，
   *   而列表页框选 hook 的 mousedown preventDefault 阻止了点击列表项时焦点回落 body，
   *   导致 activeElement 恒在容器外、快捷键被整体拦截。
   */
  containerFocusMode?: ContainerFocusMode;
  /** ESC：清空选择（有 Modal 打开时跳过，避免抢 Modal 的关闭键） */
  onClearSelection: () => void;
  /** Ctrl/Cmd+A：全选（未提供时不监听该键——历史内核自带 Ctrl+A 时由外壳选择是否启用） */
  onSelectAll?: () => void;
  /** Delete/Del：删除选中（可触发确认弹窗） */
  onDeleteSelected?: () => void;
  /** Delete 可用守卫（如选中数 > 0） */
  canDelete?: boolean;
  // ---- 文件系统键位超集（ADR-0052 合并 useFileSystemShortcuts，均可选）----
  /** Ctrl/Cmd+Z：撤销（Shift → 重做） */
  onUndo?: () => void | Promise<void>;
  /** Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z：重做 */
  onRedo?: () => void | Promise<void>;
  /** Ctrl/Cmd+C：复制 */
  onCopy?: () => void;
  /** Ctrl/Cmd+X：剪切 */
  onCut?: () => void;
  /** Ctrl/Cmd+V：粘贴 */
  onPaste?: () => void | Promise<void>;
  /** F2：重命名选中 */
  onRenameSelected?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canCopy?: boolean;
  canCut?: boolean;
  canPaste?: boolean;
  canRename?: boolean;
}

/** 模态浮层选择器：弹窗（ui/Modal 根 .modal-enter）/ 菜单（Menu data-menu-content）/ Radix 下拉 /
 * 兼容 role="menu"（与 FileItem 点击守卫、useRubberBandSelection 让位保持一致） */
const FLOATING_LAYER_SELECTOR =
  '.modal-enter, [data-menu-content], [data-radix-popper-content-wrapper], [role="listbox"], [role="menu"]';

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (active.getAttribute('contenteditable') === 'true') return true;
  // Radix Select 弹出层/选项聚焦时让位（trigger 是 button，焦点不在 input 上，
  // 否则 Delete 会在筛选下拉聚焦时误触发批量删除）
  if (active.closest('[role="listbox"], [data-radix-popper-content-wrapper]'))
    return true;
  return false;
}

function isAnyModalOpen(): boolean {
  return document.querySelector('.modal-enter') !== null;
}

/** 焦点是否在模态浮层（弹窗/菜单/下拉）内——浮层内的容器外焦点一律让位，防误触列表操作 */
function isInFloatingLayer(el: Element): boolean {
  return el.closest(FLOATING_LAYER_SELECTOR) !== null;
}

/** 安全调用可能返回 Promise 的回调（原 useFileSystemShortcuts 的 onUndo/onRedo/onPaste 为 async） */
function invoke(
  cb: (() => void | Promise<void>) | undefined
): void {
  if (!cb) return;
  const result = cb();
  if (result && typeof (result as Promise<void>).catch === 'function') {
    (result as Promise<void>).catch(() => {});
  }
}

/**
 * useSelectionShortcuts - 多选列表通用快捷键外壳（超集）
 *
 * 统一承担全部列表/表格页面的快捷键（ADR-0052）：
 * - 选择类：ESC 清空 / Ctrl(+Cmd)+A 全选 / Delete 删除选中
 * - 文件系统类：Ctrl/Cmd+Z(±Shift)/Y 撤销重做 / Ctrl/Cmd+C/X/V 复制剪切粘贴 / F2 重命名
 *
 * 守卫：输入框/下拉聚焦让位、Modal 打开时 ESC 让位、可选的 containerRef 焦点限定、
 * 每个键独立的 can* 可用性守卫、enabledKeys 白名单。
 */
export function useSelectionShortcuts({
  enabled = true,
  enabledKeys,
  containerRef,
  containerFocusMode = 'strict',
  onClearSelection,
  onSelectAll,
  onDeleteSelected,
  canDelete = true,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onRenameSelected,
  canUndo = true,
  canRedo = true,
  canCopy = true,
  canCut = true,
  canPaste = true,
  canRename = true,
}: UseSelectionShortcutsOptions) {
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const onSelectAllRef = useRef(onSelectAll);
  onSelectAllRef.current = onSelectAll;
  const onDeleteSelectedRef = useRef(onDeleteSelected);
  onDeleteSelectedRef.current = onDeleteSelected;
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
  const onRenameSelectedRef = useRef(onRenameSelected);
  onRenameSelectedRef.current = onRenameSelected;

  const canDeleteRef = useRef(canDelete);
  canDeleteRef.current = canDelete;
  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;
  const canCopyRef = useRef(canCopy);
  canCopyRef.current = canCopy;
  const canCutRef = useRef(canCut);
  canCutRef.current = canCut;
  const canPasteRef = useRef(canPaste);
  canPasteRef.current = canPaste;
  const canRenameRef = useRef(canRename);
  canRenameRef.current = canRename;

  const enabledKeysRef = useRef(enabledKeys);
  enabledKeysRef.current = enabledKeys;

  const containerFocusModeRef = useRef(containerFocusMode);
  containerFocusModeRef.current = containerFocusMode;

  const isKeyEnabled = (key: SelectionShortcutKey): boolean =>
    !enabledKeysRef.current || enabledKeysRef.current.includes(key);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      if (containerRef?.current) {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          activeEl !== document.body &&
          !containerRef.current.contains(activeEl)
        ) {
          // 模态浮层（弹窗/菜单/下拉）内的容器外焦点：一律让位，防误触列表操作
          if (isInFloatingLayer(activeEl)) return;
          // 其余容器外焦点：strict 让位（焦点必须回到容器内）；
          // loose 放行 —— Layout 常驻导航持焦点时页面快捷键照常生效
          if (containerFocusModeRef.current !== 'loose') return;
        }
      }

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod) {
        switch (e.key.toLowerCase()) {
          case 'a': {
            if (!isKeyEnabled('select-all')) return;
            if (!onSelectAllRef.current) return;
            e.preventDefault();
            onSelectAllRef.current();
            return;
          }
          case 'z': {
            if (e.shiftKey) {
              if (!isKeyEnabled('redo')) return;
              if (!canRedoRef.current || !onRedoRef.current) return;
              e.preventDefault();
              invoke(onRedoRef.current);
            } else {
              if (!isKeyEnabled('undo')) return;
              if (!canUndoRef.current || !onUndoRef.current) return;
              e.preventDefault();
              invoke(onUndoRef.current);
            }
            return;
          }
          case 'y': {
            if (!isKeyEnabled('redo')) return;
            if (!canRedoRef.current || !onRedoRef.current) return;
            e.preventDefault();
            invoke(onRedoRef.current);
            return;
          }
          case 'c': {
            if (!isKeyEnabled('copy')) return;
            if (!canCopyRef.current || !onCopyRef.current) return;
            e.preventDefault();
            onCopyRef.current();
            return;
          }
          case 'x': {
            if (!isKeyEnabled('cut')) return;
            if (!canCutRef.current || !onCutRef.current) return;
            e.preventDefault();
            onCutRef.current();
            return;
          }
          case 'v': {
            if (!isKeyEnabled('paste')) return;
            if (!canPasteRef.current || !onPasteRef.current) return;
            e.preventDefault();
            invoke(onPasteRef.current);
            return;
          }
        }
        return;
      }

      switch (e.key) {
        case 'Escape': {
          if (!isKeyEnabled('clear')) return;
          if (isAnyModalOpen()) return;
          e.preventDefault();
          onClearSelectionRef.current();
          return;
        }
        case 'Delete':
        case 'Del': {
          if (!isKeyEnabled('delete')) return;
          // 弹窗打开时让位：loose 模式下焦点可能仍在导航（容器外非浮层），
          // 避免确认框叠加/二次触发批量删除
          if (isAnyModalOpen()) return;
          if (!onDeleteSelectedRef.current || !canDeleteRef.current) return;
          e.preventDefault();
          onDeleteSelectedRef.current();
          return;
        }
        case 'F2': {
          if (!isKeyEnabled('rename')) return;
          if (isAnyModalOpen()) return;
          if (!canRenameRef.current || !onRenameSelectedRef.current) return;
          e.preventDefault();
          onRenameSelectedRef.current();
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, containerRef]);
}
