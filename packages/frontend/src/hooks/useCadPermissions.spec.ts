import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCadPermissions } from './useCadPermissions';
import { memberControllerGetUserProjectPermissions } from '@/api-sdk';
import { globalPermissionCache } from '../utils/projectPermissionCache';

vi.mock('@/api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}));

describe('useCadPermissions（并入缓存：语义与 loading 门控）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalPermissionCache.clearAll();
  });

  it('无项目：不发请求，三个能力位 false，loading=false', () => {
    const { result } = renderHook(() => useCadPermissions(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.canSave).toBe(false);
    expect(result.current.canExport).toBe(false);
    expect(result.current.canManageExternalRef).toBe(false);
    expect(memberControllerGetUserProjectPermissions).not.toHaveBeenCalled();
  });

  it('加载期间：loading=true 且三个能力位悲观为 false', () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockReturnValue(
      new Promise(() => {}) as any
    );

    // 用独立 projectId：挂起 promise 会留在 loadProjectPermissionData 的
    // in-flight 合并 Map 中，若复用 project-1 会污染后续用例（拿到永不完成的
    // promise，waitFor 超时）
    const { result } = renderHook(() => useCadPermissions('project-pending'));

    expect(result.current.loading).toBe(true);
    expect(result.current.canSave).toBe(false);
    expect(result.current.canExport).toBe(false);
    expect(result.current.canManageExternalRef).toBe(false);
  });

  it('语义映射不变：canSave=CAD_SAVE、canExport=FILE_DOWNLOAD、canManageExternalRef=CAD_EXTERNAL_REFERENCE', async () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
      data: {
        permissions: ['CAD_SAVE', 'CAD_EXTERNAL_REFERENCE'],
        role: 'EDITOR',
      },
    } as any);

    const { result } = renderHook(() => useCadPermissions('project-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canSave).toBe(true);
    expect(result.current.canExport).toBe(false);
    expect(result.current.canManageExternalRef).toBe(true);
  });

  it('加载失败：悲观拒绝（三个能力位 false），不抛错', async () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockRejectedValue(
      new Error('API error')
    );

    const { result } = renderHook(() => useCadPermissions('project-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canSave).toBe(false);
    expect(result.current.canExport).toBe(false);
    expect(result.current.canManageExternalRef).toBe(false);
  });

  it('onPermissionsChange 在加载完成后触发一次（真实权限）', async () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
      data: { permissions: ['CAD_SAVE'], role: 'EDITOR' },
    } as any);
    const onPermissionsChange = vi.fn();

    const { result } = renderHook(() =>
      useCadPermissions('project-1', onPermissionsChange)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(onPermissionsChange).toHaveBeenCalledWith({
        canSave: true,
        canExport: false,
        canManageExternalRef: false,
      })
    );
  });

  it('命中共享缓存：切回已缓存项目不发新请求', async () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
      data: { permissions: ['CAD_SAVE'], role: 'EDITOR' },
    } as any);

    const first = renderHook(() => useCadPermissions('project-1'));
    await waitFor(() =>
      expect(first.result.current.canSave).toBe(true)
    );
    first.unmount();

    const second = renderHook(() => useCadPermissions('project-1'));
    await waitFor(() =>
      expect(second.result.current.canSave).toBe(true)
    );

    expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(1);
  });

  it('项目切换：期间悲观 false，完成后渲染新项目权限', async () => {
    vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
      data: { permissions: ['CAD_SAVE'], role: 'EDITOR' },
    } as any);

    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string | null }) =>
        useCadPermissions(projectId),
      { initialProps: { projectId: 'project-1' } }
    );
    await waitFor(() => expect(result.current.canSave).toBe(true));

    vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
      data: { permissions: ['FILE_DOWNLOAD'], role: 'EDITOR' },
    } as any);
    act(() => rerender({ projectId: 'project-2' }));

    expect(result.current.canSave).toBe(false);
    expect(result.current.canExport).toBe(false);

    await waitFor(() => expect(result.current.canExport).toBe(true));
    expect(result.current.canSave).toBe(false);
  });
});
