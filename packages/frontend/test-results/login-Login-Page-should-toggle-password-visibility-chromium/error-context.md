# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> Login Page >> should toggle password visibility
- Location: e2e\login.spec.ts:39:3

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: locator('form input[type="password"]').first()
Expected: "password"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for locator('form input[type="password"]').first()

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - heading "应用发生错误" [level=1] [ref=e4]
  - paragraph [ref=e5]: "Failed to fetch dynamically imported module: http://localhost:3000/src/pages/Login.tsx?t=1778413052105"
  - button "重试" [ref=e6] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from './fixtures/auth.fixture';
  2  | import { LoginPage } from './pages/LoginPage';
  3  | 
  4  | test.describe('Login Page', () => {
  5  |   let loginPage: LoginPage;
  6  | 
  7  |   test.beforeEach(async ({ page }) => {
  8  |     loginPage = new LoginPage(page);
  9  |     await loginPage.goto();
  10 |   });
  11 | 
  12 |   test('should display login form correctly', async () => {
  13 |     await expect(loginPage.accountInput).toBeVisible();
  14 |     await expect(loginPage.passwordInput).toBeVisible();
  15 |     await expect(loginPage.submitButton).toBeVisible();
  16 |     await expect(loginPage.registerLink).toBeVisible();
  17 |   });
  18 | 
  19 |   test('should navigate to register page', async () => {
  20 |     await loginPage.registerLink.click();
  21 |     await expect(loginPage.page).toHaveURL(/\/register/);
  22 |   });
  23 | 
  24 |   test('should navigate to forgot password page', async ({ page }) => {
  25 |     await loginPage.forgotPasswordLink.click();
  26 |     await expect(page).toHaveURL(/\/forgot-password/);
  27 |   });
  28 | 
  29 |   test('should show error with invalid credentials', async ({ invalidUser }) => {
  30 |     await loginPage.login(invalidUser.account, invalidUser.password);
  31 |     await expect(loginPage.errorToast).toBeVisible({ timeout: 10000 });
  32 |   });
  33 | 
  34 |   test('should login successfully with valid credentials', async ({ testUser }) => {
  35 |     await loginPage.login(testUser.account, testUser.password);
  36 |     await expect(loginPage.page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
  37 |   });
  38 | 
  39 |   test('should toggle password visibility', async () => {
> 40 |     await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
     |                                           ^ Error: expect(locator).toHaveAttribute(expected) failed
  41 |     await loginPage.togglePasswordVisibility();
  42 |     await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
  43 |     await loginPage.togglePasswordVisibility();
  44 |     await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  45 |   });
  46 | });
```