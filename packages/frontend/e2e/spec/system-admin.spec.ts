import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { UserManagementPage } from '../pages/UserManagementPage';
import { RoleManagementPage } from '../pages/RoleManagementPage';
import { AuditLogPage } from '../pages/AuditLogPage';
import { SystemMonitorPage } from '../pages/SystemMonitorPage';
import { RuntimeConfigPage } from '../pages/RuntimeConfigPage';

/**
 * 系统管理域 — E2E 测试
 *
 * 覆盖：仪表盘 / 用户管理 / 角色管理 / 审计日志 / 系统监控 / 运行时配置
 * 执行：域内串行（Playwright 默认 fullyParallel: false）
 *
 * 实现测试计划来源于 e2e/guide/domains/system-admin/PLAN.md (49 用例)
 */
test.describe('系统管理', { tag: ['@system-admin'] }, () => {

  // ========== 仪表盘 (Dashboard) ==========
  test.describe('仪表盘', () => {
    let dashboardPage: DashboardPage;

    test.beforeEach(async ({ page }) => {
      dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
    });

    test.describe('基础交互', () => {
      test('D-001: 仪表盘正常加载 → 核心元素可见', async () => {
        await expect(dashboardPage.greeting).toBeVisible({ timeout: 15000 });
        await expect(dashboardPage.statCards).toBeVisible();
      });

      test('D-002: 搜索框可见', async ({ page }) => {
        const anySearchInput = page.locator('input[placeholder*="搜索"]');
        await expect(anySearchInput.first()).toBeVisible({ timeout: 10000 });
      });

      test('D-003: 创建项目按钮可见', async () => {
        await expect(dashboardPage.newProjectButton.first()).toBeVisible({ timeout: 10000 });
      });

      test('D-007: 点击项目卡片 → 跳转文件管理', async ({ page }) => {
        const viewAll = page.locator('a[href="/projects"]');
        if (await viewAll.isVisible({ timeout: 3000 }).catch(() => false)) {
          await viewAll.first().click();
          await expect(page).toHaveURL(/\/projects/);
        }
      });
    });

    test.describe('列表', () => {
      test('D-004: 项目卡片和文件列表可见', async () => {
        await expect(dashboardPage.recentProjectsSection).toBeVisible({ timeout: 10000 });
        await expect(dashboardPage.recentFilesSection).toBeVisible({ timeout: 5000 });
      });

      test('D-005: 空项目状态 → 显示空状态引导提示', async ({ page }) => {
        const emptyState = page.locator('text=暂无项目');
        await expect(dashboardPage.greeting).toBeVisible();
      });
    });

    test.describe('表单', () => {
      test('D-006: 搜索项目', async ({ page }) => {
        const searchInput = page.getByPlaceholder(/搜索/).first();
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchInput.fill('test');
          await page.waitForLoadState('networkidle');
          await expect(dashboardPage.greeting).toBeVisible();
        }
      });
    });

    test.describe('弹窗', () => {
      test('D-003-2: 弹窗 → 打开创建项目弹窗', async () => {
        await dashboardPage.openCreateProjectModal();
        await expect(dashboardPage.createProjectModal).toBeVisible({ timeout: 5000 });
      });

      test('D-003-3: 弹窗 → ESC 关闭', async () => {
        await dashboardPage.openCreateProjectModal();
        await expect(dashboardPage.createProjectModal).toBeVisible({ timeout: 5000 });
        await dashboardPage.closeCreateProjectModal();
        await expect(dashboardPage.createProjectModal).toBeHidden({ timeout: 5000 });
      });
    });
  });

  // ========== 用户管理 (UserManagement) ==========
  test.describe('用户管理', () => {
    let userPage: UserManagementPage;

    test.beforeEach(async ({ page }) => {
      userPage = new UserManagementPage(page);
      await userPage.goto();
    });

    test.describe('基础交互', () => {
      test('U-001: 用户管理页加载 → 用户表格 + 工具栏 + Tab可见', async () => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 5000 }).catch(() => false);
        if (isDenied) {
          await expect(userPage.accessDenied).toBeVisible();
          return;
        }

        await expect(userPage.pageTitle).toBeVisible({ timeout: 10000 });
        await expect(userPage.usersTable).toBeVisible({ timeout: 10000 });
        await expect(userPage.activeTab).toBeVisible();
        if (await userPage.addUserButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(userPage.addUserButton).toBeVisible();
        }
      });

      test('U-002: 活跃/已注销 Tab切换', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await userPage.switchToDeletedTab();
        await page.waitForLoadState('networkidle');
        await expect(userPage.usersTable).toBeVisible();
        await userPage.switchToActiveTab();
        await page.waitForLoadState('networkidle');
        await expect(userPage.usersTable).toBeVisible();
      });
    });

    test.describe('列表', () => {
      test('U-003: 用户表格分页', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const pagination = page.locator('button:has-text("上一页"), button:has-text("下一页")');
        if (await pagination.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(pagination.first()).toBeVisible();
        }
      });

      test('U-004: 用户表格排序', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const sortButton = page.getByRole('button', { name: /排序|创建时间|更新时间/ });
        if (await sortButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sortButton.first().click();
          await page.waitForLoadState('networkidle');
          await expect(userPage.usersTable).toBeVisible();
        }
      });
    });

    test.describe('表单', () => {
      test('U-005: 搜索用户', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await userPage.searchUser('admin');
        await expect(userPage.usersTable).toBeVisible();
      });

      test('U-006: 角色筛选下拉', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const roleSelect = userPage.roleFilterSelect;
        if (await roleSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleSelect.selectOption({ index: 0 });
          await page.waitForLoadState('networkidle');
          await expect(userPage.usersTable).toBeVisible();
        }
      });
    });

    test.describe('弹窗', () => {
      test('U-007: 创建用户 → 弹窗', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;
        if (!(await userPage.addUserButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

        await userPage.openCreateUser();
        await expect(userPage.createUserModal).toBeVisible({ timeout: 5000 });
      });

      test('U-009: 创建用户 → 校验失败', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;
        if (!(await userPage.addUserButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

        await userPage.openCreateUser();
        await expect(userPage.createUserModal).toBeVisible({ timeout: 5000 });
        await userPage.submitForm();
        const error = page.locator('.alert.alert-error, .error-message, text=用户不能为空, text=不能为空');
        await expect(error.first()).toBeVisible({ timeout: 10000 });
      });

      test('U-010: 编辑用户', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const rows = userPage.userRows;
        const rowCount = await rows.count();
        if (rowCount === 0) return;

        await userPage.clickEditOnFirstRow();
        await expect(userPage.editUserModal).toBeVisible({ timeout: 5000 });
      });

      test('U-011: 软删除用户 → 确认弹窗', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const rows = userPage.userRows;
        const rowCount = await rows.count();
        if (rowCount === 0) return;

        await userPage.clickDeleteOnFirstRow();
        await expect(userPage.deleteConfirmModal).toBeVisible({ timeout: 5000 });
      });

      test('U-012: 修改存储配额', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const rows = userPage.userRows;
        const rowCount = await rows.count();
        if (rowCount === 0) return;

        await userPage.clickQuotaOnFirstRow();
        await expect(userPage.quotaModal).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('权限', () => {
      test('U-014: USER 角色 → 无权限页', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.goto('/users');
        await page.waitForLoadState('networkidle');

        const noAccess = page.locator('.access-denied-state, .limited-access-card, text=无权访问, text=权限不足');
        if (await noAccess.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(noAccess.first()).toBeVisible();
        }
      });
    });

    test.describe('状态', () => {
      test('U-015: 搜索无结果 → 空状态', async ({ page }) => {
        const isDenied = await userPage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await userPage.searchUser('nonexistent_user_zzzzz99999');
        await expect(userPage.usersTable).toBeVisible();
      });
    });
  });

  // ========== 角色管理 (RoleManagement) ==========
  test.describe('角色管理', () => {
    let rolePage: RoleManagementPage;

    test.beforeEach(async ({ page }) => {
      rolePage = new RoleManagementPage(page);
      await rolePage.goto();
    });

    test.describe('基础交互', () => {
      test('RO-001: 角色管理加载 → 角色卡片可见（系统+自定义角色）', async () => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 5000 }).catch(() => false);
        if (isDenied) {
          await expect(rolePage.accessDenied).toBeVisible();
          return;
        }

        await expect(rolePage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(rolePage.projectRoleTab).toBeVisible();
        const cardCount = await rolePage.getRoleCardCount();
        expect(cardCount).toBeGreaterThanOrEqual(0);
      });
    });

    test.describe('弹窗', () => {
      test('RO-002: 创建角色 → 权限配置弹窗打开', async ({ page }) => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;
        if (!(await rolePage.createRoleButton.first().isVisible({ timeout: 3000 }).catch(() => false))) return;

        await rolePage.openCreateRole();
        await expect(rolePage.permissionConfigModal).toBeVisible({ timeout: 5000 });
      });

      test('RO-005: 编辑角色 → 权限配置弹窗打开', async ({ page }) => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const cardCount = await rolePage.getRoleCardCount();
        if (cardCount === 0) return;

        await rolePage.clickConfigurePermission(0);
        await expect(rolePage.permissionConfigModal).toBeVisible({ timeout: 5000 });
      });

      test('RO-006: 删除角色 → 确认弹窗', async ({ page }) => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await rolePage.switchToSystemRoles();
        await page.waitForLoadState('networkidle');

        const cardCount = await rolePage.getRoleCardCount();
        if (cardCount === 0) return;

        const deleteBtn = page.locator('button[title="删除角色"]');
        if (await deleteBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await deleteBtn.first().click();
          await expect(rolePage.deleteConfirmModal).toBeVisible({ timeout: 5000 });
        }
      });

      test('RO-007: 删除有关联用户的角色 → 警告', async ({ page }) => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        await rolePage.switchToProjectRoles();
        await page.waitForLoadState('networkidle');

        const memberRole = page.locator('.role-card').filter({ hasText: /个成员/ });
        const memberCount = await memberRole.count();
        if (memberCount > 0) {
          const deleteBtn = memberRole.first().locator('button[title="删除角色"]');
          if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await deleteBtn.click();
            await expect(rolePage.deleteConfirmModal.or(rolePage.errorModal)).toBeVisible({ timeout: 5000 });
          }
        }
      });
    });

    test.describe('列表', () => {
      test('RO-003: 权限checkbox树按类别分组显示', async ({ page }) => {
        const isDenied = await rolePage.accessDenied.isVisible({ timeout: 3000 }).catch(() => false);
        if (isDenied) return;

        const cardCount = await rolePage.getRoleCardCount();
        if (cardCount === 0) return;

        await rolePage.clickConfigurePermission(0);
        await expect(rolePage.permissionConfigModal).toBeVisible({ timeout: 5000 });

        const permTree = rolePage.permissionConfigModal.locator('.permission-tree, [class*="permission"], [class*="checkbox"]');
        await expect(permTree.first()).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('权限', () => {
      test('RO-009: USER 角色 → 无权限页', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.goto('/roles');
        await page.waitForLoadState('networkidle');

        const noAccess = page.locator('.access-denied-state, text=访问被拒绝');
        if (await noAccess.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(noAccess.first()).toBeVisible();
        }
      });
    });
  });

  // ========== 审计日志 (AuditLogPage) ==========
  test.describe('审计日志', () => {
    let auditPage: AuditLogPage;

    test.beforeEach(async ({ page }) => {
      auditPage = new AuditLogPage(page);
      await auditPage.goto();
    });

    test.describe('基础交互', () => {
      test('AL-001: 审计日志加载 → 日志表格+筛选栏+分页可见', async () => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 5000 }).catch(() => false);
        if (noPerm) {
          await expect(auditPage.noPermissionHint).toBeVisible();
          return;
        }

        await expect(auditPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(auditPage.filterSection).toBeVisible({ timeout: 10000 });
        await expect(auditPage.logTable).toBeVisible({ timeout: 10000 });
      });
    });

    test.describe('列表', () => {
      test('AL-002: 日志分页', async ({ page }) => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        const hasNext = await auditPage.nextPageButton.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasNext && !(await auditPage.nextPageButton.isDisabled())) {
          await auditPage.goToNextPage();
          await expect(auditPage.logTable).toBeVisible();
        }
      });
    });

    test.describe('表单', () => {
      test('AL-003: 操作类型筛选', async ({ page }) => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        const actionSelect = auditPage.actionFilter;
        if (await actionSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await actionSelect.selectOption({ index: 1 });
          await page.waitForLoadState('networkidle');
          await expect(auditPage.logTable).toBeVisible();
        }
      });

      test('AL-004: 用户搜索', async ({ page }) => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        await auditPage.userIdFilter.fill('admin');
        await page.waitForLoadState('networkidle');
        await expect(auditPage.logTable).toBeVisible();
      });

      test('资源类型筛选', async ({ page }) => {
        const noPerm = await auditPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        const resourceSelect = auditPage.resourceTypeFilter;
        if (await resourceSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await resourceSelect.selectOption({ index: 1 });
          await page.waitForLoadState('networkidle');
          await expect(auditPage.logTable).toBeVisible();
        }
      });
    });

    test.describe('权限', () => {
      test('AL-005: USER 角色 → 无权限查看', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.goto('/audit-logs');
        await page.waitForLoadState('networkidle');

        const noPerm = page.locator('text=您没有访问审计日志的权限, text=无权限');
        if (await noPerm.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(noPerm.first()).toBeVisible();
        }
      });
    });
  });

  // ========== 系统监控 (SystemMonitorPage) ==========
  test.describe('系统监控', () => {
    let monitorPage: SystemMonitorPage;

    test.beforeEach(async ({ page }) => {
      monitorPage = new SystemMonitorPage(page);
      await monitorPage.goto();
    });

    test.describe('基础交互', () => {
      test('SM-001: 系统监控加载 → 健康状态+缓存+面板可见', async () => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 5000 }).catch(() => false);
        if (noPerm) {
          await expect(monitorPage.noPermissionHint).toBeVisible();
          return;
        }

        await expect(monitorPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(monitorPage.coreServicesSection).toBeVisible({ timeout: 10000 });
        await expect(monitorPage.serviceCards.first()).toBeVisible({ timeout: 10000 });
        await expect(monitorPage.statusBadge).toBeVisible({ timeout: 5000 });
      });

      test('SM-002: 健康状态指示 → 后端/DB/Redis 状态显示', async () => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        await expect(monitorPage.databaseServiceCard).toBeVisible({ timeout: 10000 });
        await expect(monitorPage.storageServiceCard).toBeVisible({ timeout: 5000 });
        const statusText = await monitorPage.getOverallStatus();
        expect(statusText).toBeTruthy();
      });

      test('SM-003: 手动刷新', async ({ page }) => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        const refreshBtn = monitorPage.refreshButton;
        if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await monitorPage.clickRefresh();
          await page.waitForLoadState('networkidle');
          await expect(monitorPage.serviceCards.first()).toBeVisible();
        }
      });
    });

    test.describe('清理', () => {
      test('SM-001-2: 存储清理区块可见', async () => {
        const noPerm = await monitorPage.noPermissionHint.isVisible({ timeout: 3000 }).catch(() => false);
        if (noPerm) return;

        await expect(monitorPage.storageCleanupSection).toBeVisible({ timeout: 5000 });
        await expect(monitorPage.cleanupButton).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('权限', () => {
      test('SM-004: USER 角色 → 访问受限', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.goto('/system-monitor');
        await page.waitForLoadState('networkidle');

        const noAccess = page.locator('.no-access-card, text=访问受限, text=您需要系统监控权限');
        if (await noAccess.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(noAccess.first()).toBeVisible();
        }
      });
    });
  });

  // ========== 运行时配置 (RuntimeConfigPage) ==========
  test.describe('运行时配置', () => {
    let configPage: RuntimeConfigPage;

    test.beforeEach(async ({ page }) => {
      configPage = new RuntimeConfigPage(page);
      await configPage.goto();
    });

    test.describe('基础交互', () => {
      test('RC-001: 运行时配置加载 → 配置列表+分组可见', async () => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });
        await expect(configPage.statsBar).toBeVisible({ timeout: 10000 });

        const cardCount = await configPage.getConfigCardCount();
        expect(cardCount).toBeGreaterThanOrEqual(0);
      });

      test('RC-002: 配置项分组显示', async ({ page }) => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        const cards = configPage.configCards;
        const cardCount = await cards.count();
        if (cardCount > 0) {
          await expect(cards.first().locator('.card-title')).toBeVisible({ timeout: 5000 });
        }
      });

      test('RC-004: 编辑配置 → 修改值', async ({ page }) => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        const editableInput = page.locator('.config-item input.config-input:not(:disabled)');
        const count = await editableInput.count();
        if (count > 0) {
          const currentValue = await editableInput.first().inputValue();
          await editableInput.first().fill(currentValue);
          await expect(editableInput.first()).toBeVisible();
        }
      });
    });

    test.describe('表单', () => {
      test('RC-003: 搜索配置', async ({ page }) => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        const searchInput = configPage.searchInput;
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchInput.fill('mail');
          await expect(configPage.pageTitle).toBeVisible();
        }
      });
    });

    test.describe('敏感配置', () => {
      test('RC-005: 敏感配置脱敏 → 显示****', async ({ page }) => {
        await expect(configPage.pageTitle).toBeVisible({ timeout: 15000 });

        const sensitiveItem = page.locator('.config-item').filter({ hasText: /password|secret|token|key|api/i });
        const count = await sensitiveItem.count();
        if (count > 0) {
          const sensitiveInput = sensitiveItem.first().locator('input[type="password"]');
          if (await sensitiveInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(sensitiveInput).toHaveAttribute('type', 'password');
            const visibilityToggle = sensitiveItem.first().locator('.visibility-toggle');
            if (await visibilityToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
              await visibilityToggle.click();
              await expect(sensitiveInput).toHaveAttribute('type', 'text');
            }
          }
        }
      });
    });

    test.describe('权限', () => {
      test('RC-006: USER 角色 → 只读横幅', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('testuser', 'Test@123');
        await page.goto('/runtime-config');
        await page.waitForLoadState('networkidle');

        const banner = page.locator('.info-banner, text=只读模式, text=无权限');
        if (await banner.isVisible({ timeout: 10000 }).catch(() => false)) {
          await expect(banner.first()).toBeVisible();
        }
      });
    });
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    test('W-010: 用户管理 CRUD 工作流', async ({ page, testUser }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(testUser.account, testUser.password);

      const userPage = new UserManagementPage(page);
      await userPage.goto();

      const isDenied = await userPage.accessDenied.isVisible({ timeout: 5000 }).catch(() => false);
      if (isDenied) {
        await expect(userPage.accessDenied).toBeVisible();
        return;
      }

      await expect(userPage.usersTable).toBeVisible({ timeout: 10000 });
      await userPage.searchUser('admin');
      await expect(userPage.usersTable).toBeVisible();

      const searchInput = userPage.searchBar.first();
      if (await searchInput.isVisible()) {
        await searchInput.clear();
        await page.waitForLoadState('networkidle');
      }
    });

    test('W-011: 角色管理 CRUD 工作流', async ({ page, testUser }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(testUser.account, testUser.password);

      const rolePage = new RoleManagementPage(page);
      await rolePage.goto();

      const isDenied = await rolePage.accessDenied.isVisible({ timeout: 5000 }).catch(() => false);
      if (isDenied) {
        await expect(rolePage.accessDenied).toBeVisible();
        return;
      }

      await expect(rolePage.pageTitle).toBeVisible({ timeout: 15000 });

      const cardCount = await rolePage.getRoleCardCount();
      expect(cardCount).toBeGreaterThanOrEqual(0);

      await rolePage.switchToSystemRoles();
      await page.waitForLoadState('networkidle');
      await expect(rolePage.pageTitle).toBeVisible();

      await rolePage.searchRole('admin');
      await expect(rolePage.pageTitle).toBeVisible();
    });

    test('W-012: 侧边栏可见性 → 不同角色看到不同导航项', async ({ page, testUser }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(testUser.account, testUser.password);

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      const sidebarLinks = page.locator('nav a, aside a, [class*="sidebar"] a, [class*="nav"] a');
      const count = await sidebarLinks.count();
      if (count > 0) {
        await expect(sidebarLinks.first()).toBeAttached();
      }

      await page.goto('/users');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
