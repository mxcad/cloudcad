import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { useRoleCRUD } from './useRoleCRUD';

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

const mockSystemRoles = [
  {
    id: 'sys-1',
    name: 'ADMIN',
    description: '系统管理员',
    isSystem: true,
    permissions: ['SYS_ADMIN', 'USER_MANAGE'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'sys-2',
    name: 'USER',
    description: '普通用户',
    isSystem: true,
    permissions: ['FILE_READ'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

const mockProjectRoles = [
  {
    id: 'proj-1',
    name: 'PROJECT_ADMIN',
    description: '项目管理员',
    isSystem: true,
    permissions: [
      { id: 'perm-1', projectRoleId: 'proj-1', permission: 'PROJECT_ADMIN', createdAt: '2024-01-01' },
      { id: 'perm-2', projectRoleId: 'proj-1', permission: 'FILE_CREATE', createdAt: '2024-01-01' },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    _count: { members: 5 },
  },
  {
    id: 'proj-2',
    name: 'PROJECT_USER',
    description: '项目成员',
    isSystem: false,
    permissions: [
      { id: 'perm-3', projectRoleId: 'proj-2', permission: 'FILE_READ', createdAt: '2024-02-01' },
      { id: 'perm-4', projectRoleId: 'proj-2', permission: 'FILE_EDIT', createdAt: '2024-02-01' },
    ],
    createdAt: '2024-02-01',
    updatedAt: '2024-02-01',
    _count: { members: 10 },
  },
];

const mockCurrentUser = {
  id: 'user-1',
  username: 'admin',
  email: 'admin@example.com',
  nickname: '管理员',
  status: 'ACTIVE',
};

describe('useRoleCRUD', () => {
  describe('system roles loading', () => {
    it('loads system roles automatically on mount', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json(mockSystemRoles);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.systemRoles).toHaveLength(2);
      expect(result.current.systemRoles[0].name).toBe('ADMIN');
      expect(result.current.error).toBeNull();
    });

    it('sets error when system roles fetch fails', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          throw new Error('Network error');
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.systemRoles).toHaveLength(0);
    });
  });

  describe('project roles loading', () => {
    it('loads project roles automatically on mount', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json(mockProjectRoles);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.projectRoles).toHaveLength(2);
      expect(result.current.projectRoles[0].name).toBe('PROJECT_ADMIN');
    });

    it('maps project role permissions correctly', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json(mockProjectRoles);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const projectAdmin = result.current.projectRoles.find((r) => r.name === 'PROJECT_ADMIN');
      expect(projectAdmin?.permissions).toEqual(['PROJECT_ADMIN', 'FILE_CREATE']);
    });
  });

  describe('current user loading', () => {
    it('loads current user automatically on mount', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.currentUser?.username).toBe('admin');
    });
  });

  describe('create system role', () => {
    it('invalidates system roles cache after successful creation', async () => {
      let requestCount = 0;
      server.use(
        http.get('/api/v1/roles', () => {
          requestCount++;
          return HttpResponse.json(requestCount === 1 ? mockSystemRoles : [...mockSystemRoles, {
            id: 'sys-3',
            name: 'NEW_ROLE',
            description: '新角色',
            isSystem: false,
            permissions: [],
            createdAt: '2024-03-01',
            updatedAt: '2024-03-01',
          }]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
        http.post('/api/v1/roles', () => {
          return HttpResponse.json({ id: 'sys-3' });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.createSystemRole({
        name: 'NEW_ROLE',
        description: '新角色',
        permissions: [],
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['systemRoles'] });
    });
  });

  describe('update system role', () => {
    it('invalidates system roles cache after successful update', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json(mockSystemRoles);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
        http.patch('/api/v1/roles/:id', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.updateSystemRole('sys-1', {
        name: 'UPDATED_ADMIN',
        description: '更新后的管理员',
        permissions: ['SYS_ADMIN'],
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['systemRoles'] });
    });
  });

  describe('delete system role', () => {
    it('invalidates system roles cache after successful deletion', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json(mockSystemRoles);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
        http.delete('/api/v1/roles/:id', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteSystemRole('sys-1');

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['systemRoles'] });
    });
  });

  describe('create project role', () => {
    it('invalidates project roles cache after successful creation', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json(mockProjectRoles);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
        http.post('/api/v1/roles/project-roles', () => {
          return HttpResponse.json({ id: 'proj-3' });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.createProjectRole({
        name: 'NEW_PROJECT_ROLE',
        description: '新项目角色',
        permissions: [],
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projectRoles'] });
    });
  });

  describe('update project role', () => {
    it('invalidates project roles cache after successful update', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json(mockProjectRoles);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
        http.patch('/api/v1/roles/project-roles/:id', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.updateProjectRole('proj-2', {
        name: 'UPDATED_PROJECT_USER',
        description: '更新后的项目成员',
        permissions: ['FILE_READ'],
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projectRoles'] });
    });
  });

  describe('delete project role', () => {
    it('invalidates project roles cache after successful deletion', async () => {
      server.use(
        http.get('/api/v1/roles', () => {
          return HttpResponse.json([]);
        }),
        http.get('/api/v1/roles/project-roles/system', () => {
          return HttpResponse.json(mockProjectRoles);
        }),
        http.get('/api/v1/auth/profile', () => {
          return HttpResponse.json(mockCurrentUser);
        }),
        http.delete('/api/v1/roles/project-roles/:id', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRoleCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteProjectRole('proj-2');

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projectRoles'] });
    });
  });
});