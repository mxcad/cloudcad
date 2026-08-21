import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { SelectableTable } from './SelectableTable';

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
];

function renderTable(props: Partial<Parameters<typeof SelectableTable<Row>>[0]> = {}) {
  const onToggleSelect = vi.fn();
  const onToggleSelectAll = vi.fn();
  const onRubberBandSelect = vi.fn();
  const onPageChange = vi.fn();
  const utils = render(
    <SelectableTable<Row>
      rows={props.rows ?? ROWS}
      rowId={props.rowId}
      selectedIds={props.selectedIds ?? new Set()}
      loading={props.loading ?? false}
      loadingView={props.loadingView ?? <div>加载中...</div>}
      emptyView={props.emptyView ?? <div>暂无数据</div>}
      onToggleSelect={props.onToggleSelect ?? onToggleSelect}
      onToggleSelectAll={props.onToggleSelectAll ?? onToggleSelectAll}
      onRubberBandSelect={props.onRubberBandSelect ?? onRubberBandSelect}
      onPageChange={props.onPageChange ?? onPageChange}
      onScrollPageChange={props.onScrollPageChange}
      paginationMeta={
        'paginationMeta' in props
          ? props.paginationMeta
          : { total: 3, page: 1, limit: 20, totalPages: 1 }
      }
      selectedRowClassName={props.selectedRowClassName ?? 'row-selected'}
      renderHeader={() => (
        <>
          <th>名称</th>
        </>
      )}
      renderRow={(row) => (
        <>
          <td>{row.name}</td>
        </>
      )}
    />
  );
  return { ...utils, onToggleSelect, onToggleSelectAll, onRubberBandSelect, onPageChange };
}

/** mock 容器几何：200x200，item 覆盖首行区域（用于框选相交检测） */
function mockGeometry(containerEl: HTMLElement) {
  containerEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 }) as DOMRect;
  Object.defineProperty(containerEl, 'clientWidth', { value: 200, configurable: true });
  Object.defineProperty(containerEl, 'clientHeight', { value: 200, configurable: true });
  Object.defineProperty(containerEl, 'scrollWidth', { value: 200, configurable: true });
  Object.defineProperty(containerEl, 'scrollHeight', { value: 200, configurable: true });
  const rows = containerEl.querySelectorAll('tr[data-node-id]');
  rows.forEach((tr, i) => {
    tr.getBoundingClientRect = () =>
      ({
        left: 0,
        top: i * 30,
        right: 200,
        bottom: i * 30 + 30,
        width: 200,
        height: 30,
      }) as DOMRect;
  });
}

/** mock 滚动容器几何：rowsCount 行 × 30px、视口 200px，滚动到 scrollTop（滚动分页页码测量用） */
function mockScrollGeometry(
  containerEl: HTMLElement,
  rowsCount: number,
  scrollTop: number
) {
  containerEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) as DOMRect;
  Object.defineProperty(containerEl, 'clientWidth', { value: 400, configurable: true });
  Object.defineProperty(containerEl, 'clientHeight', { value: 200, configurable: true });
  Object.defineProperty(containerEl, 'scrollWidth', { value: 400, configurable: true });
  Object.defineProperty(containerEl, 'scrollHeight', {
    value: rowsCount * 30,
    configurable: true,
  });
  Object.defineProperty(containerEl, 'scrollTop', {
    value: scrollTop,
    configurable: true,
  });
  const rows = containerEl.querySelectorAll('tr[data-node-id]');
  rows.forEach((tr, i) => {
    tr.getBoundingClientRect = () =>
      ({
        left: 0,
        top: i * 30 - scrollTop,
        right: 400,
        bottom: i * 30 - scrollTop + 30,
        width: 400,
        height: 30,
      }) as DOMRect;
  });
}

