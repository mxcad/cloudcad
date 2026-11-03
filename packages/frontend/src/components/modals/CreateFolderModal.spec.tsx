import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateFolderModal } from './CreateFolderModal';

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

function renderModal(overrides: Record<string, unknown> = {}) {
  const props = {
    isOpen: true,
    folderName: '双击测试',
    loading: false,
    onClose: vi.fn(),
    onFolderNameChange: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<CreateFolderModal {...(props as never)} />);
}

describe('CreateFolderModal — 提交防重（BUG-FS-01）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('快速双击「创建」只触发一次 onCreate', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderModal({ onCreate });
    const btn = screen.getByRole('button', { name: '创建' });
    // 模拟快速双击：两次 click 同步连续触发
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('Enter + 按钮连续触发只调用一次 onCreate', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderModal({ onCreate });
    const btn = screen.getByRole('button', { name: '创建' });
    fireEvent.click(btn);
    const input = screen.getByPlaceholderText('请输入文件夹名称');
    fireEvent.keyPress(input, { key: 'Enter', charCode: 13 });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('loading=true 时点击「创建」不触发 onCreate', () => {
    const onCreate = vi.fn();
    renderModal({ loading: true, onCreate });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('onCreate 完成后（Promise resolve）可再次提交', async () => {
    let resolveCreate: () => void;
    const onCreate = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveCreate = resolve;
          })
      );
    renderModal({ onCreate });
    const btn = screen.getByRole('button', { name: '创建' });
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledTimes(1);
    // 提交中再次点击被锁
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledTimes(1);
    // 完成后释放锁，可再次提交
    resolveCreate!();
    await Promise.resolve();
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledTimes(2);
  });
});
