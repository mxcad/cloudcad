///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaveAsModal } from './SaveAsModal';

vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars ? m.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '') : m,
}));

const mkCreateProject = vi.fn();
const mkFetchProjects = vi.fn();
vi.mock('@/api-sdk', () => ({
  projectControllerCreateProject: (...args: unknown[]) =>
    mkCreateProject(...args),
  saveControllerSaveMxwebAs: vi.fn(),
}));

vi.mock('@/lib/projects', () => ({
  fetchProjects: (...args: unknown[]) => mkFetchProjects(...args),
}));

vi.mock('@/utils/hashUtils', () => ({
  calculateFileHash: vi.fn().mockResolvedValue('mock-hash'),
}));

vi.mock('@/utils/mxcadUploadUtils', () => ({
  uploadMxCadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => false }),
}));

vi.mock('./hooks/useLibraryFolders', () => ({
  useLibraryFolders: () => ({
    getLibrary: vi.fn().mockResolvedValue({ id: 'lib-1' }),
  }),
}));

// Select 桩：原生 <select>，onChange 直接透传 value（Radix 弹层交互不是本测试对象，
// 哨兵值 '__create_project__' 是否被组件正确处理才是）
vi.mock('@/components/ui/Select', () => ({
  Select: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value?: string | number;
    onChange?: (v: string) => void;
    options: { value: string | number; label: string }[];
    placeholder?: string;
  }) => (
    <select
      data-testid="sel"
      value={value === undefined || value === '' ? '' : String(value)}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

// 文件夹选择器桩：本测试不进入（只验证新建项目流程），打开态渲染标记即可
vi.mock('./SelectFolderModal', () => ({
  SelectFolderModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="sfm-open" /> : null,
}));
vi.mock('./LibrarySelectFolderModal', () => ({
  LibrarySelectFolderModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="lsfm-open" /> : null,
}));

const findSelect = (optionText: string) =>
  screen
    .getAllByTestId('sel')
    .find((s) =>
      Array.from((s as HTMLSelectElement).options).some(
        (o) => o.text === optionText
      )
    ) as HTMLSelectElement;

const renderSaveAs = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SaveAsModal
        isOpen
        currentFileName="plan.dwg"
        mxwebBlob={new Blob(['x'])}
        personalSpaceId="space-1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </QueryClientProvider>
  );
};

describe('SaveAsModal 选择项目→新建项目', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkCreateProject.mockResolvedValue({ data: { id: 'proj-2' } });
    // 初始查询只有旧项目；新建后 invalidate 重拉，列表含新项目
    mkFetchProjects
      .mockResolvedValueOnce({ nodes: [{ id: 'proj-1', name: '项目一' }] })
      .mockResolvedValue({
        nodes: [
          { id: 'proj-1', name: '项目一' },
          { id: 'proj-2', name: '新项目' },
        ],
      });
  });

  it('选「新建项目」哨兵值只开弹窗、不改选中值', async () => {
    renderSaveAs();
    fireEvent.change(findSelect('项目文件夹'), {
      target: { value: 'project' },
    });
    await waitFor(() => expect(mkFetchProjects).toHaveBeenCalledTimes(1));

    fireEvent.change(findSelect('新建项目'), {
      target: { value: '__create_project__' },
    });

    // 弹窗出现，且「选择项目」选中值未被哨兵改动（仍为自动选中的第一个项目）
    await waitFor(() =>
      expect(screen.getByPlaceholderText('请输入项目名称')).toBeTruthy()
    );
    expect(findSelect('新建项目').value).toBe('proj-1');
  });

  it('输入名称点创建：调 createProject API → 重拉列表 → 弹窗关闭 → 自动选中新项目', async () => {
    renderSaveAs();
    fireEvent.change(findSelect('项目文件夹'), {
      target: { value: 'project' },
    });
    await waitFor(() => expect(mkFetchProjects).toHaveBeenCalledTimes(1));

    fireEvent.change(findSelect('新建项目'), {
      target: { value: '__create_project__' },
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText('请输入项目名称')).toBeTruthy()
    );

    fireEvent.change(screen.getByPlaceholderText('请输入项目名称'), {
      target: { value: '新项目' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(mkCreateProject).toHaveBeenCalledWith({
        body: { name: '新项目' },
        throwOnError: true,
      })
    );
    // invalidateQueries → 项目列表重拉
    await waitFor(() => expect(mkFetchProjects).toHaveBeenCalledTimes(2));
    // 弹窗关闭
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('请输入项目名称')).toBeNull()
    );
    // 自动选中新项目（pendingNewProjectId 优先于「选第一个」）
    await waitFor(() => expect(findSelect('新项目').value).toBe('proj-2'));
  });

  it('创建失败：弹窗保留并显示错误文案', async () => {
    mkCreateProject.mockRejectedValueOnce(new Error('项目创建失败'));
    renderSaveAs();
    fireEvent.change(findSelect('项目文件夹'), {
      target: { value: 'project' },
    });
    await waitFor(() => expect(mkFetchProjects).toHaveBeenCalledTimes(1));

    fireEvent.change(findSelect('新建项目'), {
      target: { value: '__create_project__' },
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText('请输入项目名称')).toBeTruthy()
    );
    fireEvent.change(screen.getByPlaceholderText('请输入项目名称'), {
      target: { value: '新项目' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(screen.getByText('项目创建失败')).toBeTruthy());
    // 弹窗未关闭，输入框仍在
    expect(screen.getByPlaceholderText('请输入项目名称')).toBeTruthy();
  });
});
