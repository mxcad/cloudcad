///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * useFileItemRenderer 分享菜单接线回归测试
 *
 * 背景：CAD 编辑器侧边栏图纸菜单曾整体缺失「分享」项——共享动作注册表
 * （fileActionConfig）的 share 项以 onShare 回调存在性为可见性门控，
 * 而本渲染器从未向 FileItem 注入 onShare。此处 mock FileItem 捕获 props，
 * 钉死接线契约：
 * - 项目/个人空间模式：文件节点必须注入 onShare（canShare 由权限位推导）
 * - 库模式（图纸库/图块库）：不注入 onShare（库资产分享无对等入口，
 *   后端亦要求 LIBRARY_*_MANAGE 系统权限，语义不同）
 * - 文件夹节点：不注入 onShare（分享仅对文件开放）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';

const fileItemPropsMock = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock('@/components/FileItem', () => ({
  FileItem: (props: Record<string, unknown>) => {
    fileItemPropsMock.current = props;
    return <div data-testid="mock-file-item" />;
  },
}));
vi.mock('@/api-sdk', () => ({
  libraryControllerGetBlockNode: vi.fn(() => Promise.resolve({ data: null })),
}));
vi.mock('@/languages', () => ({ t: (m: string) => m }));

import { useFileItemRenderer } from './useFileItemRenderer';
import type { UseFileItemRendererOptions } from './useFileItemRenderer';
import type { FileSystemNode } from '@/types/filesystem';
import type { ResourceItem } from '@/components/common';

const fileNode: FileSystemNode = {
  id: 'f1',
  name: 'a.dwg',
  nodeType: 'FILE',
  isFolder: false,
  isRoot: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  extension: 'dwg',
} as FileSystemNode;

const folderNode: FileSystemNode = {
  id: 'd1',
  name: '子目录',
  nodeType: 'FOLDER',
  isFolder: true,
  isRoot: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as FileSystemNode;

const resourceItem: ResourceItem = {
  id: 'f1',
  name: 'a.dwg',
  type: 'file',
};

function baseOptions(overrides: Partial<UseFileItemRendererOptions>) {
  return {
    nodes: [fileNode, folderNode],
    isLibraryMode: false,
    canManageLibrary: false,
    doubleClickToOpen: false,
    projectPermissions: { FILE_SHARE: true },
    onDrawingOpen: vi.fn(),
    handleEnterFolder: vi.fn(),
    handleDownload: vi.fn(),
    handleDelete: vi.fn(),
    handleOpenRename: vi.fn(),
    handleLibraryOpenRename: vi.fn(),
    handleShowVersionHistory: vi.fn(),
    handleShare: vi.fn(),
    showToast: vi.fn(),
    user: { id: 'u1' },
    hasPermission: () => true,
    setDownloadingNode: vi.fn(),
    setShowDownloadFormatModal: vi.fn(),
    libraryOperations: { handleDelete: vi.fn() },
    ...overrides,
  } as UseFileItemRendererOptions;
}

/** 渲染渲染器产出的 FileItem，返回其捕获到的 props */
function renderItemProps(options: Partial<UseFileItemRendererOptions>) {
  const { result } = renderHook(() =>
    useFileItemRenderer(baseOptions(options))
  );
  const element = result.current.renderFileItem(resourceItem, 'list');
  render(element);
  return fileItemPropsMock.current;
}

describe('useFileItemRenderer — 分享菜单接线', () => {
  beforeEach(() => {
    fileItemPropsMock.current = null;
  });

  it('项目/个人空间模式：文件节点注入 onShare 且 canShare 随 FILE_SHARE 权限', () => {
    const props = renderItemProps({});
    expect(props).not.toBeNull();
    expect(props!.onShare).toBeTypeOf('function');
    expect(props!.canShare).toBe(true);
  });

  it('FILE_SHARE 权限为 false 时 canShare=false（菜单项被权限过滤）', () => {
    const props = renderItemProps({ projectPermissions: { FILE_SHARE: false } });
    expect(props!.canShare).toBe(false);
  });

  it('未提供 handleShare 时不注入 onShare（可见性门控回退到隐藏）', () => {
    const props = renderItemProps({ handleShare: undefined });
    expect(props!.onShare).toBeUndefined();
  });

  it('库模式（图纸库）：即使提供 handleShare 也不注入 onShare', () => {
    const props = renderItemProps({
      isLibraryMode: true,
      libraryType: 'drawing',
      canManageLibrary: true,
    });
    expect(props!.onShare).toBeUndefined();
  });

  it('文件夹节点不注入 onShare（分享仅对文件开放）', () => {
    const { result } = renderHook(() =>
      useFileItemRenderer(baseOptions({}))
    );
    const element = result.current.renderFileItem(
      { id: 'd1', name: '子目录', type: 'folder' },
      'list'
    );
    render(element);
    expect(fileItemPropsMock.current!.onShare).toBeUndefined();
  });
});
