// @ts-nocheck
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from './msw/handlers';

// ── MSW（与 Playwright E2E 共享 handler） ──
// 测试中覆盖特定接口：
//   import { http, HttpResponse } from 'msw';
//   server.use(http.post('/api/v1/auth/login', () => HttpResponse.json({ ... })));
//
// 未在 handlers.ts 中定义的接口会抛错（onUnhandledRequest: 'error'），
// 遇到时在 handlers.ts 中显式添加即可。

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
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
