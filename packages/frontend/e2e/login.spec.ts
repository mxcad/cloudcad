import { test, expect } from './fixtures/auth.fixture';
import { LoginPage } from './pages/LoginPage';

test.describe('Login Page', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should display login form correctly', async () => {
    await expect(loginPage.accountInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.registerLink).toBeVisible();
  });

  test('should navigate to register page', async () => {
    await loginPage.registerLink.click();
    await expect(loginPage.page).toHaveURL(/\/register/);
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await loginPage.forgotPasswordLink.click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('should show error with invalid credentials', async ({ invalidUser }) => {
    await loginPage.login(invalidUser.account, invalidUser.password);
    await expect(loginPage.errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('should login successfully with valid credentials', async ({ testUser }) => {
    await loginPage.login(testUser.account, testUser.password);
    await expect(loginPage.page).toHaveURL('/', { timeout: 15000 });
  });

  test('should toggle password visibility', async () => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    await loginPage.togglePasswordVisibility();
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
    await loginPage.togglePasswordVisibility();
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });
});