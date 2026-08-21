import type { Page, Locator } from '@playwright/test';

/**
 * 忘记密码页 Page Object
 */
export class ForgotPasswordPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly emailTab: Locator;
  readonly phoneTab: Locator;
  readonly submitButton: Locator;
  readonly backToLoginLink: Locator;
  readonly themeToggle: Locator;
  readonly supportModal: Locator;
  readonly successPage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('#email');
    this.phoneInput = page.locator('#phone');
    this.emailTab = page.getByRole('button', { name: /邮箱/ });
    this.phoneTab = page.getByRole('button', { name: /手机号/ });
    this.submitButton = page.getByRole('button', { name: /发送验证码|发送中/ });
    this.backToLoginLink = page.getByText('返回登录');
    this.themeToggle = page.locator('.theme-toggle-wrapper');
    this.supportModal = page.locator('.support-modal-overlay');
    this.successPage = page.locator('.success-content');
  }

  async goto() {
    await this.page.goto('/forgot-password');
  }

  async switchToPhone() {
    await this.phoneTab.click();
  }

  async switchToEmail() {
    await this.emailTab.click();
  }

  async submitEmail(email: string) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }

  async getErrorAlert() {
    return this.page.locator('.alert.alert-error').first();
  }
}
