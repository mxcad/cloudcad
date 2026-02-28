import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermission } from './usePermission';
import { useAuth } from '../contexts/AuthContext';
import { SystemPermission } from '../constants/permissions';

// Mock AuthContext
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('usePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPermissions', () => {
    it('should return empty array when user is null', () => {
      vi.mocked(useAuth).mockReturnValue({ user: null } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserPermissions()).toEqual([]);
    });

    it('should return empty array when user has no role', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: '1', email: 'test@test.com' },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserPermissions()).toEqual([]);
    });

    it('should return permissions from user role', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [
              SystemPermission.SYSTEM_USER_READ,
              SystemPermission.SYSTEM_USER_CREATE,
            ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserPermissions()).toEqual([
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_USER_CREATE,
      ]);
    });

    it('should handle nested permission objects', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [
              { permission: SystemPermission.SYSTEM_USER_READ },
              { permission: SystemPermission.SYSTEM_USER_CREATE },
            ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserPermissions()).toEqual([
        SystemPermission.SYSTEM_USER_READ,
        SystemPermission.SYSTEM_USER_CREATE,
      ]);
    });

    it('should filter out invalid permission formats', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [
              SystemPermission.SYSTEM_USER_READ,
              null,
              undefined,
              123,
              { invalid: 'object' },
            ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserPermissions()).toEqual([
        SystemPermission.SYSTEM_USER_READ,
      ]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasPermission(SystemPermission.SYSTEM_USER_READ)
      ).toBe(true);
    });

    it('should return false when user does not have permission', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasPermission(SystemPermission.SYSTEM_USER_DELETE)
      ).toBe(false);
    });

    it('should return false when user is null', () => {
      vi.mocked(useAuth).mockReturnValue({ user: null } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasPermission(SystemPermission.SYSTEM_USER_READ)
      ).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has any of the permissions', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasAnyPermission([
          SystemPermission.SYSTEM_USER_READ,
          SystemPermission.SYSTEM_USER_DELETE,
        ])
      ).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasAnyPermission([
          SystemPermission.SYSTEM_USER_DELETE,
          SystemPermission.SYSTEM_USER_UPDATE,
        ])
      ).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all permissions', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [
              SystemPermission.SYSTEM_USER_READ,
              SystemPermission.SYSTEM_USER_CREATE,
            ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasAllPermissions([
          SystemPermission.SYSTEM_USER_READ,
          SystemPermission.SYSTEM_USER_CREATE,
        ])
      ).toBe(true);
    });

    it('should return false when user is missing any permission', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(
        result.current.hasAllPermissions([
          SystemPermission.SYSTEM_USER_READ,
          SystemPermission.SYSTEM_USER_DELETE,
        ])
      ).toBe(false);
    });
  });

  describe('getUserRole', () => {
    it('should return user role name', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: { name: 'ADMIN' },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserRole()).toBe('ADMIN');
    });

    it('should return null when user has no role', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: '1' },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.getUserRole()).toBeNull();
    });
  });

  describe('hasRole', () => {
    it('should return true when user has specified role', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: { name: 'ADMIN' },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.hasRole('ADMIN')).toBe(true);
    });

    it('should return true when user has one of the specified roles', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: { name: 'ADMIN' },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.hasRole(['USER', 'ADMIN'])).toBe(true);
    });

    it('should return false when user has different role', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: { name: 'USER' },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.hasRole('ADMIN')).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true when user has SYSTEM_ADMIN permission', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_ADMIN],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.isAdmin()).toBe(true);
    });

    it('should return false when user does not have SYSTEM_ADMIN permission', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result } = renderHook(() => usePermission());

      expect(result.current.isAdmin()).toBe(false);
    });
  });

  describe('memoization', () => {
    it('should return memoized functions', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: '1',
          role: {
            permissions: [SystemPermission.SYSTEM_USER_READ],
          },
        },
      } as any);

      const { result, rerender } = renderHook(() => usePermission());

      const firstRender = result.current;
      rerender();
      const secondRender = result.current;

      // Functions should be memoized (same reference)
      expect(firstRender.hasPermission).toBe(secondRender.hasPermission);
      expect(firstRender.hasAnyPermission).toBe(secondRender.hasAnyPermission);
      expect(firstRender.hasAllPermissions).toBe(
        secondRender.hasAllPermissions
      );
    });
  });
});
