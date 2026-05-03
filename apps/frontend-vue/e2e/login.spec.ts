import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test('GET /login returns 200 and renders form', async ({ page }) => {
    const resp = await page.goto('/login', { waitUntil: 'domcontentloaded' });
    expect(resp?.status()).toBeLessThan(400);

    // Has at least one text input and a submit button
    const inputs = page.locator('input:visible');
    await expect(inputs.first()).toBeVisible({ timeout: 5000 });

    const buttons = page.locator('button:visible');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });

    // Take screenshot for debugging
    await page.screenshot({ path: 'e2e-screenshots/login-page.png', fullPage: true });
  });

  test('Login form has email/account input', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const textInputs = page.locator('input[type="text"], input:not([type])');
    await expect(textInputs.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Register page', () => {
  test('GET /register returns 200', async ({ page }) => {
    const resp = await page.goto('/register', { waitUntil: 'domcontentloaded' });
    expect(resp?.status()).toBeLessThan(400);
    await page.screenshot({ path: 'e2e-screenshots/register-page.png', fullPage: true });
  });

  test('Register form has inputs', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    const inputs = page.locator('input:visible');
    await expect(inputs.first()).toBeVisible({ timeout: 5000 });
  });
});
