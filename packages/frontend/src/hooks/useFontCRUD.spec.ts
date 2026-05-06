import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { useFontCRUD } from './useFontCRUD';

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

const mockFonts: any[] = [
  {
    name: 'Arial.ttf',
    size: 123456,
    extension: '.ttf',
    existsInBackend: true,
    existsInFrontend: true,
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:00:00Z',
    creator: 'admin',
  },
  {
    name: 'Times.otf',
    size: 789012,
    extension: '.otf',
    existsInBackend: true,
    existsInFrontend: false,
    createdAt: '2024-01-02T11:00:00Z',
    updatedAt: '2024-01-02T11:00:00Z',
    creator: 'user',
  },
];

describe('useFontCRUD', () => {
  describe('font list loading', () => {
    it('loads fonts automatically on mount', async () => {
      server.use(
        http.get('/api/v1/font-management', ({ request }) => {
          const url = new URL(request.url);
          const location = url.searchParams.get('location');
          expect(location).toBe('backend');
          return HttpResponse.json({ code: 0, data: mockFonts });
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useFontCRUD({ location: 'backend' }), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.fonts).toHaveLength(2);
      expect(result.current.fonts[0].name).toBe('Arial.ttf');
      expect(result.current.error).toBeNull();
    });

    it('loads fonts for frontend location', async () => {
      server.use(
        http.get('/api/v1/font-management', ({ request }) => {
          const url = new URL(request.url);
          const location = url.searchParams.get('location');
          expect(location).toBe('frontend');
          return HttpResponse.json({ code: 0, data: mockFonts.slice(0, 1) });
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useFontCRUD({ location: 'frontend' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.fonts).toHaveLength(1);
    });

    it('sets error when font list fetch fails', async () => {
      server.use(
        http.get('/api/v1/font-management', () => {
          throw new Error('Network error');
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useFontCRUD({ location: 'backend' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.fonts).toHaveLength(0);
    });
  });

  describe('upload font', () => {
    it('invalidates font list cache after successful upload', async () => {
      let requestCount = 0;
      server.use(
        http.get('/api/v1/font-management', () => {
          requestCount++;
          const fonts = requestCount === 1 ? mockFonts : [...mockFonts, {
            name: 'NewFont.woff',
            size: 456789,
            extension: '.woff',
            existsInBackend: true,
            existsInFrontend: true,
            createdAt: '2024-01-03T12:00:00Z',
            updatedAt: '2024-01-03T12:00:00Z',
          }];
          return HttpResponse.json({ code: 0, data: fonts });
        }),
        http.post('/api/v1/font-management/upload', () => {
          return HttpResponse.json({ code: 0, data: null });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useFontCRUD({ location: 'backend' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const mockFile = new File(['font data'], 'NewFont.woff', { type: 'application/font-woff' });
      await result.current.uploadFont(mockFile, 'backend');

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fonts'] });
    });
  });

  describe('delete font', () => {
    it('calls delete endpoint and invalidates cache', async () => {
      let deleteCalled = false;
      server.use(
        http.get('/api/v1/font-management', () => {
          return HttpResponse.json({ code: 0, data: mockFonts });
        }),
        http.delete('/api/v1/font-management/:fileName', ({ params }) => {
          if (params.fileName === 'Arial.ttf') {
            deleteCalled = true;
          }
          return HttpResponse.json({ code: 0, data: null });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useFontCRUD({ location: 'backend' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteFont('Arial.ttf', 'backend');

      expect(deleteCalled).toBe(true);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fonts'] });
    });
  });

  describe('download font', () => {
    it('calls download endpoint', async () => {
      let downloadCalled = false;

      server.use(
        http.get('/api/v1/font-management', () => {
          return HttpResponse.json({ code: 0, data: mockFonts });
        }),
        http.get('/api/v1/font-management/download/:fileName', ({ params }) => {
          if (params.fileName === 'Arial.ttf') {
            downloadCalled = true;
          }
          return new HttpResponse('font binary data', {
            headers: { 'Content-Type': 'application/octet-stream' },
          });
        }),
      );

      const { wrapper } = createTestWrapper();
      const { result } = renderHook(() => useFontCRUD({ location: 'backend' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.downloadFont('Arial.ttf', 'backend');

      expect(downloadCalled).toBe(true);
    });
  });

  describe('reload fonts', () => {
    it('invalidates cache for specific location', async () => {
      server.use(
        http.get('/api/v1/font-management', () => {
          return HttpResponse.json({ code: 0, data: mockFonts });
        }),
      );

      const { wrapper, queryClient } = createTestWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useFontCRUD({ location: 'backend' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      result.current.reloadFonts();

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fonts', 'backend'] });
    });
  });
});