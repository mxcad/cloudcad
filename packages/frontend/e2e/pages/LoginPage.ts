import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly accountInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.accountInput = page.locator('input[name="account"], input[name="email"], input[type="text"]').first();
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.registerLink = page.locator('a[href*="register"]');
    this.forgotPasswordLink = page.locator('a[href*="forgot"]');
    this.errorAlert = page.locator('[role="alert"], .error-message, .alert-danger');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(account: string, password: string) {
    await this.accountInput.fill(account);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async togglePasswordVisibility() {
    await this.page.locator('button[aria-label*="password"]').click();
  }
}
