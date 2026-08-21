import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { useUserCRUD } from './useUserCRUD';

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

const mockUsers = [
  {
    id: '1',
    username: 'alice',
    email: 'alice@example.com',
    nickname: 'Alice',
    status: 'ACTIVE',
    role: { id: 'r1', name: 'USER', isSystem: true },
  },
  {
    id: '2',
    username: 'bob',
    email: 'bob@example.com',
    nickname: 'Bob',
    status: 'INACTIVE',
    role: { id: 'r1', name: 'USER', isSystem: true },
  },
];

describe('useUserCRUD', () => {
  describe('user list loading', () => {
    it('loads users automatically on mount', async () => {
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ users: mockUsers, total: 2, page: 1, limit: 20 });
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.users).toHaveLength(2);
      expect(result.current.users[0].username).toBe('alice');
      expect(result.current.error).toBeNull();
    });

    it('sets error when user list fetch fails', async () => {
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json(null, { status: 500 });
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.users).toHaveLength(0);
    });
  });

  describe('create user', () => {
    it('invalidates user list cache after successful creation', async () => {
      let requestCount = 0;
      server.use(
        http.get('/api/v1/users', () => {
          requestCount++;
          const users = requestCount === 1 ? mockUsers : [...mockUsers, { id: '3', username: 'charlie', email: 'charlie@example.com', nickname: 'Charlie', status: 'ACTIVE', role: { id: 'r1', name: 'USER', isSystem: true } }];
          return HttpResponse.json({ users, total: users.length, page: 1, limit: 20 });
        }),
        http.post('/api/v1/users', () => {
          return HttpResponse.json({ code: 0, data: { id: '3' } });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.createUser({ username: 'charlie', email: 'charlie@example.com', password: 'pass123' });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    });
  });

  describe('mutation error handling', () => {
    // 回归：mutationFn 曾不检查 SDK 返回的 error，导致接口失败仍 resolve，
    // 界面显示"保存成功"。必须抛错。
    it('rejects and surfaces backend message when update user fails', async () => {
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ users: mockUsers, total: 2, page: 1, limit: 20 });
        }),
        http.patch('/api/v1/users/:id', () => {
          return HttpResponse.json(
            { code: 'BAD_REQUEST', message: '不能删除管理员账户' },
            { status: 400 }
          );
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // mutation 失败必须 reject（SDK error 由调用方 catch 中经 getErrorMessage 提取）
      await expect(
        result.current.updateUser('1', { roleId: 'r2' })
      ).rejects.toBeTruthy();

      // 回归：mutation 错误不再混入 error（error 仅表示「列表加载失败」）。
      // 历史 bug：mutation 错误被合并进列表错误后，列表非空时渲染成表格底部失败条，
      // 创建/编辑弹窗打开时用户看不到任何提示（创建用户重名无提示）。
      expect(result.current.error).toBeNull();
    });

    it('rejects when delete user returns error (e.g. admin protection)', async () => {
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ users: mockUsers, total: 2, page: 1, limit: 20 });
        }),
        http.delete('/api/v1/users/:id', () => {
          return HttpResponse.json(
            { code: 'BAD_REQUEST', message: '不能删除管理员账户' },
            { status: 400 }
          );
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(result.current.deleteUser('1')).rejects.toBeTruthy();
      expect(result.current.error).toBeNull();
    });

    it('keeps list-loading error separate from mutation error', async () => {
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json(null, { status: 500 });
        }),
        http.patch('/api/v1/users/:id', () => {
          return HttpResponse.json(
            { code: 'BAD_REQUEST', message: '更新用户失败' },
            { status: 400 }
          );
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      // 列表加载失败 → error 置为加载失败文案
      expect(result.current.error).toBeTruthy();

      // mutation 失败不覆盖列表加载错误
      await expect(
        result.current.updateUser('1', { roleId: 'r2' })
      ).rejects.toBeTruthy();
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('delete user', () => {
    it('calls soft delete by default', async () => {
      let deleteCalled = false;
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ users: mockUsers, total: 2, page: 1, limit: 20 });
        }),
        http.delete('/api/v1/users/:id', ({ params }) => {
          if (params.id === '1') {
            deleteCalled = true;
          }
          return HttpResponse.json({ code: 0, data: null });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteUser('1');

      expect(deleteCalled).toBe(true);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    });

    it('calls hard delete when immediately flag is true', async () => {
      let hardDeleteCalled = false;
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ users: mockUsers, total: 2, page: 1, limit: 20 });
        }),
        http.post('/api/v1/users/:id/delete-immediately', ({ params }) => {
          if (params.id === '1') {
            hardDeleteCalled = true;
          }
          return HttpResponse.json({ code: 0, data: null });
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteUser('1', true);

      expect(hardDeleteCalled).toBe(true);
    });
  });

  describe('restore user', () => {
    it('calls restore endpoint and invalidates cache', async () => {
      let restoreCalled = false;
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ users: mockUsers, total: 2, page: 1, limit: 20 });
        }),
        http.post('/api/v1/users/:id/restore', ({ params }) => {
          if (params.id === '2') {
            restoreCalled = true;
          }
          return HttpResponse.json({ code: 0, data: null });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUserCRUD(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.restoreUser('2');

      expect(restoreCalled).toBe(true);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    });
  });
});
