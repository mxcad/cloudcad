import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  // ── Legacy locators (backward compatible) ──
  readonly accountInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;
  readonly forgotPasswordLink: Locator;

  // ── Tab locators ──
  readonly accountTab: Locator;
  readonly phoneTab: Locator;

  // ── Account login form locators ──
  readonly passwordVisibilityToggle: Locator;
  readonly rememberMeCheckbox: Locator;

  // ── Phone login form locators ──
  readonly phoneInput: Locator;
  readonly smsCodeInput: Locator;
  readonly sendSmsCodeButton: Locator;

  // ── Third-party login ──
  readonly wechatLoginButton: Locator;

  // ── Feedback ──
  readonly errorToast: Locator;
  readonly loginHeaderLogo: Locator;

  constructor(page: Page) {
    this.page = page;

    // Legacy locators — kept identical for backward compatibility
    this.accountInput = page.locator('form input').first();
    this.passwordInput = page.locator('form input[type="password"]').first();
    this.submitButton = page.getByRole('button', { name: /登录|Sign In/i });
    this.registerLink = page.getByRole('button', { name: /注册|立即注册|Register/i });
    this.forgotPasswordLink = page.getByRole('button', { name: /忘记密码|Forgot/i });

    // Tab locators
    this.accountTab = page.getByText('账号登录');
    this.phoneTab = page.getByText('手机登录');

    // Account login form
    this.passwordVisibilityToggle = page.locator(
      '#password ~ button, [class*="password"] button, button:has([class*="eye"])'
    ).first();
    this.rememberMeCheckbox = page.getByLabel(/记住|自动登录|remember/i);

    // Phone login form
    this.phoneInput = page.getByLabel(/手机号|手机号码/);
    this.smsCodeInput = page.getByLabel(/验证码/);
    this.sendSmsCodeButton = page.getByRole('button', { name: /发送|获取验证码/i });

    // Third-party login
    this.wechatLoginButton = page.getByRole('button', { name: /微信登录/i });

    // Feedback
    this.errorToast = page.locator('[role="alert"]');
    this.loginHeaderLogo = page.locator('[class*="login"] img, [class*="Login"] img, header img');
  }

  // ──────────────────────────────────────────
  //  Navigation
  // ──────────────────────────────────────────

  async goto() {
    await this.page.goto('/login');
  }

  // ──────────────────────────────────────────
  //  Account login
  // ──────────────────────────────────────────

  /** Fill account + password and click submit. */
  async login(account: string, password: string) {
    await this.accountInput.fill(account);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Toggle password visibility (show/hide). */
  async togglePasswordVisibility() {
    await this.passwordVisibilityToggle.click();
  }

  /** Check/uncheck the "remember me" checkbox. */
  async setRememberMe(checked: boolean) {
    if (checked) {
      await this.rememberMeCheckbox.check();
    } else {
      await this.rememberMeCheckbox.uncheck();
    }
  }

  // ──────────────────────────────────────────
  //  Phone login
  // ──────────────────────────────────────────

  /** Switch to the phone-login tab. */
  async switchToPhoneLogin() {
    await this.phoneTab.click();
  }

  /** Switch back to the account-login tab. */
  async switchToAccountLogin() {
    await this.accountTab.click();
  }

  /**
   * Complete a phone + SMS-code login.
   * Clicks "send code" first, then fills the code and submits.
   */
  async loginWithPhone(phone: string, code: string) {
    await this.switchToPhoneLogin();
    await this.phoneInput.fill(phone);
    await this.sendSmsCodeButton.click();
    await this.smsCodeInput.fill(code);
    await this.submitButton.click();
  }

  // ──────────────────────────────────────────
  //  Third-party login
  // ──────────────────────────────────────────

  /** Click the WeChat login button. */
  async loginWithWechat() {
    await this.wechatLoginButton.click();
  }

  // ──────────────────────────────────────────
  //  Feedback & assertions
  // ──────────────────────────────────────────

  /**
   * Wait for the page to navigate away from /login (successful login).
   * @param timeout  Max wait in ms (default 10 s).
   */
  async waitForLoginSuccess(timeout = 10000) {
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout,
    });
  }

  /**
   * Wait for an error toast / alert to appear after a failed login attempt.
   * @param timeout  Max wait in ms (default 10 s).
   */
  async waitForLoginError(timeout = 10000) {
    await this.errorToast.first().waitFor({ state: 'visible', timeout });
  }

  /** Return the text content of the first visible error toast, or empty string. */
  async getErrorMessage(): Promise<string> {
    const toast = this.errorToast.first();
    if (await toast.isVisible().catch(() => false)) {
      return (await toast.textContent()) ?? '';
    }
    return '';
  }

  /** Returns true when the submit button shows a loading/spinner state. */
  async isSubmitLoading(): Promise<boolean> {
    const disabled = await this.submitButton.isDisabled();
    const loading =
      (await this.submitButton.locator('[class*="spin"], [class*="loading"], [role="progressbar"]').count()) > 0;
    return disabled || loading;
  }
}
