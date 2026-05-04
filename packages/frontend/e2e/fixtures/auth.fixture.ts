import { test as base, expect, type Page } from '@playwright/test';

/**
 * 模拟 API 响应，使 E2E 测试不依赖真实后端。
 *
 * 每个测试会自动拦截 /api/v1/* 请求并返回 mock 数据。
 * 测试可覆盖特定接口：
 *
 *   test.beforeEach(async ({ page }) => {
 *     await page.route('**/api/v1/auth/login', async route => {
 *       await route.fulfill({ json: { code: 200, data: { token: 'mock' } } });
 *     });
 *   });
 */

async function setupApiMocks(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const url = route.request().url();
    const method = route.request().method();

    // Auth login
    if (url.includes('/api/v1/auth/login') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            token: 'mock-token',
            refreshToken: 'mock-refresh-token',
            user: { id: '1', username: 'admin', nickname: '管理员', email: 'admin@example.com' },
          },
        }),
      });
    }

    // Auth profile
    if (url.includes('/api/v1/auth/profile')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'success', data: { id: '1', username: 'admin' } }),
      });
    }

    // Runtime config
    if (url.includes('/api/v1/runtime-config/public')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'success', data: {} }),
      });
    }

    // Projects list
    if (url.includes('/api/v1/file-system/projects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'success',
          data: { items: [], total: 0, page: 1, limit: 20 },
        }),
      });
    }

    // Personal space
    if (url.includes('/api/v1/file-system/personal-space')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'success', data: { id: 'space1', name: '个人空间' } }),
      });
    }

    // Default: return empty success
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'success', data: null }),
    });
  });
}

export type TestUser = { account: string; password: string };

export interface TestFixtures {
  testUser: TestUser;
  invalidUser: TestUser;
}

export const test = base.extend<TestFixtures>({
  page: async ({ page }, use) => {
    await setupApiMocks(page);
    await use(page);
  },
  testUser: async ({}, use) => {
    await use({ account: 'admin', password: 'Admin@123' });
  },
  invalidUser: async ({}, use) => {
    await use({ account: 'invalid', password: 'wrong' });
  },
});

export { expect };
