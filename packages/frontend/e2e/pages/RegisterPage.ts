import type { Page, Locator } from '@playwright/test';

/**
 * 注册页 Page Object
 */
export class RegisterPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly themeToggle: Locator;
  readonly registrationClosed: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('#username').or(page.locator('input[name="username"]'));
    this.emailInput = page.locator('#email').or(page.locator('input[name="email"]'));
    this.passwordInput = page.locator('input[name="password"]').first();
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]').or(page.locator('input[name="confirm_password"]'));
    this.submitButton = page.getByRole('button', { name: /注册|立即注册/ });
    this.loginLink = page.getByText('立即登录').or(page.getByText('已有账号'));
    this.themeToggle = page.locator('.theme-toggle-wrapper');
    this.registrationClosed = page.locator('text=注册暂未开放');
  }

  async goto() {
    await this.page.goto('/register');
  }

  async register(username: string, email: string, password: string, confirmPassword?: string) {
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword ?? password);
    await this.submitButton.click();
  }

  async getErrorAlert() {
    return this.page.locator('.alert.alert-error').first();
  }

  async getSuccessAlert() {
    return this.page.locator('.alert.alert-success').first();
  }
}
