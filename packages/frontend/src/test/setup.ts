import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// ── MSW 自动 mock ─────────────────────────────────────
// 所有 /api/v1/* 请求默认返回 200 + { data: null }
// 测试可覆盖特定 handler：
//   import { http, HttpResponse } from 'msw';
//   import { server } from '@/test/msw/server';
//
//   server.use(
//     http.post('/api/v1/auth/login', () =>
//       HttpResponse.json({ data: { token: 'xxx' } })),
//   );

export const server = setupServer(
  http.all(/\/api\/v1\/.+/, ({ request }) => {
    const method = request.method.toUpperCase();
    const body = method === 'GET' ? null : {};
    return HttpResponse.json({
      code: 200,
      message: 'success',
      data: body,
      timestamp: new Date().toISOString(),
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── 浏览器 API mock ──────────────────────────────────

global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
})) as any;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
})) as any;
