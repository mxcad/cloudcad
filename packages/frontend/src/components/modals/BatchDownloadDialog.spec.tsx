import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BatchDownloadDialog } from './BatchDownloadDialog';

// 被 vi.mock 工厂引用的可变状态/函数须用 vi.hoisted 提升（工厂执行早于模块顶层代码）
const mocks = vi.hoisted(() => ({
  store: {
    dialogMode: 'batch' as const,
    dialogFileList: [] as Array<{
      nodeId: string;
      fileName: string;
      isFolder?: boolean;
    }>,
    folderDialogNodeId: null as string | null,
    folderDialogName: null as string | null,
  },
  hookFns: {
    createZipTask: vi.fn(),
    createIndividualTask: vi.fn(),
    downloadAllItems: vi.fn(),
    pollTaskUntilDone: vi.fn(),
    syncIndividualTerminal: vi.fn(),
  },
}));

// ---- mock 外部依赖 ----
vi.mock('@/stores/useBatchDownloadStore', () => ({
  useBatchDownloadStore: () => mocks.store,
}));

vi.mock('@/hooks/file-system', () => ({
  useBatchDownload: () => mocks.hookFns,
}));

vi.mock('@/utils/vipFeatureGuide', () => ({
  canExportDownload: () => true,
  handleVipFeatureRequiredError: vi.fn(),
}));

vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => null,
}));

vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({ config: {} }),
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));

vi.mock('@/constants/layers', () => ({
  Z_LAYERS: { MODAL: 10000 },
}));

vi.mock('./downloadFormats', () => ({
  DOWNLOAD_FORMATS: [] as const,
  FORMAT_LABELS: {},
}));

// ---- mock UI 组件（Button 丢弃 disabled，使无选中时仍能触发点击以测守卫） ----
vi.mock('../ui/Modal', () => ({
  Modal: ({
    isOpen,
    title,
    children,
    footer,
  }: {
    isOpen?: boolean;
    title?: React.ReactNode;
    children?: React.ReactNode;
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

vi.mock('../ui/Tag', () => ({
  Tag: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

describe('BatchDownloadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未选格式点击「逐个下载」：提示 toast 且不提交任务', () => {
    const showToast = vi.fn();
    render(
      <BatchDownloadDialog isOpen onClose={vi.fn()} showToast={showToast} />
    );

    fireEvent.click(screen.getByText('逐个下载'));

    expect(showToast).toHaveBeenCalledWith('请至少选择一个文件格式', 'warning');
    expect(mocks.hookFns.createIndividualTask).not.toHaveBeenCalled();
    expect(mocks.hookFns.createZipTask).not.toHaveBeenCalled();
  });
});
