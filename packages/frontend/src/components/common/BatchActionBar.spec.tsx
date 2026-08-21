import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Trash2, Scissors, Clipboard } from 'lucide-react';
import { BatchActionBar } from './BatchActionBar';

describe('BatchActionBar', () => {
  it('显示选中计数（文字 + 数字角标）', () => {
    render(<BatchActionBar count={3} onClear={vi.fn()} actions={[]} />);
    // 文字计数
    expect(screen.getByText(/已选.*3.*项/)).toBeTruthy();
    // 数字角标
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('数字角标超过 99 显示 99+', () => {
    render(<BatchActionBar count={120} onClear={vi.fn()} actions={[]} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('胶囊形态容器', () => {
    const { container } = render(
      <BatchActionBar count={1} onClear={vi.fn()} actions={[]} />
    );
    const pill = container.querySelector('.rounded-full.shadow-2xl');
    expect(pill).not.toBeNull();
  });

  it('渲染动作按钮并触发 onClick', () => {
    const onDelete = vi.fn();
    render(
      <BatchActionBar
        count={2}
        onClear={vi.fn()}
        actions={[
          {
            key: 'delete',
            label: '批量删除',
            icon: Trash2,
            variant: 'danger',
            onClick: onDelete,
          },
        ]}
      />
    );
    fireEvent.click(screen.getByText('批量删除'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disabled 动作不触发 onClick', () => {
    const onDelete = vi.fn();
    render(
      <BatchActionBar
        count={1}
        onClear={vi.fn()}
        actions={[
          {
            key: 'delete',
            label: '批量删除',
            variant: 'danger',
            disabled: true,
            onClick: onDelete,
          },
        ]}
      />
    );
    const btn = screen.getByText('批量删除').closest('button')!;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('count=0（剪贴板模式）不渲染动作按钮，只渲染剪贴板区与取消', () => {
    const { container } = render(
      <BatchActionBar
        count={0}
        onClear={vi.fn()}
        actions={[
          {
            key: 'delete',
            label: '批量删除',
            variant: 'danger',
            onClick: vi.fn(),
          },
        ]}
        clipboard={{
          items: ['node-1'],
          canPaste: true,
          onPaste: vi.fn(),
          onClear: vi.fn(),
        }}
      />
    );
    // 无选中：剪切/复制/删除等动作按钮不显示
    expect(screen.queryByText('批量删除')).toBeNull();
    // 剪贴板区（粘贴 + 清空）+ 取消
    expect(screen.getByText('粘贴')).toBeTruthy();
    const btns = container.querySelectorAll('button');
    expect(btns.length).toBe(3);
  });

  it('icon-only 动作渲染按钮但不渲染文本（tooltip 模式）', () => {
    const onMove = vi.fn();
    const { container } = render(
      <BatchActionBar
        count={1}
        onClear={vi.fn()}
        actions={[
          { key: 'move', icon: Scissors, tooltip: '移动到分类', onClick: onMove },
        ]}
      />
    );
    expect(screen.queryByText('移动到分类')).toBeNull();
    const btns = container.querySelectorAll('button');
    expect(btns.length).toBe(2); // 动作 + 取消
    fireEvent.click(btns[0]);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('取消按钮触发 onClear', () => {
    const onClear = vi.fn();
    render(<BatchActionBar count={1} onClear={onClear} actions={[]} />);
    fireEvent.click(screen.getByText('取消选择'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('空动作列表只渲染计数与取消', () => {
    const { container } = render(
      <BatchActionBar count={1} onClear={vi.fn()} actions={[]} />
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
  });

  it('全选 Checkbox：渲染并触发 onSelectAll', () => {
    const onSelectAll = vi.fn();
    const { container } = render(
      <BatchActionBar
        count={1}
        onClear={vi.fn()}
        actions={[]}
        selectAllChecked={false}
        onSelectAll={onSelectAll}
      />
    );
    const input = container.querySelector('input[type="checkbox"]')!;
    expect(input).not.toBeNull();
    fireEvent.click(input);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('剪贴板区：粘贴按钮 + 数量角标 + 清空', () => {
    const onPaste = vi.fn();
    const onClearClipboard = vi.fn();
    const { container } = render(
      <BatchActionBar
        count={0}
        onClear={vi.fn()}
        actions={[]}
        clipboard={{
          items: ['node-1', 'node-2'],
          canPaste: true,
          onPaste,
          onClear: onClearClipboard,
        }}
      />
    );
    fireEvent.click(screen.getByText('粘贴'));
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2')).toBeTruthy(); // 剪贴板数量角标
    const btns = container.querySelectorAll('button');
    expect(btns.length).toBe(3); // 粘贴 + 清空 + 取消
    fireEvent.click(btns[1]);
    expect(onClearClipboard).toHaveBeenCalledTimes(1);
  });

  it('剪贴板区 canPaste=false 时粘贴禁用', () => {
    render(
      <BatchActionBar
        count={0}
        onClear={vi.fn()}
        actions={[]}
        clipboard={{ items: [], canPaste: false, onPaste: vi.fn(), onClear: vi.fn() }}
      />
    );
    const btn = screen.getByText('粘贴').closest('button')!;
    expect(btn.disabled).toBe(true);
  });

  it('自定义 label 渲染', () => {
    render(
      <BatchActionBar
        count={5}
        onClear={vi.fn()}
        actions={[]}
        label={(count) => `共选中 ${count} 个文件`}
      />
    );
    expect(screen.getByText('共选中 5 个文件')).toBeTruthy();
  });
});
