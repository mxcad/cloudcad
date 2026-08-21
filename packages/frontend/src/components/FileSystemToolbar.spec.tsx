import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileSystemToolbar } from './FileSystemToolbar';

const baseProps = {
  searchTerm: '',
  onSearchChange: vi.fn(),
  onSearchSubmit: vi.fn(),
  viewMode: 'list' as const,
  onViewModeChange: vi.fn(),
  loading: false,
  isTrashView: false,
};

describe('FileSystemToolbar 撤销/重做按钮', () => {
  it('不传 onUndo/onRedo 时不渲染按钮（复用方零改动）', () => {
    render(<FileSystemToolbar {...baseProps} />);
    expect(screen.queryByLabelText('撤销')).toBeNull();
    expect(screen.queryByLabelText('重做')).toBeNull();
  });

  it('传入回调时渲染撤销/重做按钮并可点击', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <FileSystemToolbar
        {...baseProps}
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
      />
    );
    fireEvent.click(screen.getByLabelText('撤销'));
    fireEvent.click(screen.getByLabelText('重做'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('canUndo/canRedo=false 时按钮禁用', () => {
    render(
      <FileSystemToolbar
        {...baseProps}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />
    );
    expect(screen.getByLabelText('撤销')).toBeDisabled();
    expect(screen.getByLabelText('重做')).toBeDisabled();
  });
});
