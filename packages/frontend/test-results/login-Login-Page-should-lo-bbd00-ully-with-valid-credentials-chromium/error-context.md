# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> Login Page >> should login successfully with valid credentials
- Location: e2e\login.spec.ts:34:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('form input').first()

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
  1   | import type { Page, Locator } from '@playwright/test';
  2   | 
  3   | export class LoginPage {
  4   |   readonly page: Page;
  5   | 
  6   |   // ── Legacy locators (backward compatible) ──
  7   |   readonly accountInput: Locator;
  8   |   readonly passwordInput: Locator;
  9   |   readonly submitButton: Locator;
  10  |   readonly registerLink: Locator;
  11  |   readonly forgotPasswordLink: Locator;
  12  | 
  13  |   // ── Tab locators ──
  14  |   readonly accountTab: Locator;
  15  |   readonly phoneTab: Locator;
  16  | 
  17  |   // ── Account login form locators ──
  18  |   readonly passwordVisibilityToggle: Locator;
  19  |   readonly rememberMeCheckbox: Locator;
  20  | 
  21  |   // ── Phone login form locators ──
  22  |   readonly phoneInput: Locator;
  23  |   readonly smsCodeInput: Locator;
  24  |   readonly sendSmsCodeButton: Locator;
  25  | 
  26  |   // ── Third-party login ──
  27  |   readonly wechatLoginButton: Locator;
  28  | 
  29  |   // ── Feedback ──
  30  |   readonly errorToast: Locator;
  31  |   readonly loginHeaderLogo: Locator;
  32  | 
  33  |   constructor(page: Page) {
  34  |     this.page = page;
  35  | 
  36  |     // Legacy locators — kept identical for backward compatibility
  37  |     this.accountInput = page.locator('form input').first();
  38  |     this.passwordInput = page.locator('form input[type="password"]').first();
  39  |     this.submitButton = page.getByRole('button', { name: /登录|Sign In/i });
  40  |     this.registerLink = page.getByRole('button', { name: /注册|立即注册|Register/i });
  41  |     this.forgotPasswordLink = page.getByRole('button', { name: /忘记密码|Forgot/i });
  42  | 
  43  |     // Tab locators
  44  |     this.accountTab = page.getByText('账号登录');
  45  |     this.phoneTab = page.getByText('手机登录');
  46  | 
  47  |     // Account login form
  48  |     this.passwordVisibilityToggle = page.locator(
  49  |       '#password ~ button, [class*="password"] button, button:has([class*="eye"])'
  50  |     ).first();
  51  |     this.rememberMeCheckbox = page.getByLabel(/记住|自动登录|remember/i);
  52  | 
  53  |     // Phone login form
  54  |     this.phoneInput = page.getByLabel(/手机号|手机号码/);
  55  |     this.smsCodeInput = page.getByLabel(/验证码/);
  56  |     this.sendSmsCodeButton = page.getByRole('button', { name: /发送|获取验证码/i });
  57  | 
  58  |     // Third-party login
  59  |     this.wechatLoginButton = page.getByRole('button', { name: /微信登录/i });
  60  | 
  61  |     // Feedback
  62  |     this.errorToast = page.locator('[role="alert"]');
  63  |     this.loginHeaderLogo = page.locator('[class*="login"] img, [class*="Login"] img, header img');
  64  |   }
  65  | 
  66  |   // ──────────────────────────────────────────
  67  |   //  Navigation
  68  |   // ──────────────────────────────────────────
  69  | 
  70  |   async goto() {
  71  |     await this.page.goto('/login');
  72  |   }
  73  | 
  74  |   // ──────────────────────────────────────────
  75  |   //  Account login
  76  |   // ──────────────────────────────────────────
  77  | 
  78  |   /** Fill account + password and click submit. */
  79  |   async login(account: string, password: string) {
> 80  |     await this.accountInput.fill(account);
      |                             ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  81  |     await this.passwordInput.fill(password);
  82  |     await this.submitButton.click();
  83  |   }
  84  | 
  85  |   /** Toggle password visibility (show/hide). */
  86  |   async togglePasswordVisibility() {
  87  |     await this.passwordVisibilityToggle.click();
  88  |   }
  89  | 
  90  |   /** Check/uncheck the "remember me" checkbox. */
  91  |   async setRememberMe(checked: boolean) {
  92  |     if (checked) {
  93  |       await this.rememberMeCheckbox.check();
  94  |     } else {
  95  |       await this.rememberMeCheckbox.uncheck();
  96  |     }
  97  |   }
  98  | 
  99  |   // ──────────────────────────────────────────
  100 |   //  Phone login
  101 |   // ──────────────────────────────────────────
  102 | 
  103 |   /** Switch to the phone-login tab. */
  104 |   async switchToPhoneLogin() {
  105 |     await this.phoneTab.click();
  106 |   }
  107 | 
  108 |   /** Switch back to the account-login tab. */
  109 |   async switchToAccountLogin() {
  110 |     await this.accountTab.click();
  111 |   }
  112 | 
  113 |   /**
  114 |    * Complete a phone + SMS-code login.
  115 |    * Clicks "send code" first, then fills the code and submits.
  116 |    */
  117 |   async loginWithPhone(phone: string, code: string) {
  118 |     await this.switchToPhoneLogin();
  119 |     await this.phoneInput.fill(phone);
  120 |     await this.sendSmsCodeButton.click();
  121 |     await this.smsCodeInput.fill(code);
  122 |     await this.submitButton.click();
  123 |   }
  124 | 
  125 |   // ──────────────────────────────────────────
  126 |   //  Third-party login
  127 |   // ──────────────────────────────────────────
  128 | 
  129 |   /** Click the WeChat login button. */
  130 |   async loginWithWechat() {
  131 |     await this.wechatLoginButton.click();
  132 |   }
  133 | 
  134 |   // ──────────────────────────────────────────
  135 |   //  Feedback & assertions
  136 |   // ──────────────────────────────────────────
  137 | 
  138 |   /**
  139 |    * Wait for the page to navigate away from /login (successful login).
  140 |    * @param timeout  Max wait in ms (default 10 s).
  141 |    */
  142 |   async waitForLoginSuccess(timeout = 10000) {
  143 |     await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
  144 |       timeout,
  145 |     });
  146 |   }
  147 | 
  148 |   /**
  149 |    * Wait for an error toast / alert to appear after a failed login attempt.
  150 |    * @param timeout  Max wait in ms (default 10 s).
  151 |    */
  152 |   async waitForLoginError(timeout = 10000) {
  153 |     await this.errorToast.first().waitFor({ state: 'visible', timeout });
  154 |   }
  155 | 
  156 |   /** Return the text content of the first visible error toast, or empty string. */
  157 |   async getErrorMessage(): Promise<string> {
  158 |     const toast = this.errorToast.first();
  159 |     if (await toast.isVisible().catch(() => false)) {
  160 |       return (await toast.textContent()) ?? '';
  161 |     }
  162 |     return '';
  163 |   }
  164 | 
  165 |   /** Returns true when the submit button shows a loading/spinner state. */
  166 |   async isSubmitLoading(): Promise<boolean> {
  167 |     const disabled = await this.submitButton.isDisabled();
  168 |     const loading =
  169 |       (await this.submitButton.locator('[class*="spin"], [class*="loading"], [role="progressbar"]').count()) > 0;
  170 |     return disabled || loading;
  171 |   }
  172 | }
  173 | 
```