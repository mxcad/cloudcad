import type { Page, Locator } from '@playwright/test';

/**
 * 角色管理页面对象
 * 路由: /roles
 * 对应: src/pages/RoleManagement/
 */
export class RoleManagementPage {
  readonly page: Page;

  // --- 页面标题 ---
  readonly pageTitle: Locator;
  readonly accessDenied: Locator;

  // --- 角色表格 / 卡片 ---
  readonly roleTable: Locator;
  readonly roleRows: Locator;
  readonly tableHeaders: Locator;

  // --- 按钮 ---
  readonly createRoleButton: Locator;

  // --- 弹窗 ---
  readonly permissionModal: Locator;
  readonly deleteConfirmModal: Locator;

  // --- 消息 ---
  readonly successToast: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: /角色与权限|角色管理/ });
    this.accessDenied = page.locator('.access-denied-state, text=访问被拒绝');

    // 角色表格 / 卡片
    this.roleTable = page.locator('.role-card-list, [data-testid="role-table"], table');
    this.roleRows = page.locator('.role-card, [data-testid="role-row"], tbody tr');
    this.tableHeaders = page.locator(
      '[data-testid="role-table"] th, table th',
    );

    // 按钮
    this.createRoleButton = page.getByRole('button', { name: /创建角色|新建角色/ });

    // 弹窗
    this.permissionModal = page
      .locator('[role="dialog"]')
      .filter({ hasText: /配置.*角色|新建.*角色|创建.*角色|编辑.*角色|权限/ });
    this.deleteConfirmModal = page
      .locator('[role="dialog"]')
      .filter({ hasText: /确认删除角色|删除.*角色/ });

    // 消息
    this.successToast = page.locator('.success-toast, .toast-success');
    this.errorMessage = page.locator('.error-banner, .error-message, [role="alert"]');
  }

  /** 导航到角色管理页并等待加载完成 */
  async goto() {
    await this.page.goto('/roles');
    await this.waitForLoadComplete();
  }

  /** 等待页面核心元素加载完成 */
  async waitForLoadComplete() {
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.roleTable.waitFor({ state: 'visible', timeout: 15000 }),
      this.accessDenied.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});
  }

  // ================================================================
  //  CRUD
  // ================================================================

  /**
   * 创建角色
   * @param name 角色名称
   * @param type 角色类型：'system' = 系统角色, 'custom' = 自定义角色
   * @param permissions 权限标识数组，如 ['FILE_READ', 'FILE_WRITE']
   */
  async createRole(
    name: string,
    type: 'system' | 'custom',
    permissions: string[],
  ) {
    await this.createRoleButton.first().click();
    const modal = this.permissionModal;
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // 填充角色名称
    await modal.getByLabel(/角色名称|名称/).fill(name);

    // 选择角色类型（如果有此控件）
    const typeSelect = modal.getByLabel(/角色类型|类型/);
    if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeSelect.selectOption(type);
    }

    // 选中权限 checkbox — 权限以树形 checkbox 展示
    const permTree = modal.locator('.permission-tree, [class*="permission"]');
    for (const perm of permissions) {
      const checkbox = permTree
        .getByRole('checkbox', { name: new RegExp(perm) })
        .or(permTree.locator(`[data-permission="${perm}"] input[type="checkbox"]`));
      await checkbox.check();
    }

    await modal.getByRole('button', { name: /确认|提交|保存/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 编辑角色
   * @param name 要编辑的角色名称（用于定位行）
   * @param data.newName 新名称
   * @param data.permissions 新的权限列表
   */
  async editRole(name: string, data: { newName?: string; permissions?: string[] }) {
    const row = this.getRoleRow(name);
    await row.getByRole('button', { name: /编辑|配置权限/ }).click();

    const modal = this.permissionModal;
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    if (data.newName !== undefined) {
      await modal.getByLabel(/角色名称|名称/).fill(data.newName);
    }

    if (data.permissions !== undefined) {
      // 权限可能需先全部取消再重新勾选，取决于 UI 实现
      const permTree = modal.locator('.permission-tree, [class*="permission"]');
      for (const perm of data.permissions) {
        const checkbox = permTree
          .getByRole('checkbox', { name: new RegExp(perm) })
          .or(permTree.locator(`[data-permission="${perm}"] input[type="checkbox"]`));
        await checkbox.check();
      }
    }

    await modal.getByRole('button', { name: /确认|提交|保存/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 删除角色 — 点击删除按钮并等待确认弹窗 */
  async deleteRole(name: string) {
    const row = this.getRoleRow(name);
    await row.getByRole('button', { name: /删除/ }).or(row.locator('button[title="删除角色"]')).click();
    await this.deleteConfirmModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /** 在删除确认弹窗中点击确认 */
  async confirmDelete() {
    await this.deleteConfirmModal
      .getByRole('button', { name: /确认删除|确认/ })
      .click();
    await this.page.waitForLoadState('networkidle');
  }

  // ================================================================
  //  查询
  // ================================================================

  /** 获取当前可见的角色卡片/行数 */
  async getRoleCount(): Promise<number> {
    return this.roleRows.count();
  }

  // ================================================================
  //  私有辅助
  // ================================================================

  /**
   * 根据角色名称定位行/卡片
   */
  private getRoleRow(name: string): Locator {
    return this.roleRows.filter({ hasText: name });
  }
}
