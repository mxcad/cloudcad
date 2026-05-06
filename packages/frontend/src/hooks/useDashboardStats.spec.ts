import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { useDashboardStats } from './useDashboardStats';

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

describe('useDashboardStats', () => {
  it('loads dashboard stats automatically', async () => {
    const mockStats = {
      projectCount: 5,
      totalFiles: 23,
      todayUploads: 3,
      storage: { used: 1073741824, total: 10737418240, usagePercent: 10 },
      fileTypeStats: { dwg: 15, dxf: 5, other: 3 },
    };

    server.use(
      http.get('/api/v1/users/stats/me', () => {
        return HttpResponse.json({ code: 0, data: mockStats });
      }),
    );

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(mockStats);
    expect(result.current.error).toBeNull();
  });

  it('handles API error gracefully', async () => {
    server.use(
      http.get('/api/v1/users/stats/me', () => {
        throw new Error('Network error');
      }),
    );

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeDefined();
  });

  it('returns loading alias for backward compatibility', async () => {
    server.use(
      http.get('/api/v1/users/stats/me', () => {
        return HttpResponse.json({
          code: 0,
          data: {
            projectCount: 1,
            totalFiles: 10,
            todayUploads: 0,
            storage: { used: 0, total: 10737418240, usagePercent: 0 },
            fileTypeStats: { dwg: 5, dxf: 3, other: 2 },
          },
        });
      }),
    );

    const { wrapper } = createTestWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(result.current.isLoading);
  });
});