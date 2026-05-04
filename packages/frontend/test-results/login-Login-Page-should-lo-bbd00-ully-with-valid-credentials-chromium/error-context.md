# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> Login Page >> should login successfully with valid credentials
- Location: e2e\login.spec.ts:34:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://localhost:3000/"
Received: "http://localhost:3000/login"
Timeout:  15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    18 × unexpected value "http://localhost:3000/login"

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - button "切换到亮色模式" [ref=e6]:
    - generic [ref=e7]:
      - img [ref=e8]
      - img [ref=e14]
  - generic [ref=e16]:
    - generic [ref=e17]:
      - generic [ref=e18]:
        - img "梦想网页CAD实时协同平台" [ref=e21]
        - heading "梦想网页CAD实时协同平台" [level=1] [ref=e22]
        - paragraph [ref=e23]: 专业云端 CAD 图纸管理平台
      - generic [ref=e24]:
        - heading "欢迎回来" [level=2] [ref=e25]
        - paragraph [ref=e26]: 登录您的账户以继续
      - generic [ref=e27]:
        - img [ref=e28]
        - generic [ref=e30]: 登录失败，请检查账号和密码
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: 用户名
          - generic [ref=e34]:
            - img [ref=e35]
            - textbox "用户名" [ref=e38]:
              - /placeholder: 请输入用户名
              - text: admin
        - generic [ref=e40]:
          - generic [ref=e41]: 密码
          - generic [ref=e42]:
            - img [ref=e43]
            - textbox "密码" [ref=e46]:
              - /placeholder: 请输入密码
              - text: admin123
            - button [ref=e47] [cursor=pointer]:
              - img [ref=e48]
        - button "忘记密码？" [ref=e53] [cursor=pointer]
        - button "立即登录" [ref=e54] [cursor=pointer]:
          - generic [ref=e55]: 立即登录
          - img [ref=e56]
      - paragraph [ref=e59]:
        - text: 还没有账户？
        - button "立即注册" [ref=e60] [cursor=pointer]
      - generic [ref=e61]:
        - img [ref=e63] [cursor=pointer]
        - img [ref=e67] [cursor=pointer]
        - img [ref=e78] [cursor=pointer]
    - paragraph [ref=e81]: © 2026 梦想网页CAD实时协同平台. All rights reserved.
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
  31 |     await expect(loginPage.errorAlert).toBeVisible({ timeout: 10000 });
  32 |   });
  33 | 
  34 |   test('should login successfully with valid credentials', async ({ testUser }) => {
  35 |     await loginPage.login(testUser.account, testUser.password);
> 36 |     await expect(loginPage.page).toHaveURL('/', { timeout: 15000 });
     |                                  ^ Error: expect(page).toHaveURL(expected) failed
  37 |   });
  38 | 
  39 |   test('should toggle password visibility', async () => {
  40 |     await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  41 |     await loginPage.togglePasswordVisibility();
  42 |     await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
  43 |     await loginPage.togglePasswordVisibility();
  44 |     await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  45 |   });
  46 | });
```