import { type Page, test as base, expect } from '@playwright/test';

/**
 * Multi-role authentication fixture for CloudCAD E2E tests.
 *
 * Provides role-based storageState switching so each test runs with the
 * correct pre-authenticated browser state.  Auth files live under
 * e2e/.auth/ and are named by role (e.g. admin.json, viewer.json).
 *
 * Usage in a spec file:
 * ```ts
 * import { test, expect } from '../fixtures/multi-role.fixture';
 *
 * test('VIEWER role → delete button hidden', async ({ adminPage }) => {
 *   await adminPage.goto('/projects');
 *   // …assertions…
 * });
 *
 * test.describe('editor permissions', () => {
 *   test.use({ role: 'editor' });
 *   test('can edit cad file', async ({ page }) => {
 *     await page.goto('/editor');
 *   });
 * });
 * ```
 */

// ── Role type definitions ────────────────────────────────────────────

export type SystemRole = 'admin' | 'user-manager' | 'font-manager' | 'user';

export type ProjectRole = 'owner' | 'admin' | 'member' | 'editor' | 'viewer';

export type RoleName = SystemRole | ProjectRole;

// ── Fixture options ──────────────────────────────────────────────────

interface MultiRoleOptions {
  /**
   * Which role's storage state to load.
   * @default 'admin'
   */
  role: RoleName;
}

// ── Helper page fixtures ─────────────────────────────────────────────

interface MultiRoleFixtures {
  /** Page pre-authenticated as admin (convenience alias). */
  adminPage: Page;
  /** Page pre-authenticated as a regular user. */
  userPage: Page;
}

// ── Extended test ────────────────────────────────────────────────────

/**
 * Playwright `test` object extended with multi-role support.
 *
 * All tests receive a `page` fixture whose auth state matches the
 * `role` option (or defaults to `'admin'`).
 */
export const test = base.extend<MultiRoleOptions & MultiRoleFixtures>({
  // ---- Option: role ----
  role: ['admin' as RoleName, { option: true }],

  // ---- storageState derived from role ----
  storageState: async ({ role }, use) => {
    await use(`e2e/.auth/${role}.json`);
  },

  // ---- Convenience helpers ----
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/admin.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  userPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'e2e/.auth/user.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
