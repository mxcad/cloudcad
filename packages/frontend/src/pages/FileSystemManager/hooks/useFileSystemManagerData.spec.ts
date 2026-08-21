import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileSystemManagerData } from './useFileSystemManagerData';
import { useFileSystem } from '@/hooks/file-system';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useProjectQuota } from '@/hooks/useProjectQuota';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { useIsMobile } from '@/lib/useIsMobile';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { memberControllerGetUserProjectPermissions } from '@/api-sdk';
import { globalPermissionCache } from '@/utils/projectPermissionCache';

vi.mock('@/api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock('@/hooks/file-system', () => ({
  useFileSystem: vi.fn(),
}));

vi.mock('@/stores/fileSystemStore', () => ({
  useFileSystemStore: vi.fn(),
}));

vi.mock('@/stores/fileSystemUndoRedoStore', () => ({
  useFileSystemUndoRedoStore: vi.fn((selector: any) =>
    selector({ clearStack: vi.fn() })
  ),
}));

vi.mock('@/hooks/useProjectQuota', () => ({
  useProjectQuota: vi.fn(() => ({ data: null })),
}));

vi.mock('@/hooks/usePersonalSpaceQuery', () => ({
  usePersonalSpaceQuery: vi.fn(() => ({
    data: { id: 'personal-1' },
    isError: false,
  })),
}));

vi.mock('@/lib/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/common/useAccumulatedPagination', () => ({
  useAccumulatedPagination: vi.fn(
    ({ displayNodes, handlePageChange }: any) => ({
      viewNodes: displayNodes,
      handleScrollPageChange: handlePageChange,
    })
  ),
}));

const fsBase = {
  nodes: [],
  breadcrumbs: [],
  isTrashView: false,
  handlePageChange: vi.fn(),
  handleFileOpen: vi.fn(),
  clearSelection: vi.fn(),
  urlProjectId: undefined as string | undefined,
};

function mockFs(urlProjectId: string | undefined) {
  vi.mocked(useFileSystem).mockReturnValue({
    ...fsBase,
    urlProjectId,
  } as any);
}

function mockPermissions(perms: string[]) {
  vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
    data: { permissions: perms, role: 'EDITOR' },
  } as any);
}

function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
}

describe('useFileSystemManagerData 权限行为（悲观 + loading 门控 + 项目切换）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalPermissionCache.clearAll();
    vi.mocked(useFileSystemStore).mockReturnValue({
      personalSpaceId: null,
      setPersonalSpaceId: vi.fn(),
      setPersonalSpaceIdLoading: vi.fn(),
    } as any);
    vi.mocked(useAccumulatedPagination).mockImplementation(
      ({ displayNodes, handlePageChange }: any) => ({
        viewNodes: displayNodes,
        handleScrollPageChange: handlePageChange,
      })
    );
  });

  it('权限加载期间：permissionsLoading=true，全部能力位悲观为 false，record 无 undefined 泄漏', async () => {
    const d = deferred();
    vi.mocked(memberControllerGetUserProjectPermissions).mockReturnValue(
      d.promise as any
    );
    mockFs('project-1');

    const { result } = renderHook(() =>
      useFileSystemManagerData({ mode: 'project' })
    );

    expect(result.current.permissionsLoading).toBe(true);
    expect(result.current.canUpload).toBe(false);
    expect(result.current.canCut).toBe(false);
    expect(result.current.canCopy).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canRestore).toBe(false);
    expect(result.current.canDownload).toBe(false);
    // 下游 `!== false` 若收到 undefined 会退回乐观 true，这里必须归一为 false
    expect(result.current.projectPermissionsRecord['FILE_CREATE']).toBe(false);
    expect(result.current.projectPermissionsRecord['FILE_UPLOAD']).toBe(false);

    await act(async () => {
      d.resolve({
        data: { permissions: ['FILE_UPLOAD', 'FILE_MOVE', 'FILE_DOWNLOAD'], role: 'EDITOR' },
      });
    });
  });

  it('加载完成后：按真实权限渲染（授予的为 true，未授予为 false）', async () => {
    mockPermissions(['FILE_UPLOAD', 'FILE_MOVE', 'FILE_DOWNLOAD']);
    mockFs('project-1');

    const { result } = renderHook(() =>
      useFileSystemManagerData({ mode: 'project' })
    );

    await waitFor(() =>
      expect(result.current.permissionsLoading).toBe(false)
    );

    expect(result.current.canUpload).toBe(true);
    expect(result.current.canCut).toBe(true);
    expect(result.current.canDownload).toBe(true);
    expect(result.current.canCopy).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canRestore).toBe(false);
    expect(
      result.current.projectPermissionsRecord['FILE_TRASH_MANAGE']
    ).toBe(false);
  });

  it('加载失败：悲观拒绝，能力位全部为 false', async () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockRejectedValue(
      new Error('API error')
    );
    mockFs('project-1');

    const { result } = renderHook(() =>
      useFileSystemManagerData({ mode: 'project' })
    );

    await waitFor(() =>
      expect(result.current.permissionsLoading).toBe(false)
    );

    expect(result.current.canUpload).toBe(false);
    expect(result.current.canCut).toBe(false);
  });

  it('项目切换：加载期间清空旧项目权限位（不残留），完成后渲染新项目权限', async () => {
    mockPermissions(['FILE_UPLOAD', 'FILE_EDIT']);
    mockFs('project-1');

    const { result, rerender } = renderHook(() =>
      useFileSystemManagerData({ mode: 'project' })
    );

    await waitFor(() => expect(result.current.canUpload).toBe(true));

    // 切到 project-2：缓存未命中，重新请求；期间悲观 false
    mockPermissions(['FILE_COPY', 'FILE_TRASH_MANAGE']);
    const d = deferred();
    vi.mocked(memberControllerGetUserProjectPermissions).mockReturnValue(
      d.promise as any
    );
    mockFs('project-2');
    rerender();

    expect(result.current.permissionsLoading).toBe(true);
    expect(result.current.canUpload).toBe(false);

    await act(async () => {
      d.resolve({
        data: { permissions: ['FILE_COPY', 'FILE_TRASH_MANAGE'], role: 'EDITOR' },
      });
    });

    expect(result.current.permissionsLoading).toBe(false);
    expect(result.current.canCopy).toBe(true);
    expect(result.current.canRestore).toBe(true);
    expect(result.current.canUpload).toBe(false);
    expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(2);
  });

  it('无项目（个人空间根）：不发权限请求，能力位悲观为 false（修复前乐观 true）', () => {
    mockPermissions(['FILE_UPLOAD']);
    mockFs(undefined);

    const { result } = renderHook(() =>
      useFileSystemManagerData({ mode: 'project' })
    );

    expect(result.current.permissionsLoading).toBe(false);
    expect(result.current.canUpload).toBe(false);
    expect(result.current.canCut).toBe(false);
    expect(memberControllerGetUserProjectPermissions).not.toHaveBeenCalled();
  });

  it('切回已缓存项目：命中缓存不发请求，权限立即恢复', async () => {
    mockPermissions(['FILE_UPLOAD']);
    mockFs('project-1');

    const { result, rerender } = renderHook(() =>
      useFileSystemManagerData({ mode: 'project' })
    );

    await waitFor(() => expect(result.current.canUpload).toBe(true));

    mockPermissions(['FILE_COPY']);
    mockFs('project-2');
    rerender();
    await waitFor(() => expect(result.current.canCopy).toBe(true));

    mockFs('project-1');
    rerender();
    await waitFor(() => expect(result.current.canUpload).toBe(true));

    expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(2);
  });
});
