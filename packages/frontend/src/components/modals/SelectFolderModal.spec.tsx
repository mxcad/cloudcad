///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SelectFolderModal } from './SelectFolderModal';

vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
      : m,
}));

vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn((_e: unknown, ctx: string) => new Error(ctx)),
}));

// 跨项目转移：源为项目、目标为项目时查询 settings；本测试源=目标（同项目），
// evaluate 不会被调用到禁止分支 → 返回乐观 allowed
vi.mock('@/lib/crossProjectPaste', () => ({
  evaluateCrossProjectTransfer: vi.fn(() => ({
    allowed: true,
    reasonKey: null,
  })),
  fetchProjectTransferSettings: vi.fn(async () => ({
    transferInFromProject: 'ALL',
    transferOutToProject: 'ALL',
  })),
}));

// FileTree 桩：渲染可点击的文件夹行（onSelect 与真实 FileTree 一致，回传节点对象）
vi.mock('@/components/ui/FileTree', () => ({
  FileTree: ({ nodes, onSelect }: { nodes: { id: string; name: string }[]; onSelect: (node: { id: string; name: string }) => void }) => (
    <div>
      {nodes.map((n) => (
        <button key={n.id} data-testid={`folder-${n.id}`} onClick={() => onSelect(n)}>
          {n.name}
        </button>
      ))}
    </div>
  ),
}));

const mkChildren = vi.fn();
const mkCreateFolder = vi.fn();
const mkCreateProject = vi.fn();
vi.mock('@/api-sdk', () => ({
  nodeControllerGetChildren: (...args: unknown[]) => mkChildren(...args),
  nodeControllerCreateFolder: (...args: unknown[]) =>
    mkCreateFolder(...args),
  projectControllerCreateProject: (...args: unknown[]) =>
    mkCreateProject(...args),
}));

describe('SelectFolderModal 复制到根目录（P1-1 回归）', () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mkChildren.mockResolvedValue({
      data: {
        nodes: [
          { id: 'folder-1', name: '文件夹A', isFolder: true, isRoot: false },
        ],
      },
    });
  });

  it('打开时根目录默认选中，确认按钮可用', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(mkChildren).toHaveBeenCalled());
    const confirm = screen.getByRole('button', { name: /确认/ });
    expect(confirm).not.toBeDisabled();
  });

  it('点击已默认选中的根目录行不取消选中，确认仍回调 projectId（旧代码会切掉选中态致静默失败）', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(mkChildren).toHaveBeenCalled());

    // 根目录行（activeRootName 缺省为 t('根目录')='根目录'，行内含「保存到根目录」提示）
    const rootRow = screen.getByText('保存到根目录').closest('div') as HTMLElement;
    expect(rootRow).toBeTruthy();
    fireEvent.click(rootRow);

    // 关键回归断言：点击后确认仍可用（旧 toggle 逻辑会置 null → disabled → 点击静默）
    const confirm = screen.getByRole('button', { name: /确认/ });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('proj-root', undefined);
  });

  it('先点文件夹再点根目录，确认回调根目录 id', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(screen.getByTestId('folder-folder-1')).toBeTruthy());

    fireEvent.click(screen.getByTestId('folder-folder-1'));
    const rootRow = screen.getByText('保存到根目录').closest('div') as HTMLElement;
    fireEvent.click(rootRow);

    fireEvent.click(screen.getByRole('button', { name: /确认/ }));
    expect(onConfirm).toHaveBeenCalledWith('proj-root', undefined);
  });
});

describe('SelectFolderModal 选择界面内新建文件夹', () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mkChildren.mockResolvedValue({
      data: {
        nodes: [
          { id: 'folder-1', name: '文件夹A', isFolder: true, isRoot: false },
        ],
      },
    });
    mkCreateFolder.mockResolvedValue({
      data: {
        id: 'new-folder-1',
        name: '新文件夹',
        isFolder: true,
        isRoot: false,
      },
    });
  });

  it('点击「新建文件夹」出现输入框；空名称时创建按钮禁用', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(mkChildren).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /新建文件夹/ }));
    const input = screen.getByPlaceholderText('请输入文件夹名称');
    const createBtn = screen.getByRole('button', { name: '创建' });
    expect(createBtn).toBeDisabled();
  });

  it('默认选中根目录时创建：父目录为项目根，新节点被自动选中', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(mkChildren).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /新建文件夹/ }));
    fireEvent.change(screen.getByPlaceholderText('请输入文件夹名称'), {
      target: { value: '新文件夹' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(mkCreateFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { parentId: 'proj-root' },
          body: { name: '新文件夹' },
        })
      )
    );
    // 新节点自动选中：确认回调返回新文件夹 id
    fireEvent.click(screen.getByRole('button', { name: /确认/ }));
    expect(onConfirm).toHaveBeenCalledWith('new-folder-1', '新文件夹');
  });

  it('选中子文件夹后创建：父目录为子文件夹 id', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(screen.getByTestId('folder-folder-1')).toBeTruthy());

    fireEvent.click(screen.getByTestId('folder-folder-1'));
    fireEvent.click(screen.getByRole('button', { name: /新建文件夹/ }));
    fireEvent.change(screen.getByPlaceholderText('请输入文件夹名称'), {
      target: { value: '子级新文件夹' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(mkCreateFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { parentId: 'folder-1' },
          body: { name: '子级新文件夹' },
        })
      )
    );
  });
});

describe('SelectFolderModal 根切换器新建项目', () => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const roots = [
    { id: 'personal', name: '', kind: 'personal-space' as const },
    { id: 'proj-a', name: '项目A', kind: 'project' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mkChildren.mockResolvedValue({ data: { nodes: [] } });
    mkCreateProject.mockResolvedValue({
      data: { id: 'new-proj-1', name: '新项目X' },
    });
  });

  it('单根（无 roots）不显示「新建项目」入口', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        projectId="proj-root"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(mkChildren).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /新建项目/ })).toBeNull();
  });

  it('多根时创建项目：新项目成为活动根，确认回调新项目 id', async () => {
    render(
      <SelectFolderModal
        isOpen
        currentNodeId="src-file"
        roots={roots}
        sourceProjectId="proj-a"
        operation="move"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    await waitFor(() => expect(mkChildren).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    fireEvent.change(screen.getByPlaceholderText('请输入项目名称'), {
      target: { value: '新项目X' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(mkCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({ body: { name: '新项目X' } })
      )
    );
    // 新项目根 chip 出现（本地追加，不依赖父组件刷新）；
    // 名称同时出现在根 chip 与「保存到根目录」行的根名称中，故用 getAllByText
    await waitFor(() =>
      expect(screen.getAllByText('新项目X').length).toBeGreaterThan(0)
    );

    fireEvent.click(screen.getByRole('button', { name: /确认/ }));
    expect(onConfirm).toHaveBeenCalledWith('new-proj-1', undefined);
  });
});
