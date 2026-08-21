import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectPermission } from './useProjectPermission';
import {
  memberControllerGetUserProjectPermissions,
} from '@/api-sdk';
import { globalPermissionCache } from '../utils/projectPermissionCache';

vi.mock('@/api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}));

const mockPermissions = ['FILE_READ', 'FILE_WRITE', 'CAD_SAVE'];

describe('useProjectPermission（兼容壳：checkPermission / refreshProjectPermissions）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalPermissionCache.clearAll();
  });

  describe('checkPermission', () => {
    it('should return true when user has permission', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
        data: { permissions: mockPermissions, role: null },
      } as any);

      const { result } = renderHook(() => useProjectPermission());
      const ok = await result.current.checkPermission('project-1', 'FILE_READ');

      expect(ok).toBe(true);
    });

    it('should return false when user does not have permission', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
        data: { permissions: mockPermissions, role: null },
      } as any);

      const { result } = renderHook(() => useProjectPermission());
      const ok = await result.current.checkPermission(
        'project-1',
        'FILE_DELETE'
      );

      expect(ok).toBe(false);
    });

    it('should return false on API error（悲观）', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions).mockRejectedValue(
        new Error('API error')
      );

      const { result } = renderHook(() => useProjectPermission());
      const ok = await result.current.checkPermission('project-1', 'FILE_READ');

      expect(ok).toBe(false);
    });

    it('should reuse shared cache without extra API call', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
        data: { permissions: mockPermissions, role: null },
      } as any);

      const { result } = renderHook(() => useProjectPermission());
      await result.current.checkPermission('project-1', 'FILE_READ');
      await result.current.checkPermission('project-1', 'FILE_WRITE');

      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(
        1
      );
    });
  });

  describe('refreshProjectPermissions', () => {
    it('should clear cache and reload permissions', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions)
        .mockResolvedValueOnce({
          data: { permissions: ['FILE_READ'], role: null },
        } as any)
        .mockResolvedValueOnce({
          data: { permissions: ['FILE_WRITE'], role: null },
        } as any);

      const { result } = renderHook(() => useProjectPermission());
      expect(
        await result.current.checkPermission('project-1', 'FILE_READ')
      ).toBe(true);
      await result.current.refreshProjectPermissions('project-1');
      expect(
        await result.current.checkPermission('project-1', 'FILE_READ')
      ).toBe(false);

      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(
        2
      );
    });

    it('should not clear cache of other projects', async () => {
      vi.mocked(memberControllerGetUserProjectPermissions).mockResolvedValue({
        data: { permissions: ['FILE_READ'], role: null },
      } as any);

      const { result } = renderHook(() => useProjectPermission());
      await result.current.checkPermission('project-1', 'FILE_READ');
      await result.current.checkPermission('project-2', 'FILE_READ');
      await result.current.refreshProjectPermissions('project-1');
      await result.current.checkPermission('project-2', 'FILE_READ');

      expect(memberControllerGetUserProjectPermissions).toHaveBeenCalledTimes(
        3
      );
    });
  });
});
