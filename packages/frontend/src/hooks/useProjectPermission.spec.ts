import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectPermission } from './useProjectPermission';
import { projectPermissionApi } from '@/services/projectPermissionApi';

vi.mock('@/services/projectPermissionApi');

describe('useProjectPermission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 清除所有缓存
    const { result } = renderHook(() => useProjectPermission());
    result.current.clearAllCache();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('checkPermission', () => {
    it('should return true when user has permission', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue({
        data: { hasPermission: true },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkPermission('project-1', 'FILE_READ');

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledWith('project-1', 'FILE_READ');
      expect(resultValue).toBe(true);
    });

    it('should return false when user does not have permission', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue({
        data: { hasPermission: false },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkPermission('project-1', 'FILE_DELETE');

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledWith('project-1', 'FILE_DELETE');
      expect(resultValue).toBe(false);
    });

    it('should return false on API error', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockRejectedValue(new Error('API error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkPermission('project-1', 'FILE_READ');

      expect(resultValue).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('getPermissions', () => {
    it('should return permissions array', async () => {
      vi.mocked(projectPermissionApi.getPermissions).mockResolvedValue({
        data: { permissions: ['FILE_READ', 'FILE_WRITE', 'FILE_DELETE'] },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.getPermissions('project-1');

      expect(projectPermissionApi.getPermissions).toHaveBeenCalledWith('project-1');
      expect(resultValue).toEqual(['FILE_READ', 'FILE_WRITE', 'FILE_DELETE']);
    });

    it('should return empty array on API error', async () => {
      vi.mocked(projectPermissionApi.getPermissions).mockRejectedValue(new Error('API error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.getPermissions('project-1');

      expect(resultValue).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  describe('getRole', () => {
    it('should return role name', async () => {
      vi.mocked(projectPermissionApi.getRole).mockResolvedValue({
        data: { role: 'ADMIN' },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.getRole('project-1');

      expect(projectPermissionApi.getRole).toHaveBeenCalledWith('project-1');
      expect(resultValue).toBe('ADMIN');
    });

    it('should return null when role is undefined', async () => {
      vi.mocked(projectPermissionApi.getRole).mockResolvedValue({
        data: {},
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.getRole('project-1');

      expect(resultValue).toBeNull();
    });

    it('should return null on API error', async () => {
      vi.mocked(projectPermissionApi.getRole).mockRejectedValue(new Error('API error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.getRole('project-1');

      expect(resultValue).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('checkAnyPermission', () => {
    it('should return true when user has any permission', async () => {
      vi.mocked(projectPermissionApi.checkPermission)
        .mockResolvedValueOnce({ data: { hasPermission: false } } as any)
        .mockResolvedValueOnce({ data: { hasPermission: true } } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkAnyPermission('project-1', ['FILE_DELETE', 'FILE_READ']);

      expect(resultValue).toBe(true);
    });

    it('should return false when user has none of the permissions', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue({
        data: { hasPermission: false },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkAnyPermission('project-1', ['FILE_DELETE', 'FILE_READ']);

      expect(resultValue).toBe(false);
    });
  });

  describe('checkAllPermissions', () => {
    it('should return true when user has all permissions', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue({
        data: { hasPermission: true },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkAllPermissions('project-1', ['FILE_READ', 'FILE_WRITE']);

      expect(resultValue).toBe(true);
    });

    it('should return false when user is missing any permission', async () => {
      vi.mocked(projectPermissionApi.checkPermission)
        .mockResolvedValueOnce({ data: { hasPermission: true } } as any)
        .mockResolvedValueOnce({ data: { hasPermission: false } } as any);

      const { result } = renderHook(() => useProjectPermission());

      const resultValue = await result.current.checkAllPermissions('project-1', ['FILE_READ', 'FILE_DELETE']);

      expect(resultValue).toBe(false);
    });
  });

  describe('cache behavior', () => {
    it('should cache permission check results', async () => {
      vi.mocked(projectPermissionApi.checkPermission).mockResolvedValue({
        data: { hasPermission: true },
      } as any);

      const { result } = renderHook(() => useProjectPermission());

      await result.current.checkPermission('project-1', 'FILE_READ');
      await result.current.checkPermission('project-1', 'FILE_READ');

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledTimes(1);
    });

    it('should clear cache for specific project', async () => {
      vi.mocked(projectPermissionApi.checkPermission)
        .mockResolvedValueOnce({ data: { hasPermission: true } } as any)
        .mockResolvedValueOnce({ data: { hasPermission: false } } as any);

      const { result } = renderHook(() => useProjectPermission());

      const firstResult = await result.current.checkPermission('project-1', 'FILE_READ');
      result.current.clearCache('project-1');
      const secondResult = await result.current.checkPermission('project-1', 'FILE_READ');

      expect(projectPermissionApi.checkPermission).toHaveBeenCalledTimes(2);
      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
    });
  });
});