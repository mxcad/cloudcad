import { test as base, expect, type Page } from '@playwright/test';

/**
 * 通过 MSW 浏览器 worker 拦截 API 请求。
 * MSW 在 App 启动时自动注册（src/index.tsx），由 VITE_MSW=true 启用。
 * handler 定义在 src/test/msw/handlers.ts，与 Vitest 测试共享。
 */

export type TestUser = { account: string; password: string };

export interface TestFixtures {
  testUser: TestUser;
  invalidUser: TestUser;
  page: Page;
}

const baseWithCleanup = base
  .extend<TestFixtures>({
    testUser: async ({}, use) => {
      await use({ account: 'admin', password: 'Admin@123' });
    },
    invalidUser: async ({}, use) => {
      await use({ account: 'invalid', password: 'wrong' });
    },
  })
  .extend({
    page: async ({ page }, use) => {
      await page.goto('about:blank');
      try {
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      } catch {
        // ignore localStorage errors before page loads
      }
      await use(page);
    },
  });

export const test = baseWithCleanup;

export { expect };
