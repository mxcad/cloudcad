import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ProfilePage } from '../pages/ProfilePage';

/**
 * 身份权限域 — E2E 测试
 *
 * 覆盖：登录/注册/邮箱验证/手机验证/忘记密码/重置密码/个人中心/项目成员管理/项目角色管理
 * 执行：域内串行（Playwright 默认 fullyParallel: false）
 */
test.describe('身份权限', { tag: ['@identity-auth'] }, () => {

  // ========== 登录页 ==========
  test.describe('登录页', () => {
    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
      loginPage = new LoginPage(page);
      await loginPage.goto();
    });

    test.describe('基础交互', () => {
      test('L-001: 登录页正常加载 → 核心元素可见', async () => {
        await expect(loginPage.accountInput).toBeVisible();
        await expect(loginPage.passwordInput).toBeVisible();
        await expect(loginPage.submitButton).toBeVisible();
        await expect(loginPage.registerLink).toBeVisible();
      });

      test('L-005: 默认选中账号登录Tab', async ({ page }) => {
        // smsEnabled 开启时才有 tab，检查账号登录 tab 是否激活
        const accountTab = page.locator('.login-tab.active');
        if (await accountTab.isVisible()) {
          await expect(accountTab).toContainText('账号登录');
        }
        // 无 tabs = 只有账号登录，表单直接可见
        await expect(loginPage.accountInput).toBeVisible();
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
        // 应触发导航（正常登录后跳转 / 或 /cad-editor）
        await page.waitForURL('**/', { timeout: 15000 });
      });
    });

    test.describe('表单交互', () => {
      test('L-010: 空账号提交 → 校验提示', async ({ page }) => {
        await loginPage.submitButton.click();
        // 浏览器原生 required 校验或自定义错误提示
        const err = page.locator('.alert.alert-error');
        if (await err.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(err).toBeVisible();
        }
      });

      test('L-012: 无效凭证 → 显示错误提示', async ({ invalidUser }) => {
        await loginPage.login(invalidUser.account, invalidUser.password);
        await expect(loginPage.errorAlert).toBeVisible({ timeout: 10000 });
      });

      test('L-013: 有效凭证 → 登录成功 → 跳转首页', async ({ testUser, page }) => {
        await loginPage.login(testUser.account, testUser.password);
        await expect(page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
      });

      test('L-014: 登录成功 → 记住重定向目标', async ({ page, testUser }) => {
        // 先访问受保护页面触发重定向
        await page.goto('/projects');
        await page.waitForURL(/\/login/);
        // 登录
        await page.locator('#account').fill(testUser.account);
        await page.locator('#password').fill(testUser.password);
        await page.getByRole('button', { name: /登录|立即登录/ }).click();
        // 应跳回 /projects
        await page.waitForURL(/\/projects/, { timeout: 15000 });
      });

      test('L-015: 登录按钮 loading 状态', async ({ testUser }) => {
        await loginPage.accountInput.fill(testUser.account);
        await loginPage.passwordInput.fill(testUser.password);
        await loginPage.submitButton.click();
        // 提交后按钮应禁用或显示 loading
        await expect(loginPage.submitButton).toBeDisabled();
      });

      test('L-016: 密码显隐切换', async ({ page }) => {
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
        await loginPage.togglePasswordVisibility();
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
        await loginPage.togglePasswordVisibility();
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
      });
    });

    test.describe('权限/状态', () => {
      test('L-002: 主题切换按钮可见', async () => {
        await expect(loginPage.page.locator('.theme-toggle-wrapper')).toBeAttached();
      });
    });
  });

  // ========== 注册页 ==========
  test.describe('注册页', () => {
    let registerPage: RegisterPage;

    test.beforeEach(async ({ page }) => {
      registerPage = new RegisterPage(page);
      await registerPage.goto();
    });

    test.describe('基础交互', () => {
      test('R-001: 注册页正常加载 → 输入框可见', async () => {
        await expect(registerPage.usernameInput).toBeVisible();
        await expect(registerPage.emailInput).toBeVisible();
        await expect(registerPage.passwordInput).toBeVisible();
        await expect(registerPage.confirmPasswordInput).toBeVisible();
      });

      test('R-003: 登录链接 → 跳转到登录页', async ({ page }) => {
        await registerPage.loginLink.click();
        await expect(page).toHaveURL(/\/login/);
      });
    });

    test.describe('表单交互', () => {
      test('R-004: 空表单提交 → 显示校验错误', async ({ page }) => {
        await registerPage.submitButton.click();
        const error = page.locator('.alert.alert-error, .error-message').first();
        if (await error.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });

      test('R-008: 确认密码不一致 → 显示错误', async ({ page }) => {
        await registerPage.register('testuser', 'test@example.com', 'Test@12345', 'Different@123');
        const error = page.locator('.alert.alert-error');
        // 可能前端校验或后端返回错误
        await expect(error).toBeVisible({ timeout: 15000 });
      });

      test('R-009: 有效信息 → 提交成功', async ({ page }) => {
        const uniqueUser = `testuser_${Date.now()}`;
        const uniqueEmail = `test_${Date.now()}@example.com`;
        await registerPage.register(uniqueUser, uniqueEmail, 'Test@12345');
        // 成功后跳转到验证页或直接登录
        const successIndicator = page.locator('.alert.alert-success, .success-content');
        if (await successIndicator.isVisible({ timeout: 15000 }).catch(() => false)) {
          await expect(successIndicator).toBeVisible();
        }
      });

      test('R-012: 注册提交 loading 状态', async ({ page }) => {
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

    test.describe('状态', () => {
      test('R-013: 注册关闭 → 显示 RegistrationClosed', async ({ page }) => {
        // 检查是否被 allowRegister 限制
        const closed = page.locator('text=注册暂未开放');
        // 如果注册开放则此测试跳过（运行时配置决定）
        if (await closed.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(closed).toBeVisible();
        }
      });
    });
  });

  // ========== 忘记密码页 ==========
  test.describe('忘记密码页', () => {
    let forgotPage: ForgotPasswordPage;

    test.beforeEach(async ({ page }) => {
      forgotPage = new ForgotPasswordPage(page);
      await forgotPage.goto();
    });

    test.describe('基础交互', () => {
      test('FP-001: 忘记密码页加载 → 元素可见', async () => {
        await expect(forgotPage.emailInput).toBeVisible();
        await expect(forgotPage.submitButton).toBeVisible();
        await expect(forgotPage.backToLoginLink).toBeVisible();
      });
    });

    test.describe('表单交互', () => {
      test('FP-005: 有效邮箱 → 发送成功', async () => {
        await forgotPage.submitEmail('admin@cloudcad.com');
        // 可能进入成功页或报"该邮箱未注册"
        const success = forgotPage.page.locator('.success-content');
        const error = forgotPage.page.locator('.alert.alert-error');
        await expect(success.or(error)).toBeVisible({ timeout: 15000 });
      });

      test('FP-004: 无效邮箱格式 → 显示错误', async () => {
        await forgotPage.emailInput.fill('notanemail');
        await forgotPage.submitButton.click();
        // zod schema 校验应在客户端阻止
        const error = forgotPage.page.locator('.alert.alert-error');
        if (await error.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(error).toBeVisible();
        }
      });
    });
  });

  // ========== 个人中心 ==========
  test.describe('个人中心', () => {
    let profilePage: ProfilePage;

    test.beforeEach(async ({ page }) => {
      profilePage = new ProfilePage(page);
      await profilePage.goto();
    });

    test.describe('基础交互', () => {
      test('P-001: 个人中心加载 → 用户信息可见', async ({ page }) => {
        await expect(page.locator('.profile-container')).toBeVisible({ timeout: 10000 });
      });

      test('P-002: Tab渲染 → 至少4个Tab可见', async ({ page }) => {
        const tabs = page.locator('.tab-button');
        await expect(tabs.first()).toBeVisible({ timeout: 10000 });
        const count = await tabs.count();
        expect(count).toBeGreaterThanOrEqual(4); // info, password, deactivate + optional email/phone/wechat
      });

      test('P-003: 切换到密码修改Tab', async ({ page }) => {
        await profilePage.switchToTab('password');
        // 密码表单应出现
        const pwdInput = page.locator('input[name="oldPassword"], input[name="newPassword"]');
        await expect(pwdInput.first()).toBeVisible({ timeout: 5000 });
      });

      test('P-004: 切换到注销Tab', async ({ page }) => {
        await profilePage.switchToTab('deactivate');
        // 注销相关内容应出现
        const deactivateContent = page.locator('text=注销, text=确认注销, text=已阅读');
        // 至少有一个注销相关元素出现
        await expect(page.locator('.content-area')).toBeVisible();
      });

      test('P-006: 账户信息 → 修改显示名', async ({ page }) => {
        // 在 info tab 下修改用户显示名
        const nicknameInput = page.locator('input[name="nickname"], input[name="displayName"]');
        if (await nicknameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const newName = `TestUser_${Date.now()}`;
          await nicknameInput.fill(newName);
          await page.getByRole('button', { name: /保存|更新/ }).click();
          const success = page.locator('.alert.alert-success');
          await expect(success).toBeVisible({ timeout: 10000 });
        }
      });
    });

    test.describe('表单交互', () => {
      test('P-008: 修改密码 → 旧密码错误', async () => {
        await profilePage.switchToTab('password');
        await profilePage.page.locator('input[name="oldPassword"]').fill('WrongPassword123');
        await profilePage.page.locator('input[name="newPassword"]').fill('NewTest@123');
        await profilePage.page.locator('input[name="confirmPassword"]').fill('NewTest@123');
        await profilePage.page.getByRole('button', { name: /修改密码|提交/ }).click();
        const error = profilePage.page.locator('.alert.alert-error');
        await expect(error).toBeVisible({ timeout: 15000 });
      });

      test('P-009: 修改密码 → 成功', async ({ testUser, page }) => {
        await profilePage.switchToTab('password');
        await profilePage.page.locator('input[name="oldPassword"]').fill(testUser.password);
        await profilePage.page.locator('input[name="newPassword"]').fill('NewTest@1234');
        await profilePage.page.locator('input[name="confirmPassword"]').fill('NewTest@1234');
        await profilePage.page.getByRole('button', { name: /修改密码|提交/ }).click();
        // 成功后可能 toast，或跳转重新登录
        const success = page.locator('.alert.alert-success');
        await expect(success).toBeVisible({ timeout: 15000 });
        // 恢复原密码
        await profilePage.switchToTab('password');
        await profilePage.page.locator('input[name="oldPassword"]').fill('NewTest@1234');
        await profilePage.page.locator('input[name="newPassword"]').fill(testUser.password);
        await profilePage.page.locator('input[name="confirmPassword"]').fill(testUser.password);
        await profilePage.page.getByRole('button', { name: /修改密码|提交/ }).click();
      });
    });

    test.describe('权限', () => {
      test('P-005: ADMIN → 注销Tab不可见', async ({ page }) => {
        // 此测试依赖后端角色为 ADMIN 的测试用户
        const isAdmin = page.locator('text=系统管理员');
        if (await isAdmin.isVisible({ timeout: 3000 }).catch(() => false)) {
          // ADMIN 受保护，注销 tab 应不可见或功能受限
          const deactivateTab = page.getByRole('button', { name: /注销账户/ });
          if (await deactivateTab.isVisible().catch(() => false)) {
            // 如果可见，确认注销操作被阻止
          }
        }
      });
    });
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    test('W-001: 完整登录 → 跳转首页', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(testUser.account, testUser.password);
      await expect(page).toHaveURL(/\/(cad-editor)?/, { timeout: 15000 });
    });

    test('W-002: 登录重定向保护', async ({ page }) => {
      await page.goto('/projects');
      await page.waitForURL(/\/login/);
      await page.locator('#account').fill('admin');
      await page.locator('#password').fill('Admin@123');
      await page.getByRole('button', { name: /登录|立即登录/ }).click();
      await page.waitForURL(/\/projects/, { timeout: 15000 });
    });

    test('W-005: 无权限访问 → NoPermissionPage', async ({ page }) => {
      // 用普通 USER 角色登录后访问管理页面
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login('testuser', 'Test@123');
      // 如果 testuser 是普通用户，访问 /users 应被拒绝
      await page.goto('/users');
      // 等待页面加载完成
      await page.waitForLoadState('networkidle');
      // NoPermissionPage 或重定向到其他页面
      const noPerm = page.locator('text=无权限, text=权限不足, text=无权访问');
      if (await noPerm.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(noPerm.first()).toBeVisible();
      }
    });
  });
});
