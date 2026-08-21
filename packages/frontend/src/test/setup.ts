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

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
