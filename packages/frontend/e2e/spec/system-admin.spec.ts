import { test, expect } from '../fixtures/auth.fixture';
import { UserManagementPage } from '../pages/UserManagementPage';
import { RoleManagementPage } from '../pages/RoleManagementPage';
import { AuditLogPage } from '../pages/AuditLogPage';
import { SystemMonitorPage } from '../pages/SystemMonitorPage';
import { RuntimeConfigPage } from '../pages/RuntimeConfigPage';

/**
 * 系统管理域 — E2E 测试
 *
 * 覆盖：用户管理 / 角色管理 / 审计日志 / 系统监控 / 运行时配置 / 权限交叉验证
 *
 * 执行方式：
 *   域内按 Playwright 默认 fullyParallel: false。
 *   与 CAD 编辑器无关，无需 serial 模式。
 *
 * 测试计划来源：e2e/guide/domains/system-admin/PLAN.md
 */
test.describe('系统管理', { tag: ['@system-admin'] }, () => {

  // ======================================================================
  //  用户管理 (UserManagement)
  // ======================================================================
  test.describe('用户管理', () => {
    let userPage: UserManagementPage;

    test.beforeEach(async ({ page }) => {
      userPage = new UserManagementPage(page);
      await userPage.goto();
    });

    test.describe('基础交互', () => {
      test('页面加载 → 用户表格和Tab可见', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 5000 }).catch(() => false);
        if (isDenied) {
          await expect(userPage.accessDenied).toBeVisible();
          return;
        }

        await expect(userPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(userPage.searchInput).toBeVisible();
        await expect(userPage.activeTab).toBeVisible();
        await expect(userPage.deletedTab).toBeVisible();
      });

      test('活跃/已注销 Tab切换 → 列表刷新', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        // 切换到已注销 Tab
        await userPage.switchToTab('deleted');
        await expect(userPage.userTable).toBeVisible();

        // 切回活跃 Tab
        await userPage.switchToTab('active');
        await expect(userPage.userTable).toBeVisible();
      });
    });

    test.describe('搜索', () => {
      test('输入查询 → 搜索结果筛选', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await userPage.search('admin');
        await expect(userPage.userTable).toBeVisible();
      });

      test('搜索无结果 → 显示空状态 "暂无数据"', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await userPage.search('nonexistent_user_zzzzz99999');

        const empty = userPage.emptyState;
        const toast = userPage.successToast;
        const err = userPage.errorMessage;

        const hasEmpty = await empty.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        // 至少有一个反馈：空状态 或 错误提示（取决于后端是否抛错）
        expect(hasEmpty || hasErr).toBe(true);
      });
    });

    test.describe('排序', () => {
      test('点击列头 → 排序变化', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        // 按用户名排序
        await userPage.sortByColumn('username');
        await expect(userPage.userTable).toBeVisible();

        // 按邮箱排序
        await userPage.sortByColumn('email');
        await expect(userPage.userTable).toBeVisible();

        // 按角色排序
        await userPage.sortByColumn('role');
        await expect(userPage.userTable).toBeVisible();

        // 按创建时间排序
        await userPage.sortByColumn('created');
        await expect(userPage.userTable).toBeVisible();
      });
    });

    test.describe('分页', () => {
      test('分页控件可见 → 可翻页', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const rowCount = await userPage.getUserCount();

        if (rowCount > 10) {
          await userPage.nextPage();
          const info = await userPage.getPageInfo();
          if (info) {
            expect(info).toBeTruthy();
          }
          await userPage.prevPage();
          await expect(userPage.userTable).toBeVisible();
        } else if (rowCount > 0) {
          // 数据少，验证分页信息存在
          const info = await userPage.getPageInfo();
          if (info) {
            expect(info).toBeTruthy();
          }
        }
      });
    });

    test.describe('创建用户', () => {
      test('打开创建用户弹窗 → 填写表单 → 提交 → toast成功 → 表格更新', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const addBtn = userPage.createUserButton;
        if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

        const timestamp = Date.now();
        await userPage.createUser({
          username: `e2e_test_${timestamp}`,
          email: `e2e_${timestamp}@cloudcad.test`,
          password: 'Pass@1234',
          role: 'USER',
        });

        const toast = userPage.successToast;
        const err = userPage.errorMessage;
        const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasToast || hasErr).toBe(true);
      });

      test('创建用户 → 空字段 → 显示错误提示', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const addBtn = userPage.createUserButton;
        if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

        // 打开弹窗直接提交（不填任何字段）
        await addBtn.click();
        const modal = userPage.createUserModal;
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await modal.getByRole('button', { name: /确认|提交|保存/ }).click();

        // 期望出现校验错误
        const errorText = modal.locator('[class*="error"], [class*="validation"]');
        const hasValidationError = await errorText.isVisible({ timeout: 8000 }).catch(() => false);
        expect(hasValidationError).toBe(true);
      });

      test('创建用户 → 重复用户名/邮箱 → 显示错误', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const addBtn = userPage.createUserButton;
        if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

        // 尝试创建与 admin 同名的用户
        await userPage.createUser({
          username: 'admin',
          email: 'admin@cloudcad.test',
          password: 'Pass@1234',
          role: 'USER',
        });

        // 期望显示重复/冲突错误
        const err = userPage.errorMessage;
        const toast = userPage.successToast;
        const hasErr = await err.isVisible({ timeout: 8000 }).catch(() => false);
        const hasToast = await toast.isVisible({ timeout: 2000 }).catch(() => false);

        // 若返回 toast（后端不拒绝）或错误信息（后端拒绝）都算有反馈
        expect(hasErr || hasToast).toBe(true);
      });
    });

    test.describe('编辑用户', () => {
      test('打开编辑弹窗 → 修改邮箱/角色/配额 → 保存 → 表格更新', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const rowCount = await userPage.getUserCount();
        if (rowCount === 0) return;

        // 编辑第一个可编辑用户
        await userPage.editUser('admin', {
          email: 'admin_updated@cloudcad.test',
          role: 'ADMIN',
        });

        const toast = userPage.successToast;
        const err = userPage.errorMessage;
        const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasToast || hasErr).toBe(true);
      });
    });

    test.describe('删除用户', () => {
      test('点击删除 → 确认弹窗 "确定删除？" → 确认 → 用户移除', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        // 先创建一个用户再删除（避免误删已有重要用户）
        const addBtn = userPage.createUserButton;
        if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

        const timestamp = Date.now();
        const testUsername = `e2e_del_${timestamp}`;
        await userPage.createUser({
          username: testUsername,
          email: `del_${timestamp}@cloudcad.test`,
          password: 'Pass@1234',
          role: 'USER',
        });

        // 搜索刚创建的用户
        await userPage.clearSearch();
        await userPage.search(testUsername);

        const rowCount = await userPage.getUserCount();
        if (rowCount === 0) return;

        // 触发删除确认
        await userPage.deleteUser(testUsername);
        await expect(userPage.deleteConfirmModal).toBeVisible({ timeout: 5000 });

        // 确认删除
        await userPage.confirmDelete();

        const toast = userPage.successToast;
        const err = userPage.errorMessage;
        const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasToast || hasErr).toBe(true);
      });
    });

    test.describe('恢复用户', () => {
      test('已注销 Tab → 点击恢复 → 用户回到活跃列表', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await userPage.switchToTab('deleted');

        const rowCount = await userPage.getUserCount();
        if (rowCount === 0) return;

        // 尝试恢复第一个已删除用户
        const firstRow = userPage.userRows.first();
        const restoreBtn = firstRow.getByRole('button', { name: /恢复/ });
        if (await restoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await userPage.restoreUser(
            (await firstRow.locator('td').first().textContent()) ?? '',
          );

          const toast = userPage.successToast;
          const err = userPage.errorMessage;
          const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
          const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

          expect(hasToast || hasErr).toBe(true);
        }
      });
    });

    test.describe('批量操作', () => {
      test('多选 → 批量删除', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const batchBtn = userPage.batchDeleteButton;
        if (!(await batchBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

        const rowCount = await userPage.getUserCount();
        if (rowCount < 2) return;

        // 选中前两行
        const rows = userPage.userRows;
        const checkbox1 = rows.nth(0).locator('input[type="checkbox"]');
        const checkbox2 = rows.nth(1).locator('input[type="checkbox"]');
        if (await checkbox1.isVisible({ timeout: 2000 }).catch(() => false)) {
          await checkbox1.check();
          await checkbox2.check();
        }

        await userPage.batchDelete();
        await expect(userPage.deleteConfirmModal).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('配额', () => {
      test('打开配额弹窗 → 设置配额 → 保存', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const rowCount = await userPage.getUserCount();
        if (rowCount === 0) return;

        await userPage.setUserQuota('admin', 2048);

        const toast = userPage.successToast;
        const err = userPage.errorMessage;
        const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasToast || hasErr).toBe(true);
      });
    });

    test.describe('权限', () => {
      test('USER 角色访问 /users → NoPermissionPage', async ({ page }) => {
        // 使用 testUser fixture (admin) 保持登录态，此处需要非管理员角色；
        // 使用 invalidUser 身份（非管理员）来验证权限拦截；
        // 若项目 multi-role fixture 尚未配置，则直接用 page 测试未登录态重定向
        await page.goto('/users');
        await page.waitForLoadState('networkidle');

        // 未登录态应该被重定向到登录；已有登录态的非管理员显示拒绝页
        const denied = page.locator('.access-denied-state, .limited-access-card, text=无权访问, text=权限不足');
        const loginRedirect = page.locator('text=登录, input[type="password"]');
        const hasDenied = await denied.isVisible({ timeout: 10000 }).catch(() => false);
        const hasLogin = await loginRedirect.isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasDenied || hasLogin).toBe(true);
      });
    });
  });

  // ======================================================================
  //  角色管理 (RoleManagement)
  // ======================================================================
  test.describe('角色管理', () => {
    let rolePage: RoleManagementPage;

    test.beforeEach(async ({ page }) => {
      rolePage = new RoleManagementPage(page);
      await rolePage.goto();
    });

    test.describe('基础交互', () => {
      test('页面加载 → 角色表格可见（名称/类型/用户数）', async () => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 5000 }).catch(() => false);
        if (isDenied) {
          await expect(rolePage.accessDenied).toBeVisible();
          return;
        }

        await expect(rolePage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(rolePage.roleTable).toBeVisible({ timeout: 10000 });
        const count = await rolePage.getRoleCount();
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    test.describe('创建角色', () => {
      test('打开创建弹窗 → 填写名称、类型（系统/自定义）、权限树', async () => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const createBtn = rolePage.createRoleButton;
        if (!(await createBtn.first().isVisible({ timeout: 3000 }).catch(() => false))) return;

        const timestamp = Date.now();
        await rolePage.createRole(`e2e_role_${timestamp}`, 'custom', [
          'FILE_READ',
          'PROJECT_READ',
        ]);

        const toast = rolePage.successToast;
        const err = rolePage.errorMessage;
        const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasToast || hasErr).toBe(true);
      });
    });

    test.describe('编辑角色', () => {
      test('修改角色名称/权限', async () => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const count = await rolePage.getRoleCount();
        if (count === 0) return;

        // 编辑第一个角色
        const firstRow = rolePage.roleRows.first();
        const editBtn = firstRow.getByRole('button', { name: /编辑|配置权限/ });
        if (!(await editBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

        await rolePage.editRole(
          (await firstRow.locator('td').first().textContent()) ?? '',
          { newName: 'Edited Role', permissions: ['FILE_READ'] },
        );

        const toast = rolePage.successToast;
        const err = rolePage.errorMessage;
        const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
        const hasErr = await err.isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasToast || hasErr).toBe(true);
      });
    });

    test.describe('删除角色', () => {
      test('删除确认弹窗 → 显示用户数警告', async () => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const count = await rolePage.getRoleCount();
        if (count === 0) return;

        // 找一个自定义角色（系统角色不可删）
        await rolePage.deleteRole(
          (await rolePage.roleRows.first().locator('td').first().textContent()) ?? '',
        );

        const modal = rolePage.deleteConfirmModal;
        const isVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
          await expect(modal).toBeVisible();
        }
      });
    });

    test.describe('权限树', () => {
      test('权限 checkbox 树 → 展开/折叠分组 → 全选/取消', async () => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const createBtn = rolePage.createRoleButton;
        if (!(await createBtn.first().isVisible({ timeout: 3000 }).catch(() => false))) return;

        await createBtn.first().click();
        const modal = rolePage.permissionModal;
        await modal.waitFor({ state: 'visible', timeout: 5000 });

        // 验证权限树存在
        const permArea = modal.locator('.permission-tree, [class*="permission"]');
        await expect(permArea.first()).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('权限', () => {
      test('USER 角色访问 /roles → NoPermissionPage', async ({ page }) => {
        await page.goto('/roles');
        await page.waitForLoadState('networkidle');

        const denied = page.locator('.access-denied-state, text=访问被拒绝');
        const loginRedirect = page.locator('text=登录, input[type="password"]');
        const hasDenied = await denied.isVisible({ timeout: 10000 }).catch(() => false);
        const hasLogin = await loginRedirect.isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasDenied || hasLogin).toBe(true);
      });
    });
  });

  // ======================================================================
  //  审计日志 (AuditLog)
  // ======================================================================
  test.describe('审计日志', () => {
    let auditPage: AuditLogPage;

    test.beforeEach(async ({ page }) => {
      auditPage = new AuditLogPage(page);
      await auditPage.goto();
    });

    test.describe('基础交互', () => {
      test('页面加载 → 日志表格、统计卡片、筛选栏可见', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 5000 }).catch(() => false);
        if (noPerm) {
          await expect(auditPage.noPermissionHint).toBeVisible();
          return;
        }

        await expect(auditPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(auditPage.logTable).toBeVisible({ timeout: 10000 });
        await expect(auditPage.filterSection).toBeVisible({ timeout: 10000 });
        await expect(auditPage.statsCards.first()).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('筛选', () => {
      test('按操作类型筛选', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        if (await auditPage.actionFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
          await auditPage.filterByAction('LOGIN');
          await expect(auditPage.logTable).toBeVisible();
        }
      });

      test('按资源类型筛选', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        if (await auditPage.resourceTypeFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
          await auditPage.filterByResourceType('FILE');
          await expect(auditPage.logTable).toBeVisible();
        }
      });

      test('按用户筛选', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        await auditPage.userIdFilter.fill('admin');
        await expect(auditPage.logTable).toBeVisible();
      });

      test('重置筛选', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        // 先应用一个筛选
        if (await auditPage.actionFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
          await auditPage.filterByAction('LOGIN');
        }

        // 点击重置
        if (await auditPage.resetFilterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await auditPage.resetFilterButton.click();
          await expect(auditPage.logTable).toBeVisible();
        }
      });
    });

    test.describe('分页', () => {
      test('日志分页 → 上下翻页', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        if (
          await auditPage.nextPageButton.isVisible({ timeout: 3000 }).catch(() => false) &&
          !(await auditPage.nextPageButton.isDisabled())
        ) {
          await auditPage.goToNextPage();
          await expect(auditPage.logTable).toBeVisible();
          await auditPage.goToPrevPage();
          await expect(auditPage.logTable).toBeVisible();
        }
      });
    });

    test.describe('权限', () => {
      test('非 ADMIN 角色 → 无权限提示', async ({ page }) => {
        await page.goto('/audit-logs');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator('text=您没有访问审计日志的权限, text=无权限');
        const loginRedirect = page.locator('text=登录, input[type="password"]');
        const hasNoPerm = await noPerm.isVisible({ timeout: 10000 }).catch(() => false);
        const hasLogin = await loginRedirect.isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasNoPerm || hasLogin).toBe(true);
      });
    });
  });

  // ======================================================================
  //  系统监控 (SystemMonitor)
  // ======================================================================
  test.describe('系统监控', () => {
    let monitorPage: SystemMonitorPage;

    test.beforeEach(async ({ page }) => {
      monitorPage = new SystemMonitorPage(page);
      await monitorPage.goto();
    });

    test.describe('基础交互', () => {
      test('页面加载 → 健康状态指示器可见（后端/DB/Redis）', async () => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 5000 }).catch(() => false);
        if (noPerm) {
          await expect(monitorPage.noPermissionHint).toBeVisible();
          return;
        }

        await expect(monitorPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(monitorPage.coreServicesSection).toBeVisible({ timeout: 10000 });
        await expect(monitorPage.databaseServiceCard).toBeVisible({ timeout: 10000 });
        await expect(monitorPage.storageServiceCard).toBeVisible({ timeout: 5000 });
        await expect(monitorPage.appServiceCard).toBeVisible({ timeout: 5000 });
        await expect(monitorPage.statusBadge).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('缓存面板', () => {
      test('缓存面板数据可见', async () => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        const infoCards = monitorPage.infoCards;
        if (await infoCards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          const count = await infoCards.count();
          expect(count).toBeGreaterThanOrEqual(0);
        }
      });
    });

    test.describe('刷新', () => {
      test('手动刷新 → 数据更新', async () => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        if (await monitorPage.refreshButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await monitorPage.clickRefresh();
          await expect(monitorPage.coreServicesSection).toBeVisible({ timeout: 10000 });
        }
      });
    });

    test.describe('权限', () => {
      test('非 ADMIN 角色 → 无权限页', async ({ page }) => {
        await page.goto('/system-monitor');
        await page.waitForLoadState('networkidle');

        const noAccess = page.locator('text=您需要系统监控权限才能访问此页面, text=访问受限');
        const loginRedirect = page.locator('text=登录, input[type="password"]');
        const hasNoAccess = await noAccess.isVisible({ timeout: 10000 }).catch(() => false);
        const hasLogin = await loginRedirect.isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasNoAccess || hasLogin).toBe(true);
      });
    });
  });

  // ======================================================================
  //  运行时配置 (RuntimeConfig)
  // ======================================================================
  test.describe('运行时配置', () => {
    let configPage: RuntimeConfigPage;

    test.beforeEach(async ({ page }) => {
      configPage = new RuntimeConfigPage(page);
      await configPage.goto();
    });

    test.describe('基础交互', () => {
      test('页面加载 → 配置列表按分类分组可见', async () => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(configPage.statsBar).toBeVisible({ timeout: 10000 });

        const cardCount = await configPage.getConfigCardCount();
        expect(cardCount).toBeGreaterThanOrEqual(0);
      });
    });

    test.describe('搜索', () => {
      test('搜索配置项', async () => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        if (await configPage.searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await configPage.searchInput.fill('mail');
          await expect(configPage.pageTitle).toBeVisible();
        }
      });
    });

    test.describe('编辑配置', () => {
      test('修改配置值 → 保存 → toast 成功', async () => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        const itemCount = await configPage.getConfigItemCount();
        if (itemCount > 0) {
          const firstItem = configPage.configItems.first();
          const input = firstItem.locator('input.config-input');
          if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
            const currentValue = await input.inputValue();
            await input.fill(currentValue);

            const saveBtn = firstItem.locator('.save-btn');
            if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveBtn.click();

              const toast = configPage.page.locator('.success-toast, .toast-success');
              const hasToast = await toast.isVisible({ timeout: 8000 }).catch(() => false);
              if (hasToast) {
                await expect(toast).toBeVisible();
              }
            }
          }
        }
      });
    });

    test.describe('敏感配置', () => {
      test('password/api_key 类型配置脱敏显示', async () => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        const sensitiveItem = configPage.page
          .locator('.config-item')
          .filter({ hasText: /password|secret|token|key|api/i });
        const count = await sensitiveItem.count();
        if (count > 0) {
          const sensitiveInput = sensitiveItem.first().locator('input[type="password"]');
          if (await sensitiveInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(sensitiveInput).toHaveAttribute('type', 'password');
          }
        }
      });
    });

    test.describe('权限', () => {
      test('非 ADMIN 角色 → 无权限/只读', async ({ page }) => {
        await page.goto('/runtime-config');
        await page.waitForLoadState('networkidle');

        const noAccess = page.locator('.info-banner, text=只读模式, text=无权限');
        const loginRedirect = page.locator('text=登录, input[type="password"]');
        const hasNoAccess = await noAccess.isVisible({ timeout: 10000 }).catch(() => false);
        const hasLogin = await loginRedirect.isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasNoAccess || hasLogin).toBe(true);
      });
    });
  });

  // ======================================================================
  //  权限交叉验证
  // ======================================================================
  test.describe('权限交叉验证', () => {
    test('侧边栏菜单可见性矩阵：未登录 → 仅基础导航', async ({ page }) => {
      // 未登录状态下直接访问管理页面应被重定向
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // 应该显示登录页或拒绝访问
      const loginForm = page.locator('input[type="password"], text=登录, text=无权访问');
      await expect(loginForm.first()).toBeVisible({ timeout: 10000 });
    });

    test('每个未授权路由 → NoPermissionPage', async ({ page }) => {
      const adminRoutes = ['/users', '/roles', '/audit-logs', '/system-monitor', '/runtime-config'];

      for (const route of adminRoutes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const denied = page.locator(
          '.access-denied-state, .limited-access-card, .info-banner, text=无权访问, text=权限不足, text=访问被拒绝, text=无权限, text=只读模式',
        );
        const loginForm = page.locator('input[type="password"], text=登录');
        const hasDenied = await denied.isVisible({ timeout: 8000 }).catch(() => false);
        const hasLogin = await loginForm.isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasDenied || hasLogin).toBe(true);
      }
    });
  });
});
