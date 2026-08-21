import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useRubberBandSelection } from './useRubberBandSelection';

/**
 * 测试 Harness：把 hook 的滚动容器 + mouse handlers 挂到真实 DOM，
 * 模拟真实页面接线（FileListGrid / ShareTable / FontLibrary 同款）。
 */
function Harness({
  onRubberBandSelect,
}: {
  onRubberBandSelect?: (ids: string[]) => void;
}) {
  const {
    scrollContainerRef,
    isRubberBanding,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    rubberBandOverlay,
    rubberBandJustEndedRef,
  } = useRubberBandSelection({ onRubberBandSelect });
  return (
    <div
      ref={scrollContainerRef}
      data-testid="container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <div data-node-id="a">Item A</div>
      <div data-node-id="b">Item B</div>
      <span data-testid="banding">{String(isRubberBanding)}</span>
      <span data-testid="just-ended">
        {String(rubberBandJustEndedRef.current)}
      </span>
      {rubberBandOverlay}
    </div>
  );
}

/**
 * mock 容器与行元素的几何信息：
 * - 容器 200x200（left/top 0），无滚动条（scrollHeight === clientHeight）
 * - item a 覆盖 (0,0)-(50,50)，item b 覆盖 (60,0)-(110,50)
 */
function mockGeometry() {
  const container = screen.getByTestId('container');
  container.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(container, 'clientWidth', { value: 200, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
  Object.defineProperty(container, 'scrollWidth', { value: 200, configurable: true });
  Object.defineProperty(container, 'scrollHeight', { value: 200, configurable: true });

  const rects: Record<string, DOMRect> = {
    a: {
      left: 0,
      top: 0,
      right: 50,
      bottom: 50,
      width: 50,
      height: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect,
    b: {
      left: 60,
      top: 0,
      right: 110,
      bottom: 50,
      width: 50,
      height: 50,
      x: 60,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect,
  };
  container.querySelectorAll('[data-node-id]').forEach((el) => {
    const id = el.getAttribute('data-node-id');
    if (id && rects[id]) {
      el.getBoundingClientRect = () => rects[id];
    }
  });
}

function renderHarness(onRubberBandSelect?: (ids: string[]) => void) {
  const cb = onRubberBandSelect ?? vi.fn();
  const utils = render(<Harness onRubberBandSelect={cb} />);
  mockGeometry();
  return { ...utils, onRubberBandSelect: cb };
}

/** 在容器内按 (x, y) 按下并拖拽到 (x2, y2) 后松开 */
function drag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  init: MouseEventInit = {}
) {
  const container = screen.getByTestId('container');
  fireEvent.mouseDown(container, {
    clientX: from.x,
    clientY: from.y,
    button: 0,
    ...init,
  });
  fireEvent.mouseMove(container, {
    clientX: to.x,
    clientY: to.y,
    button: 0,
    ...init,
  });
  fireEvent.mouseUp(container, {
    clientX: to.x,
    clientY: to.y,
    button: 0,
    ...init,
  });
}

describe('useRubberBandSelection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('框选启动防护（统一根治"框选拖动其他元素"）', () => {
    it('启动框选时 preventDefault（阻止文本选择与原生元素拖拽）', () => {
      renderHarness();
      const container = screen.getByTestId('container');
      // fireEvent 返回 false 表示默认行为已被 preventDefault
      const notCanceled = fireEvent.mouseDown(container, {
        clientX: 100,
        clientY: 100,
        button: 0,
      });
      expect(notCanceled).toBe(false);
      expect(screen.getByTestId('banding').textContent).toBe('true');
    });

    it('mousedown 在 input/checkbox 上不启动框选且不 preventDefault（可正常交互）', () => {
      const { container } = renderHarness();
      const input = document.createElement('input');
      input.type = 'checkbox';
      container.querySelector('[data-testid="container"]')!.appendChild(input);
      const notCanceled = fireEvent.mouseDown(input, {
        clientX: 10,
        clientY: 10,
        button: 0,
      });
      expect(notCanceled).toBe(true);
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('mousedown 在 textarea/select/contenteditable 上同样让位', () => {
      const { container } = renderHarness();
      const containerEl = container.querySelector('[data-testid="container"]')!;
      const textarea = document.createElement('textarea');
      containerEl.appendChild(textarea);
      expect(
        fireEvent.mouseDown(textarea, { clientX: 5, clientY: 5, button: 0 })
      ).toBe(true);

      const select = document.createElement('select');
      containerEl.appendChild(select);
      expect(
        fireEvent.mouseDown(select, { clientX: 5, clientY: 5, button: 0 })
      ).toBe(true);

      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      containerEl.appendChild(editable);
      expect(
        fireEvent.mouseDown(editable, { clientX: 5, clientY: 5, button: 0 })
      ).toBe(true);
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('纵向滚动条区域点击不启动框选（preventDefault 不破坏滚动条拖动）', () => {
      renderHarness();
      const container = screen.getByTestId('container');
      // 内容超高 → 出现纵向滚动条，滚动条占据 clientWidth 右侧
      Object.defineProperty(container, 'scrollHeight', {
        value: 400,
        configurable: true,
      });
      const notCanceled = fireEvent.mouseDown(container, {
        clientX: 210,
        clientY: 50,
        button: 0,
      });
      expect(notCanceled).toBe(true);
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('横向滚动条区域点击不启动框选', () => {
      renderHarness();
      const container = screen.getByTestId('container');
      Object.defineProperty(container, 'scrollWidth', {
        value: 400,
        configurable: true,
      });
      const notCanceled = fireEvent.mouseDown(container, {
        clientX: 50,
        clientY: 210,
        button: 0,
      });
      expect(notCanceled).toBe(true);
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('非左键点击不启动框选', () => {
      renderHarness();
      const container = screen.getByTestId('container');
      fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 2 });
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('Ctrl/Shift/Meta 按下时不启动框选（让位区间选择/拖拽语义）', () => {
      renderHarness();
      const container = screen.getByTestId('container');
      fireEvent.mouseDown(container, {
        clientX: 100,
        clientY: 100,
        button: 0,
        ctrlKey: true,
      });
      fireEvent.mouseDown(container, {
        clientX: 100,
        clientY: 100,
        button: 0,
        shiftKey: true,
      });
      fireEvent.mouseDown(container, {
        clientX: 100,
        clientY: 100,
        button: 0,
        metaKey: true,
      });
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('data-drag-handle 上按下不启动框选（拖拽手柄让位）', () => {
      const { container } = renderHarness();
      const handle = document.createElement('div');
      handle.setAttribute('data-drag-handle', 'true');
      container.querySelector('[data-testid="container"]')!.appendChild(handle);
      fireEvent.mouseDown(handle, { clientX: 5, clientY: 5, button: 0 });
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('菜单元素上按下不启动框选', () => {
      const { container } = renderHarness();
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      container.querySelector('[data-testid="container"]')!.appendChild(menu);
      fireEvent.mouseDown(menu, { clientX: 5, clientY: 5, button: 0 });
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });

    it('点击列表时聚焦中的输入框失焦（preventDefault 后主动 blur，恢复全局快捷键）', () => {
      const { container } = renderHarness();
      // 模拟搜索框聚焦：mousedown preventDefault 会阻止浏览器默认焦点转移，
      // 若不主动 blur，焦点滞留 input 导致 useSelectionShortcuts 的 isInputFocused() 让位
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);

      const containerEl = container.querySelector('[data-testid="container"]')!;
      fireEvent.mouseDown(containerEl, { clientX: 100, clientY: 100, button: 0 });

      expect(document.activeElement).toBe(document.body);
      // 框选不受影响（仅焦点变化）
      expect(screen.getByTestId('banding').textContent).toBe('true');
    });

    it('焦点本在 body 时点击列表不误伤（无 activeElement 可 blur）', () => {
      const { container } = renderHarness();
      document.body.focus();
      const containerEl = container.querySelector('[data-testid="container"]')!;
      fireEvent.mouseDown(containerEl, { clientX: 100, clientY: 100, button: 0 });
      expect(document.activeElement).toBe(document.body);
      expect(screen.getByTestId('banding').textContent).toBe('true');
    });
  });

  describe('框选行为', () => {
    it('拖拽 >=5px 松开时按矩形相交回调选中项，并设置 justEnded 防 click 误触发', () => {
      const { onRubberBandSelect } = renderHarness();
      drag({ x: 10, y: 10 }, { x: 50, y: 50 });
      expect(onRubberBandSelect).toHaveBeenCalled();
      const lastCall =
        onRubberBandSelect.mock.calls[onRubberBandSelect.mock.calls.length - 1][0];
      expect(lastCall).toContain('a');
      expect(lastCall).not.toContain('b');
      expect(screen.getByTestId('just-ended').textContent).toBe('true');
    });

    it('位移 <5px 视为点击，不触发 justEnded', () => {
      const { onRubberBandSelect } = renderHarness();
      const container = screen.getByTestId('container');
      fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseUp(container, { clientX: 102, clientY: 101, button: 0 });
      expect(onRubberBandSelect).not.toHaveBeenCalled();
      expect(screen.getByTestId('just-ended').textContent).toBe('false');
    });

    it('框选进行中渲染绝对定位 overlay 选区', () => {
      renderHarness();
      const container = screen.getByTestId('container');
      fireEvent.mouseDown(container, { clientX: 10, clientY: 10, button: 0 });
      const overlay = container.querySelector('div[style*="position: absolute"]');
      expect(overlay).not.toBeNull();
      fireEvent.mouseUp(container, { clientX: 50, clientY: 50, button: 0 });
      expect(container.querySelector('div[style*="position: absolute"]')).toBeNull();
    });

    it('window 上 mouseup 同样结束框选（拖出容器后松开）', () => {
      const { onRubberBandSelect } = renderHarness();
      const container = screen.getByTestId('container');
      fireEvent.mouseDown(container, { clientX: 10, clientY: 10, button: 0 });
      fireEvent.mouseMove(container, { clientX: 50, clientY: 50, button: 0 });
      fireEvent.mouseUp(window, { clientX: 50, clientY: 50, button: 0 });
      expect(onRubberBandSelect).toHaveBeenCalled();
      expect(screen.getByTestId('banding').textContent).toBe('false');
    });
  });
});
