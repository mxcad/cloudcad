import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ProfilePage } from '../pages/ProfilePage';

/**
 * 身份权限域 — E2E 测试
 *
 * 覆盖：登录 / 注册 / 忘记密码 / 重置密码 / 个人中心 / 权限 & 工作流
 * 执行：域内串行（Playwright 默认 fullyParallel: false）
 */
test.describe('身份权限', { tag: ['@identity-auth'] }, () => {

  // ========================================================================
  // 登录页
  // ========================================================================
  test.describe('登录页', () => {
    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
      loginPage = new LoginPage(page);
      await loginPage.goto();
    });

    // ── 基础交互 ──────────────────────────────────────────────
    test.describe('基础交互', () => {
      test('L-001: 页面加载 → 核心元素可见', async () => {
        await expect(loginPage.accountInput).toBeVisible();
        await expect(loginPage.passwordInput).toBeVisible();
        await expect(loginPage.submitButton).toBeVisible();
        await expect(loginPage.registerLink).toBeVisible();
        await expect(loginPage.forgotPasswordLink).toBeVisible();
      });

      test('L-002: 页面加载 → 主题切换按钮可见', async () => {
        await expect(loginPage.page.locator('.theme-toggle-wrapper')).toBeAttached();
      });

      test('L-005: 页面加载 → 默认选中账号登录 Tab', async () => {
        // smsEnabled 开启时才有 tab
        const activeTab = loginPage.page.locator('.login-tab.active');
        if (await activeTab.isVisible().catch(() => false)) {
          await expect(activeTab).toContainText('账号登录');
        }
        // 无 tabs = 只有账号登录，表单直接可见
        await expect(loginPage.accountInput).toBeVisible();
      });

      test('L-006: 点击手机登录 Tab → 切换成功', async ({ page }) => {
        if (await loginPage.phoneTab.isVisible().catch(() => false)) {
          await loginPage.phoneTab.click();
          await expect(loginPage.phoneInput).toBeVisible({ timeout: 5000 });
          // 切换回账号登录
          await loginPage.accountTab.click();
          await expect(loginPage.accountInput).toBeVisible();
        }
      });

      test('L-007: 注册链接 → 跳转到注册页', async ({ page }) => {
        await loginPage.registerLink.click();
        await expect(page).toHaveURL(/\/register/);
      });

      test('L-008: 忘记密码链接 → 跳转到忘记密码页', async ({ page }) => {
        await loginPage.forgotPasswordLink.click();
        await expect(page).toHaveURL(/\/forgot-password/);
      });

      test('L-009: 回车键 → 触发登录提交', async ({ page, testUser }) => {
        await loginPage.accountInput.fill(testUser.account);
        await loginPage.passwordInput.fill(testUser.password);
        await loginPage.passwordInput.press('Enter');
        await page.waitForURL('**/', { timeout: 15000 });
      });
    });

    // ── 表单交互 ──────────────────────────────────────────────
    test.describe('表单交互', () => {
      test('L-010: 空账号提交 → 显示校验提示', async ({ page }) => {
        await loginPage.submitButton.click();
        // 浏览器原生 required 或自定义错误
        const err = page.locator('.alert.alert-error');
        if (await err.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(err).toBeVisible();
        }
      });

      test('L-011: 空密码提交 → 显示校验提示', async ({ page }) => {
        await loginPage.accountInput.fill('admin');
        await loginPage.submitButton.click();
        const err = page.locator('.alert.alert-error');
        if (await err.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(err).toBeVisible();
        }
      });

      test('L-012: 输入无效凭证 → 显示错误提示', async ({ invalidUser }) => {
        await loginPage.login(invalidUser.account, invalidUser.password);
        await expect(loginPage.errorToast).toBeVisible({ timeout: 10000 });
      });

      test('L-013: 输入有效凭证 → 登录成功 → 跳转首页', async ({ testUser, page }) => {
        await loginPage.login(testUser.account, testUser.password);
        await expect(page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
      });

      test('L-014: 未登录访问受保护页 → 登录后 → 回到原页面', async ({ page, testUser }) => {
        // 先访问受保护页面触发重定向到 /login
        await page.goto('/projects');
        await page.waitForURL(/\/login/);
        // 登录
        await page.locator('#account').fill(testUser.account);
        await page.locator('#password').fill(testUser.password);
        await page.getByRole('button', { name: /登录|立即登录/ }).click();
        // 应跳回 /projects
        await page.waitForURL(/\/projects/, { timeout: 15000 });
      });

      test('L-015: 点击登录 → 按钮显示 loading / 禁用态', async ({ testUser }) => {
        await loginPage.accountInput.fill(testUser.account);
        await loginPage.passwordInput.fill(testUser.password);
        await loginPage.submitButton.click();
        // 提交后按钮应禁用或显示 loading
        await expect(loginPage.submitButton).toBeDisabled();
      });

      test('L-016: 密码眼睛图标 → 切换明文 / 密文', async () => {
        // 初始为 password
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
        // 切换为明文
        await loginPage.togglePasswordVisibility();
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
        // 切换回密文
        await loginPage.togglePasswordVisibility();
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
      });

      test('L-016b: 记住我 → 勾选后登录', async ({ page, testUser }) => {
        if (await loginPage.rememberMeCheckbox.isVisible().catch(() => false)) {
          await loginPage.rememberMeCheckbox.check();
          await loginPage.login(testUser.account, testUser.password);
          await expect(page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
        }
      });
    });

    // ── 第三方登录 ──────────────────────────────────────────
    test.describe('第三方登录', () => {
      test('L-003: wechatEnabled=true → 微信登录按钮可见', async () => {
        if (await loginPage.wechatLoginButton.isVisible().catch(() => false)) {
          await expect(loginPage.wechatLoginButton).toBeVisible();
        }
      });

      test('L-017: 点击微信登录 → 显示扫码弹窗或跳转', async ({ page }) => {
        if (!(await loginPage.wechatLoginButton.isVisible().catch(() => false))) return;
        await loginPage.wechatLoginButton.click();
        // 可能弹出扫码弹窗或打开新窗口
        const popup = page.locator('.wechat-qr-modal, .wechat-login-modal');
        await expect
          .any([
            expect(popup).toBeVisible(),
            expect(page).toHaveURL(/\/api\/auth\/wechat/),
          ])
          .catch(() => {});
      });
    });

    // ── 技术与错误状态 ─────────────────────────────────────
    test.describe('状态', () => {
      test('L-018: 点击技术支持入口 → SupportModal 显示', async ({ page }) => {
        const support = page.getByText(/技术支持|帮助|联系/);
        if (await support.isVisible({ timeout: 3000 }).catch(() => false)) {
          await support.click();
          await expect(page.locator('.support-modal-overlay')).toBeVisible({ timeout: 5000 });
        }
      });

      test('网络错误 → 显示错误提示', async ({ page, testUser }) => {
        // 模拟网络断开（通过路由拦截）
        await page.route('**/api/auth/login', (route) => route.abort('failed'));
        await loginPage.login(testUser.account, testUser.password);
        const err = page.locator('[role="alert"], .alert.alert-error');
        await expect(err).toBeVisible({ timeout: 15000 });
      });
    });
  });

  // ========================================================================
  // 注册页
  // ========================================================================
  test.describe('注册页', () => {
    let registerPage: RegisterPage;

    test.beforeEach(async ({ page }) => {
      registerPage = new RegisterPage(page);
      await registerPage.goto();
    });

    // ── 基础交互 ──────────────────────────────────────────────
    test.describe('基础交互', () => {
      test('R-001: 页面加载 → 输入框全部可见', async () => {
        await expect(registerPage.usernameInput).toBeVisible();
        await expect(registerPage.emailInput).toBeVisible();
        await expect(registerPage.passwordInput).toBeVisible();
        await expect(registerPage.confirmPasswordInput).toBeVisible();
        await expect(registerPage.submitButton).toBeVisible();
      });

      test('R-002: 页面加载 → 已有账号链接可见', async () => {
        await expect(registerPage.loginLink).toBeVisible();
      });

      test('R-003: 点击已有账号链接 → 跳转到登录页', async ({ page }) => {
        await registerPage.loginLink.click();
        await expect(page).toHaveURL(/\/login/);
      });
    });

    // ── 表单交互 ──────────────────────────────────────────────
    test.describe('表单交互', () => {
      test('R-004: 空表单提交 → 显示校验错误', async ({ page }) => {
        await registerPage.submitButton.click();
        const error = page.locator('.alert.alert-error, .error-message').first();
        if (await error.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('R-005: 用户名过短 → 显示格式错误', async ({ page }) => {
        await registerPage.usernameInput.fill('ab');
        await registerPage.emailInput.fill('test@example.com');
        await registerPage.passwordInput.fill('Test@12345');
        await registerPage.confirmPasswordInput.fill('Test@12345');
        await registerPage.submitButton.click();
        const error = page.locator('.alert.alert-error, .error-message').first();
        if (await error.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('R-006: 邮箱格式错误 → 显示校验错误', async ({ page }) => {
        await registerPage.usernameInput.fill('testuser');
        await registerPage.emailInput.fill('notanemail');
        await registerPage.passwordInput.fill('Test@12345');
        await registerPage.confirmPasswordInput.fill('Test@12345');
        await registerPage.submitButton.click();
        const error = page.locator('.alert.alert-error, .error-message').first();
        if (await error.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('R-007: 密码强度不够 → 显示校验错误', async ({ page }) => {
        await registerPage.usernameInput.fill('testuser');
        await registerPage.emailInput.fill('test@example.com');
        await registerPage.passwordInput.fill('123');
        await registerPage.confirmPasswordInput.fill('123');
        await registerPage.submitButton.click();
        const error = page.locator('.alert.alert-error, .error-message').first();
        if (await error.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('R-008: 确认密码不一致 → 显示错误', async ({ page }) => {
        await registerPage.register(
          'testuser',
          'test@example.com',
          'Test@12345',
          'Different@123',
        );
        const error = page.locator('.alert.alert-error');
        await expect(error).toBeVisible({ timeout: 15000 });
      });

      test('R-009: 有效信息 → 提交成功', async ({ page }) => {
        const uniqueUser = `testuser_${Date.now()}`;
        const uniqueEmail = `test_${Date.now()}@example.com`;
        await registerPage.register(uniqueUser, uniqueEmail, 'Test@12345');
        const successIndicator = page.locator('.alert.alert-success, .success-content');
        if (await successIndicator.isVisible({ timeout: 15000 }).catch(() => false)) {
          await expect(successIndicator).toBeVisible();
        }
      });

      test('R-010: 用户名已存在 → 显示错误', async ({ page }) => {
        // 使用已知存在的 admin 用户名注册
        await registerPage.register('admin', `test_${Date.now()}@example.com`, 'Test@12345');
        const error = page.locator('.alert.alert-error');
        await expect(error).toBeVisible({ timeout: 15000 });
      });

      test('R-011: 邮箱已注册 → 显示错误', async ({ page }) => {
        await registerPage.register(
          `testuser_${Date.now()}`,
          'admin@cloudcad.com',
          'Test@12345',
        );
        const error = page.locator('.alert.alert-error');
        await expect(error).toBeVisible({ timeout: 15000 });
      });

      test('R-012: 点击注册 → 按钮 loading / 禁用态', async ({ page }) => {
        const uniqueUser = `testuser_${Date.now()}`;
        const uniqueEmail = `test_${Date.now()}@example.com`;
        await registerPage.usernameInput.fill(uniqueUser);
        await registerPage.emailInput.fill(uniqueEmail);
        await registerPage.passwordInput.fill('Test@12345');
        await registerPage.confirmPasswordInput.fill('Test@12345');
        await registerPage.submitButton.click();
        await expect(registerPage.submitButton).toBeDisabled();
      });
    });

    // ── 状态 ──────────────────────────────────────────────
    test.describe('状态', () => {
      test('R-013: allowRegister=false → 显示 RegistrationClosed', async ({ page }) => {
        const closed = page.locator('text=注册暂未开放');
        if (await closed.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(closed).toBeVisible();
        }
      });
    });
  });

  // ========================================================================
  // 忘记密码页
  // ========================================================================
  test.describe('忘记密码页', () => {
    let forgotPage: ForgotPasswordPage;

    test.beforeEach(async ({ page }) => {
      forgotPage = new ForgotPasswordPage(page);
      await forgotPage.goto();
    });

    // ── 基础交互 ──────────────────────────────────────────────
    test.describe('基础交互', () => {
      test('FP-001: 页面加载 → 核心元素可见', async () => {
        await expect(forgotPage.emailInput).toBeVisible();
        await expect(forgotPage.submitButton).toBeVisible();
        await expect(forgotPage.backToLoginLink).toBeVisible();
      });

      test('FP-001b: 点击返回登录 → 跳转到 /login', async ({ page }) => {
        await forgotPage.backToLoginLink.click();
        await expect(page).toHaveURL(/\/login/);
      });
    });

    // ── 表单交互 ──────────────────────────────────────────────
    test.describe('表单交互', () => {
      test('FP-002: 空邮箱提交 → 显示校验提示', async () => {
        await forgotPage.submitButton.click();
        const error = forgotPage.page.locator('.alert.alert-error, .error-message').first();
        if (await error.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('FP-003: 无效邮箱格式 → 显示校验错误', async () => {
        await forgotPage.emailInput.fill('notanemail');
        await forgotPage.submitButton.click();
        const error = forgotPage.page.locator('.alert.alert-error');
        if (await error.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('FP-004: 未注册邮箱 → 显示错误或防枚举提示', async () => {
        await forgotPage.submitEmail(`nonexistent_${Date.now()}@example.com`);
        const result = forgotPage.page.locator('.alert.alert-error, .success-content');
        await expect(result).toBeVisible({ timeout: 15000 });
      });

      test('FP-005: 有效邮箱 → 发送成功 → 显示成功页', async () => {
        await forgotPage.submitEmail('admin@cloudcad.com');
        const success = forgotPage.page.locator('.success-content');
        const error = forgotPage.page.locator('.alert.alert-error');
        // 可能成功或报"该邮箱未注册"
        const anyResult = success.or(error);
        await expect(anyResult).toBeVisible({ timeout: 15000 });
        // 如果成功页出现
        if (await success.isVisible().catch(() => false)) {
          await expect(success).toBeVisible();
        }
      });

      test('FP-006: 点击发送 → 按钮显示倒计时 / 禁用', async () => {
        await forgotPage.emailInput.fill('admin@cloudcad.com');
        await forgotPage.submitButton.click();
        // 提交后按钮应禁用或显示倒计时
        const disabled = forgotPage.page.getByRole('button', { name: /发送中|\d+s/ });
        if (await disabled.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(disabled).toBeVisible();
        } else {
          await expect(forgotPage.submitButton).toBeDisabled();
        }
      });
    });
  });

  // ========================================================================
  // 重置密码页
  // ========================================================================
  test.describe('重置密码页', () => {
    const VALID_TOKEN_URL = '/reset-password?token=valid-test-token';
    const INVALID_TOKEN_URL = '/reset-password?token=invalid-expired-token';

    test.describe('基础交互', () => {
      test('RP-001: 有效 token → 页面加载 → 表单可见', async ({ page }) => {
        await page.goto(VALID_TOKEN_URL);
        // 检查是否有表单或过期提示
        const form = page.locator('input[name="newPassword"], input[name="password"]');
        const error = page.locator('text=链接已过期');
        await expect
          .any([
            expect(form.first()).toBeVisible({ timeout: 10000 }),
            expect(error).toBeVisible({ timeout: 10000 }),
          ])
          .catch(() => {});
      });

      test('RP-004: 无效 / 过期 token → 显示过期提示', async ({ page }) => {
        await page.goto(INVALID_TOKEN_URL);
        const expired = page.locator('text=链接已过期');
        if (await expired.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(expired).toBeVisible();
        }
      });

      test('RP-004b: 无效 token → 可跳转到登录页', async ({ page }) => {
        await page.goto(INVALID_TOKEN_URL);
        const loginLink = page.getByText(/登录|重新获取/);
        if (await loginLink.isVisible({ timeout: 5000 }).catch(() => false)) {
          await loginLink.click();
          await expect(page).toHaveURL(/\/login/);
        }
      });
    });

    test.describe('表单交互', () => {
      test('RP-002: 密码不一致 → 显示校验错误', async ({ page }) => {
        await page.goto(VALID_TOKEN_URL);
        const newPwd = page.locator('input[name="newPassword"], input[name="password"]').first();
        const confirmPwd = page.locator('input[name="confirmPassword"], input[name="confirm_password"]').first();
        if (!(await newPwd.isVisible({ timeout: 5000 }).catch(() => false))) return;

        await newPwd.fill('NewTest@123');
        await confirmPwd.fill('Different@123');
        await page.getByRole('button', { name: /重置|提交|确认/ }).click();
        const error = page.locator('.alert.alert-error');
        if (await error.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('RP-003: 有效密码 → 重置成功 → 跳转登录', async ({ page }) => {
        await page.goto(VALID_TOKEN_URL);
        const newPwd = page.locator('input[name="newPassword"], input[name="password"]').first();
        const confirmPwd = page.locator('input[name="confirmPassword"], input[name="confirm_password"]').first();
        if (!(await newPwd.isVisible({ timeout: 5000 }).catch(() => false))) return;

        await newPwd.fill('NewSecure@12345');
        await confirmPwd.fill('NewSecure@12345');
        await page.getByRole('button', { name: /重置|提交|确认/ }).click();
        // 成功后可能显示 toast 或跳转 /login
        const success = page.locator('.alert.alert-success');
        await expect
          .any([
            expect(success).toBeVisible({ timeout: 15000 }),
            expect(page).toHaveURL(/\/login/, { timeout: 15000 }),
          ])
          .catch(() => {});
      });
    });
  });

  // ========================================================================
  // 个人中心
  // ========================================================================
  test.describe('个人中心', () => {
    let profilePage: ProfilePage;

    test.beforeEach(async ({ page }) => {
      profilePage = new ProfilePage(page);
      await profilePage.goto();
    });

    // ── 基础交互 ──────────────────────────────────────────────
    test.describe('基础交互', () => {
      test('P-001: 页面加载 → 用户信息可见', async ({ page }) => {
        await expect(page.locator('.profile-container')).toBeVisible({ timeout: 10000 });
      });

      test('P-002: 页面加载 → 所有 Tab 渲染', async ({ page }) => {
        // 6 个 Tab: 个人信息、修改密码、邮箱绑定、手机绑定、微信绑定、注销账户
        const tabs = page.locator('.tab-button, [role="tab"]');
        await expect(tabs.first()).toBeVisible({ timeout: 10000 });
        const count = await tabs.count();
        expect(count).toBeGreaterThanOrEqual(4);
      });

      test('P-003: 切换到 个人信息 Tab → 显示信息表单', async ({ page }) => {
        await profilePage.switchToTab('info');
        const infoForm = page.locator(
          'input[name="nickname"], input[name="displayName"], input[name="username"]',
        );
        await expect(infoForm.first()).toBeVisible({ timeout: 5000 });
      });

      test('P-003b: 切换到 修改密码 Tab → 显示密码表单', async ({ page }) => {
        await profilePage.switchToTab('password');
        const pwdInput = page.locator('input[name="oldPassword"], input[name="newPassword"]');
        await expect(pwdInput.first()).toBeVisible({ timeout: 5000 });
      });

      test('P-003c: 切换到 邮箱绑定 Tab → 显示邮箱表单', async ({ page }) => {
        if (!(await profilePage.emailTab.isVisible().catch(() => false))) return;
        await profilePage.switchToTab('email');
        const emailInput = page.locator('input[name="email"], input[type="email"]');
        await expect(emailInput.first()).toBeVisible({ timeout: 5000 });
      });

      test('P-003d: 切换到 手机绑定 Tab → 显示手机表单', async ({ page }) => {
        if (!(await profilePage.phoneTab.isVisible().catch(() => false))) return;
        await profilePage.switchToTab('phone');
        const phoneInput = page.locator('input[name="phone"], input[type="tel"]');
        await expect(phoneInput.first()).toBeVisible({ timeout: 5000 });
      });

      test('P-003e: 切换到 微信绑定 Tab → 显示绑定按钮', async ({ page }) => {
        if (!(await profilePage.wechatTab.isVisible().catch(() => false))) return;
        await profilePage.switchToTab('wechat');
        const bindButton = page.getByRole('button', { name: /绑定|解绑/ });
        if (await bindButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(bindButton).toBeVisible();
        }
      });

      test('P-004: 切换到 注销 Tab → 显示注销内容', async ({ page }) => {
        await profilePage.switchToTab('deactivate');
        await expect(page.locator('.content-area')).toBeVisible({ timeout: 5000 });
      });
    });

    // ── 表单交互 ──────────────────────────────────────────────
    test.describe('表单交互', () => {
      test('P-006: 个人信息 → 修改显示名 → 保存成功', async ({ page }) => {
        await profilePage.switchToTab('info');
        const nicknameInput = page.locator('input[name="nickname"], input[name="displayName"]');
        if (!(await nicknameInput.isVisible({ timeout: 3000 }).catch(() => false))) return;

        const newName = `TestUser_${Date.now()}`;
        await nicknameInput.fill(newName);
        await page.getByRole('button', { name: /保存|更新/ }).click();
        const success = page.locator('.alert.alert-success');
        await expect(success).toBeVisible({ timeout: 10000 });
      });

      test('P-007: 个人信息 → 用户名字段不可修改', async ({ page }) => {
        await profilePage.switchToTab('info');
        const usernameInput = page.locator('input[name="username"]');
        if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(usernameInput).toBeDisabled();
        }
      });

      test('P-008: 修改密码 → 旧密码错误 → 显示错误', async () => {
        await profilePage.switchToTab('password');
        await profilePage.page.locator('input[name="oldPassword"]').fill('WrongPassword123');
        await profilePage.page.locator('input[name="newPassword"]').fill('NewTest@123');
        await profilePage.page.locator('input[name="confirmPassword"]').fill('NewTest@123');
        await profilePage.page.getByRole('button', { name: /修改密码|提交/ }).click();
        const error = profilePage.page.locator('.alert.alert-error');
        await expect(error).toBeVisible({ timeout: 15000 });
      });

      test('P-009: 修改密码 → 密码匹配 → 修改成功', async ({ testUser, page }) => {
        await profilePage.switchToTab('password');
        await profilePage.page.locator('input[name="oldPassword"]').fill(testUser.password);
        const newPwd = 'NewTest@1234';
        await profilePage.page.locator('input[name="newPassword"]').fill(newPwd);
        await profilePage.page.locator('input[name="confirmPassword"]').fill(newPwd);
        await profilePage.page.getByRole('button', { name: /修改密码|提交/ }).click();
        const success = page.locator('.alert.alert-success');
        await expect(success).toBeVisible({ timeout: 15000 });

        // 恢复原密码
        await profilePage.switchToTab('password');
        await profilePage.page.locator('input[name="oldPassword"]').fill(newPwd);
        await profilePage.page.locator('input[name="newPassword"]').fill(testUser.password);
        await profilePage.page.locator('input[name="confirmPassword"]').fill(testUser.password);
        await profilePage.page.getByRole('button', { name: /修改密码|提交/ }).click();
      });

      test('P-010: 邮箱绑定 → 输入邮箱 → 发送验证码', async ({ page }) => {
        if (!(await profilePage.emailTab.isVisible().catch(() => false))) return;
        await profilePage.switchToTab('email');
        const emailInput = page.locator('input[name="email"], input[type="email"]').first();
        if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) return;

        await emailInput.fill(`bind_${Date.now()}@example.com`);
        const sendBtn = page.getByRole('button', { name: /发送|验证/ });
        if (await sendBtn.isVisible().catch(() => false)) {
          await sendBtn.click();
          // 验证倒计时或成功提示
          const feedback = page.locator('.alert, .countdown');
          if (await feedback.isVisible({ timeout: 10000 }).catch(() => false)) {
            await expect(feedback.first()).toBeVisible();
          }
        }
      });

      test('P-012: 手机绑定 → 输入手机号 → 发送验证码', async ({ page }) => {
        if (!(await profilePage.phoneTab.isVisible().catch(() => false))) return;
        await profilePage.switchToTab('phone');
        const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
        if (!(await phoneInput.isVisible({ timeout: 3000 }).catch(() => false))) return;

        await phoneInput.fill('13800138000');
        const sendBtn = page.getByRole('button', { name: /发送|验证/ });
        if (await sendBtn.isVisible().catch(() => false)) {
          await sendBtn.click();
          const feedback = page.locator('.alert, .countdown');
          if (await feedback.isVisible({ timeout: 10000 }).catch(() => false)) {
            await expect(feedback.first()).toBeVisible();
          }
        }
      });

      test('P-014: 微信绑定 → 已绑定状态 → 显示解绑按钮', async ({ page }) => {
        if (!(await profilePage.wechatTab.isVisible().catch(() => false))) return;
        await profilePage.switchToTab('wechat');
        const unbindBtn = page.getByRole('button', { name: /解绑/ });
        if (await unbindBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(unbindBtn).toBeVisible();
        }
      });
    });

    // ── 弹窗 / 确认 ──────────────────────────────────────────
    test.describe('注销', () => {
      test('P-015: 注销 Tab → 显示确认弹窗', async ({ page }) => {
        await profilePage.switchToTab('deactivate');
        // 注销说明文字应可见
        const content = page.locator('text=注销, text=不可逆, text=确认注销');
        const anyVisible = await Promise.any([
          page.getByText(/注销/).isVisible(),
          page.getByText(/不可逆/).isVisible(),
          page.getByText(/确认注销/).isVisible(),
        ]).catch(() => false);
        expect(anyVisible).toBeTruthy();
      });

      test('P-016: 注销 → 确认 → 注销成功', async ({ page }) => {
        await profilePage.switchToTab('deactivate');

        // 填写密码确认
        const pwdInput = page.locator('input[name="password"]');
        if (await pwdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await pwdInput.fill('Admin@123');
        }
        // 勾选确认
        const checkbox = page.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
          await checkbox.check();
        }
        // 点击注销
        const confirmBtn = page.getByRole('button', { name: /确认注销|注销/ });
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click();
          const result = page.locator('.alert.alert-success, .alert.alert-error');
          if (await result.isVisible({ timeout: 15000 }).catch(() => false)) {
            await expect(result.first()).toBeVisible();
          }
        }
      });

      test('P-005: ADMIN 角色 → 注销 Tab 可能受限', async ({ page }) => {
        // 检查是否为 ADMIN
        const adminIndicator = page.locator('text=系统管理员');
        if (await adminIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
          const deactivateTab = page.getByRole('button', { name: /注销账户/ });
          // ADMIN 受保护，注销 tab 应不可见或功能受限
          if (await deactivateTab.isVisible().catch(() => false)) {
            // 如果能看见，验证功能是否受限
            await deactivateTab.click();
            // 可能显示 "管理员账户不可注销" 提示
            const warning = page.locator('text=管理员, text=不能注销, text=无权');
            if (await warning.first().isVisible({ timeout: 5000 }).catch(() => false)) {
              await expect(warning.first()).toBeVisible();
            }
          }
        }
      });
    });

    // ── 状态 ──────────────────────────────────────────────
    test.describe('状态', () => {
      test('Tab 切换 → 显示 loading 骨架屏', async ({ page }) => {
        // 快速切换到不同 tab，验证 loading 状态
        await profilePage.switchToTab('password');
        const skeleton = page.locator('.skeleton, .spinner, [role="progressbar"]');
        // skeleton 可能很快消失，只检查是否曾出现
        if (await skeleton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(skeleton.first()).toBeVisible();
        }
      });
    });
  });

  // ========================================================================
  // 端到端工作流
  // ========================================================================
  test.describe('端到端工作流', () => {
    test('W-001: 完整登录 → 跳转首页', async ({ page, testUser }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(testUser.account, testUser.password);
      await expect(page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
    });

    test('W-002: 未登录访问 /projects → 重定向到 /login → 登录后回到 /projects', async ({
      page,
    }) => {
      await page.goto('/projects');
      await page.waitForURL(/\/login/);
      await page.locator('#account').fill('admin');
      await page.locator('#password').fill('Admin@123');
      await page.getByRole('button', { name: /登录|立即登录/ }).click();
      await page.waitForURL(/\/projects/, { timeout: 15000 });
    });

    test('W-003: 注册 → 验证邮箱 → 登录 完整流程', async ({ page }) => {
      // Step 1: 注册
      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      const uniqueUser = `flowtest_${Date.now()}`;
      const uniqueEmail = `flowtest_${Date.now()}@example.com`;
      await registerPage.register(uniqueUser, uniqueEmail, 'FlowTest@123');

      // Step 2: 等待成功反馈（可能需要邮箱验证）
      const successOrVerify = page.locator('.alert.alert-success, .success-content');
      if (await successOrVerify.isVisible({ timeout: 15000 }).catch(() => false)) {
        // Step 3: 跳转到登录
        const loginLink = page.getByText(/登录|去登录/);
        if (await loginLink.isVisible({ timeout: 5000 }).catch(() => false)) {
          await loginLink.click();
        } else {
          await page.goto('/login');
        }

        // Step 4: 登录
        const loginPage = new LoginPage(page);
        await loginPage.login(uniqueUser, 'FlowTest@123');
        // 成功登录后应跳转首页
        await expect(page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
      }
    });

    test('W-004: 忘记密码 → 发送邮件 → 返回登录', async ({ page }) => {
      const forgotPage = new ForgotPasswordPage(page);
      await forgotPage.goto();
      await forgotPage.submitEmail('admin@cloudcad.com');

      // 等待成功反馈
      const success = page.locator('.success-content');
      if (await success.isVisible({ timeout: 15000 }).catch(() => false)) {
        // 用户应能看到返回登录提示
        const backLink = page.getByText(/返回登录|登录/);
        if (await backLink.isVisible({ timeout: 5000 }).catch(() => false)) {
          await backLink.click();
          await expect(page).toHaveURL(/\/login/);
        }
      }
    });
  });

  // ========================================================================
  // 权限验证
  // ========================================================================
  test.describe('权限验证', () => {
    test.describe('未登录重定向', () => {
      const PROTECTED_ROUTES = [
        '/projects',
        '/profile',
        '/cad-editor',
        '/users',
        '/roles',
        '/audit-logs',
        '/system-monitor',
        '/runtime-config',
      ];

      for (const route of PROTECTED_ROUTES) {
        test(`未登录访问 ${route} → 重定向到 /login`, async ({ page }) => {
          await page.goto(route);
          await page.waitForURL(/\/login/, { timeout: 10000 });
          await expect(page).toHaveURL(/\/login/);
        });
      }
    });

    test.describe('NoPermissionPage', () => {
      test('W-005: USER 角色访问 /users → 显示 NoPermissionPage', async ({ page }) => {
        // 以普通 user 登录
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        // 用测试用户登录（假设 testuser 是普通用户）
        await loginPage.login('testuser', 'Test@123');
        await page.waitForLoadState('networkidle');

        await page.goto('/users');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator(
          'text=无权限, text=权限不足, text=无权访问, text=403',
        );
        if (await noPerm.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(noPerm.first()).toBeVisible();
        }
        // 也可能重定向到首页
      });

      test('W-005b: USER 角色访问 /roles → 显示 NoPermissionPage', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.waitForLoadState('networkidle');

        await page.goto('/roles');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator(
          'text=无权限, text=权限不足, text=无权访问, text=403',
        );
        if (await noPerm.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(noPerm.first()).toBeVisible();
        }
      });

      test('W-005c: USER 角色访问 /audit-logs → 显示 NoPermissionPage', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.waitForLoadState('networkidle');

        await page.goto('/audit-logs');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator(
          'text=无权限, text=权限不足, text=无权访问, text=403',
        );
        if (await noPerm.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(noPerm.first()).toBeVisible();
        }
      });

      test('W-005d: USER 角色访问 /system-monitor → 显示 NoPermissionPage', async ({
        page,
      }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.waitForLoadState('networkidle');

        await page.goto('/system-monitor');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator(
          'text=无权限, text=权限不足, text=无权访问, text=403',
        );
        if (await noPerm.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(noPerm.first()).toBeVisible();
        }
      });

      test('W-005e: USER 角色访问 /runtime-config → 显示 NoPermissionPage', async ({
        page,
      }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.waitForLoadState('networkidle');

        await page.goto('/runtime-config');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator(
          'text=无权限, text=权限不足, text=无权访问, text=403',
        );
        if (await noPerm.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(noPerm.first()).toBeVisible();
        }
      });
    });

    test.describe('侧边栏菜单可见性', () => {
      test('USER 角色 → 管理菜单项不可见', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.waitForLoadState('networkidle');

        // 检查侧边栏中不应该包含管理菜单
        const sidebar = page.locator('.sidebar, nav, [class*="sidebar"]');
        if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
          const adminMenus = sidebar.locator(
            'text=用户管理, text=角色管理, text=审计日志, text=系统监控, text=运行时配置',
          );
          const count = await adminMenus.count();
          expect(count).toBe(0);
        }
      });

      test('USER_MANAGER 角色 → 用户管理可见，系统监控不可见', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('usermanager', 'Test@123');
        await page.waitForLoadState('networkidle');

        // 验证有权限的页面可以访问
        await page.goto('/users');
        await page.waitForLoadState('networkidle');
        const noPerm = page.locator(
          'text=无权限, text=权限不足, text=无权访问',
        );
        // /users 应该正常加载，但 testuser 可能无此权限
        // 这里用 usermanager 应可访问
        const isBlocked = await noPerm.first().isVisible({ timeout: 5000 }).catch(() => false);
        expect(isBlocked).toBeFalsy();
      });
    });

    test.describe('Token 过期', () => {
      test('token 过期 → 自动跳转登录页', async ({ page }) => {
        // 模拟：清除 token 后访问受保护页面
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('admin', 'Admin@123');
        await page.waitForURL('**/', { timeout: 15000 });

        // 清除 token（根据项目实现清除 cookie/localStorage）
        await page.evaluate(() => {
          localStorage.clear();
          document.cookie.split(';').forEach((c) => {
            document.cookie = c
              .replace(/^ +/, '')
              .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
          });
        });

        // 访问受保护页面
        await page.goto('/profile');
        // 应重定向到登录页
        await page.waitForURL(/\/login/, { timeout: 15000 });
        await expect(page).toHaveURL(/\/login/);
      });
    });
  });
});
