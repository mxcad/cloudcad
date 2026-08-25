import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { SelectFileModal } from './SelectFileModal';

// ---- mock API SDK ----
vi.mock('@/api-sdk', () => ({
  nodeControllerSearch: vi.fn(),
  projectControllerGetPersonalSpace: vi.fn(),
  projectControllerGetProjects: vi.fn(),
  nodeControllerGetChildren: vi.fn(),
}));

import {
  projectControllerGetPersonalSpace,
  projectControllerGetProjects,
  nodeControllerGetChildren,
} from '@/api-sdk';

// ---- mock UI 组件 ----
vi.mock('../ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    title,
    footer,
  }: {
    isOpen?: boolean;
    children?: React.ReactNode;
    title?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-content">{children}</div>
        <div data-testid="modal-footer">{footer}</div>
      </div>
    );
  },
}));

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('../ui/Input', () => ({
  Input: React.forwardRef<HTMLInputElement, Record<string, unknown>>(
    (props, ref) => <input ref={ref} {...props} />
  ),
}));

vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params
      ? key.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '')
      : key,
}));

const mockFns = {
  projectControllerGetPersonalSpace,
  projectControllerGetProjects,
  nodeControllerGetChildren,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockFns.projectControllerGetPersonalSpace).mockResolvedValue({
    data: { id: 'ps-1', name: '个人空间' },
  } as never);
  vi.mocked(mockFns.projectControllerGetProjects).mockResolvedValue({
    data: { nodes: [{ id: 'proj-1', name: '项目A' }] },
  } as never);
});

describe('SelectFileModal', () => {
  const hiddenContainerOf = (el: Element): HTMLElement | null =>
    el.closest('[aria-hidden]') as HTMLElement | null;

  it('加载根节点：个人空间 / 我的项目（子节点折叠时视觉隐藏）', async () => {
    render(<SelectFileModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(await screen.findByText('个人空间')).toBeInTheDocument();
    expect(screen.getByText('我的项目')).toBeInTheDocument();
    // 我的项目未展开：项目列表保留在 DOM 但容器 aria-hidden（展开动画需要）
    const projectRow = screen.getByText('项目A');
    expect(hiddenContainerOf(projectRow)?.getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  it('点击根节点名称（非箭头）即可展开：我的项目 → 项目列表', async () => {
    render(<SelectFileModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    const projectsRoot = await screen.findByText('我的项目');
    fireEvent.click(projectsRoot);

    await waitFor(() => {
      const projectRow = screen.getByText('项目A');
      expect(hiddenContainerOf(projectRow)?.getAttribute('aria-hidden')).toBe(
        'false'
      );
    });
    // 我的项目 children 预置，展开不触发 API
    expect(mockFns.nodeControllerGetChildren).not.toHaveBeenCalled();
  });

  it('点击个人空间名称展开：懒加载走 children API', async () => {
    vi.mocked(mockFns.nodeControllerGetChildren).mockResolvedValue({
      data: {
        nodes: [{ id: 'folder-1', name: '施工图', isFolder: true }],
      },
    } as never);

    render(<SelectFileModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByText('个人空间'));

    await waitFor(() =>
      expect(mockFns.nodeControllerGetChildren).toHaveBeenCalledWith({
        path: { nodeId: 'ps-1' },
      })
    );
    expect(await screen.findByText('施工图')).toBeInTheDocument();
  });

  it('点击文件勾选，确认回调返回选中文件', async () => {
    vi.mocked(mockFns.nodeControllerGetChildren).mockResolvedValue({
      data: {
        nodes: [{ id: 'drawing-1', name: '示例图纸.dwg', isFolder: false }],
      },
    } as never);
    const onConfirm = vi.fn();

    render(<SelectFileModal isOpen onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByText('个人空间'));
    const fileNode = await screen.findByText('示例图纸.dwg');
    fireEvent.click(fileNode);

    fireEvent.click(screen.getByText('选择 (1)'));
    expect(onConfirm).toHaveBeenCalledWith([
      { fileId: 'drawing-1', fileName: '示例图纸.dwg' },
    ]);
  });
});
