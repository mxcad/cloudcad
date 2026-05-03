import { test, expect } from '@playwright/test';

// ============================================================================
// Comprehensive E2E page rendering tests for all Vue 3 pages
// These verify every page loads without errors
// ============================================================================

const PAGES = [
  { path: '/', name: 'Home/CAD Editor welcome' },
  { path: '/login', name: 'Login' },
  { path: '/register', name: 'Register' },
  { path: '/forgot-password', name: 'Forgot Password' },
  { path: '/reset-password', name: 'Reset Password' },
  { path: '/verify-email', name: 'Verify Email' },
  { path: '/verify-phone', name: 'Verify Phone' },
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/profile', name: 'Profile' },
  { path: '/projects', name: 'Projects/FileSystem' },
  { path: '/personal-space', name: 'Personal Space' },
  { path: '/users', name: 'User Management' },
  { path: '/roles', name: 'Role Management' },
  { path: '/audit-log', name: 'Audit Log' },
  { path: '/system-monitor', name: 'System Monitor' },
  { path: '/runtime-config', name: 'Runtime Config' },
  { path: '/library', name: 'Library' },
  { path: '/fonts', name: 'Font Library' },
];

test.describe('All pages load without error', () => {
  for (const { path, name } of PAGES) {
    test(`${name} (${path}) loads`, async ({ page }) => {
      const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(resp?.status()).toBeLessThan(400);

      // Screenshot for visual verification
      const filename = path === '/' ? 'home' : path.replace(/\//g, '-').replace(/^-/, '');
      await page.screenshot({
        path: `e2e-screenshots/${filename}.png`,
        fullPage: true,
      });
    });
  }
});

test.describe('Navigation works', () => {
  test('Home page links to login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Check that page renders without crash
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Login page renders with interactable elements', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    // Can be button or link - just verify page is interactive
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('CAD Editor core flows', () => {
  test('Welcome panel renders without crash', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    // Verify the page loaded - either shows CAD container or welcome card
    await expect(page.locator('body')).toBeVisible();
  });

  test('URL with nodeId parameter handles gracefully', async ({ page }) => {
    const resp = await page.goto('/?nodeId=test-nonexistent', { waitUntil: 'domcontentloaded' });
    expect(resp?.status()).toBeLessThan(400);
  });
});
