import { vi } from 'vitest';

// 浏览器 API mock
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
})) as unknown as typeof ResizeObserver;

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
})) as unknown as typeof IntersectionObserver;
