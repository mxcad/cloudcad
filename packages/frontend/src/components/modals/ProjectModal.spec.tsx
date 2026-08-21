import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectModal } from './ProjectModal';
import type { FileSystemNode } from '@/types/filesystem';

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

const editProject = {
  id: 'p1',
  name: '项目A',
  description: '',
} as unknown as FileSystemNode;

function renderModal(overrides: Record<string, unknown> = {}) {
  const props = {
    isOpen: true,
    editingProject: editProject,
    formData: { name: '项目A', description: '' },
    loading: false,
    onClose: vi.fn(),
    onFormDataChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return render(<ProjectModal {...(props as never)} />);
}

describe('ProjectModal — 跨项目转移设置区块', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('创建模式：不显示跨项目转移区块', () => {
    renderModal({ editingProject: null });
    expect(screen.queryByText('跨项目转移')).toBeNull();
  });

  it('编辑模式但无管理权限：不显示跨项目转移区块', () => {
    renderModal({ canManageTransferSettings: false });
    expect(screen.queryByText('跨项目转移')).toBeNull();
  });

  it('编辑模式且有管理权限：显示 6 个方向的下拉', () => {
    renderModal({
      canManageTransferSettings: true,
      onTransferSettingsChange: vi.fn(),
      transferSettings: {
        transferOutToProject: 'ALL',
        transferOutToPersonalSpace: 'NONE',
        transferOutToLibrary: 'COPY_ONLY',
        transferInFromProject: 'ALL',
        transferInFromPersonalSpace: 'ALL',
        transferInFromLibrary: 'ALL',
      },
    });
    expect(screen.getByText('跨项目转移')).toBeTruthy();
    expect(screen.getByText('移出到其他项目')).toBeTruthy();
    expect(screen.getByText('移出到个人空间')).toBeTruthy();
    expect(screen.getByText('移出到公共库')).toBeTruthy();
    expect(screen.getByText('从其他项目移入')).toBeTruthy();
    expect(screen.getByText('从个人空间移入')).toBeTruthy();
    expect(screen.getByText('从公共库移入')).toBeTruthy();
  });

  it('变更方向设置：即时触发 onTransferSettingsChange（部分更新）', () => {
    const onChange = vi.fn();
    renderModal({
      canManageTransferSettings: true,
      onTransferSettingsChange: onChange,
      transferSettings: {
        transferOutToProject: 'ALL',
        transferOutToPersonalSpace: 'NONE',
        transferOutToLibrary: 'COPY_ONLY',
        transferInFromProject: 'ALL',
        transferInFromPersonalSpace: 'ALL',
        transferInFromLibrary: 'ALL',
      },
    });
    // 触发「移出到个人空间」下拉变更：点击第 2 个下拉 → 选择「仅复制」
    const selects = screen.getAllByRole('combobox');
    fireEvent.click(selects[1] as HTMLElement);
    const options = screen.getAllByRole('option');
    const copyOnlyOption = options.find((o) => o.textContent === '仅复制');
    expect(copyOnlyOption).toBeTruthy();
    fireEvent.click(copyOnlyOption as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ transferOutToPersonalSpace: 'COPY_ONLY' })
    );
  });

  it('回归：transferSettings 传入整个 FileSystemNode 时，变更回调只序列化 6 个转移字段（防 forbidNonWhitelisted）', () => {
    const onChange = vi.fn();
    const fullNode = {
      id: 'p1',
      name: '项目A',
      type: 'project',
      parentId: 'root',
      createdAt: '2026-01-01',
      transferOutToProject: 'ALL',
    } as unknown as FileSystemNode;
    renderModal({
      canManageTransferSettings: true,
      onTransferSettingsChange: onChange,
      transferSettings: fullNode,
    });
    // 触发「移出到个人空间」下拉变更 → 选择「仅复制」
    const selects = screen.getAllByRole('combobox');
    fireEvent.click(selects[1] as HTMLElement);
    const options = screen.getAllByRole('option');
    const copyOnlyOption = options.find((o) => o.textContent === '仅复制');
    expect(copyOnlyOption).toBeTruthy();
    fireEvent.click(copyOnlyOption as HTMLElement);

    expect(onChange).toHaveBeenCalledTimes(1);
    const sent = onChange.mock.calls[0][0] as Record<string, unknown>;
    // 不得包含 FileSystemNode 的非转移字段，否则后端 UpdateTransferSettingsDto
    // 的 forbidNonWhitelisted 会拒绝 → "请求参数验证失败"
    expect(sent).not.toHaveProperty('id');
    expect(sent).not.toHaveProperty('name');
    expect(sent).not.toHaveProperty('type');
    expect(sent).not.toHaveProperty('parentId');
    expect(sent).not.toHaveProperty('createdAt');
    // 已存在的转移字段被保留，且新增变更生效
    expect(sent).toEqual({
      transferOutToProject: 'ALL',
      transferOutToPersonalSpace: 'COPY_ONLY',
    });
  });
});