describe('SelectableTable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('渲染表头（renderHeader）与行（renderRow），行带 data-node-id', () => {
    renderTable();
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    const tr = screen.getByText('Alpha').closest('tr');
    expect(tr?.getAttribute('data-node-id')).toBe('a');
  });

  it('行点击触发 onToggleSelect（透传 ctrl/shift）', () => {
    const { onToggleSelect } = renderTable();
    fireEvent.click(screen.getByText('Beta'));
    expect(onToggleSelect).toHaveBeenCalledWith('b', false, false);

    fireEvent.click(screen.getByText('Gamma'), { ctrlKey: true, shiftKey: true });
    expect(onToggleSelect).toHaveBeenLastCalledWith('c', true, true);
  });

  it('行内 checkbox 点击只触发勾选（不触发行点击选择）', () => {
    const { onToggleSelect } = renderTable();
    const checkbox = screen.getByText('Alpha').closest('tr')!.querySelector('input[type="checkbox"]')!;
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith('a', true);
  });

  it('表头全选 checkbox 触发 onToggleSelectAll', () => {
    const { onToggleSelectAll } = renderTable();
    const headerCheckbox = screen
      .getByText('名称')
      .closest('tr')!.querySelector('input[type="checkbox"]')!;
    fireEvent.click(headerCheckbox);
    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
  });

  it('选中行应用 selectedRowClassName', () => {
    renderTable({ selectedIds: new Set(['a']) });
    const tr = screen.getByText('Alpha').closest('tr')!;
    expect(tr.className).toContain('row-selected');
    const trB = screen.getByText('Beta').closest('tr')!;
    expect(trB.className).not.toContain('row-selected');
  });

  it('框选拖拽回调 onRubberBandSelect', () => {
    const { onRubberBandSelect } = renderTable();
    const scrollContainer = document.querySelector('[data-testid="selectable-table-scroll"]') as HTMLElement;
    mockGeometry(scrollContainer);
    fireEvent.mouseDown(scrollContainer, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(scrollContainer, { clientX: 200, clientY: 60, button: 0 });
    fireEvent.mouseUp(scrollContainer, { clientX: 200, clientY: 60, button: 0 });
    expect(onRubberBandSelect).toHaveBeenCalled();
    const ids = onRubberBandSelect.mock.calls[onRubberBandSelect.mock.calls.length - 1][0];
    expect(ids).toContain('a');
  });

  it('框选刚结束的 click 不误触发行选择（rubberBandJustEndedRef 守卫）', () => {
    const { onToggleSelect } = renderTable();
    const scrollContainer = document.querySelector('[data-testid="selectable-table-scroll"]') as HTMLElement;
    mockGeometry(scrollContainer);
    fireEvent.mouseDown(scrollContainer, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(scrollContainer, { clientX: 200, clientY: 60, button: 0 });
    fireEvent.mouseUp(scrollContainer, { clientX: 200, clientY: 60, button: 0 });
    // 框选结束后的 click（浏览器在 mouseup 后派发）
    fireEvent.click(screen.getByText('Alpha'));
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('按钮分页：有 paginationMeta 与 onPageChange 时渲染页脚', () => {
    const { onPageChange } = renderTable();
    const footer = document.querySelector('[data-testid="selectable-table-pagination"]');
    expect(footer).not.toBeNull();
    expect(onPageChange).toBeDefined();
  });

  it('无分页参数（按钮与滚动均缺省）时不渲染页脚', () => {
    const { container } = renderTable({ paginationMeta: null, onPageChange: undefined });
    expect(container.querySelector('[data-testid="selectable-table-pagination"]')).toBeNull();
  });

  it('loading 且无数据时渲染 loadingView', () => {
    renderTable({ rows: [], loading: true, loadingView: <div>加载中...</div> });
    expect(screen.getByText('加载中...')).toBeTruthy();
  });

  it('空数据时渲染 emptyView', () => {
    renderTable({ rows: [], emptyView: <div>暂无数据</div> });
    expect(screen.getByText('暂无数据')).toBeTruthy();
  });

  it('滚动分页模式：传 onScrollPageChange 时滚动容器挂载', () => {
    const { container } = renderTable({
      onScrollPageChange: vi.fn(),
    });
    const scroll = container.querySelector(
      '[data-testid="selectable-table-scroll"]'
    )!;
    expect(scroll).not.toBeNull();
    // relative：框选 overlay 以滚动容器为 containing block（缺省导致选区偏移）
    expect(scroll.className).toContain('relative');
  });

  it('滚动分页：页脚页码跟随视口所在页（tbody 测量），而非最近请求页', async () => {
    // 根因回归：itemContainerRef 曾挂 <table>（children=[thead,tbody] 与行数不匹配），
    // 测量恒放弃、页脚回退请求页 → 滚动加载时页码随请求页预跳（用户管理页现象）。
    // 修复后挂 <tbody>（children=tr 与行一一对应），页脚显示视口所在页。
    // Pagination 按容器宽度决定布局：mock 宽度使页码按钮渲染（full 布局）
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 800,
    });
    try {
      const rows60 = Array.from({ length: 60 }, (_, i) => ({
        id: `u${i}`,
        name: `User${i}`,
      }));
      const { container } = renderTable({
        rows: rows60,
        onScrollPageChange: vi.fn(),
        paginationMeta: { total: 60, page: 3, limit: 20, totalPages: 3 },
      });
      const scrollContainer = container.querySelector(
        '[data-testid="selectable-table-scroll"]'
      ) as HTMLElement;
      // 视口滚到中部（行 21~27 可见 = 第 2 页内容区），请求页已是 3
      mockScrollGeometry(scrollContainer, 60, 650);
      await act(async () => {
        fireEvent.scroll(scrollContainer);
        // 页码测量已 rAF 节流：flush 一帧让指示器更新
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      // 高亮（font-bold）页码应显示视口所在页 2，而非请求页 3
      const activeBtn = container.querySelector('button.font-bold');
      expect(activeBtn?.textContent).toBe('2');
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: unknown }).clientWidth;
    }
  });

  it('rowId 自定义：非 id 字段（如 token/name）作为选择 id 与 data-node-id', () => {
    const onToggleSelect = vi.fn();
    const { container } = renderTable({
      rows: [
        { id: 'r1', name: 'TokenA' },
        { id: 'r2', name: 'TokenB' },
      ],
      rowId: (r) => r.name,
      onToggleSelect,
    });
    const trA = screen.getByText('TokenA').closest('tr')!;
    expect(trA.getAttribute('data-node-id')).toBe('TokenA');

    fireEvent.click(trA);
    expect(onToggleSelect).toHaveBeenCalledWith('TokenA', false, false);
    expect(container.querySelectorAll('tr[data-node-id]').length).toBe(2);
  });
});
