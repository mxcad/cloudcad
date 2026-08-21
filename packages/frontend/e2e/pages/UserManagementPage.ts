import type { Page, Locator } from '@playwright/test';

/**
 * 用户管理页面对象
 * 路由: /users
 * 对应: src/pages/UserManagement/
 */
export class UserManagementPage {
  readonly page: Page;

  // --- 页面标题 ---
  readonly pageTitle: Locator;
  readonly accessDenied: Locator;

  // --- 搜索栏 ---
  readonly searchInput: Locator;
  readonly activeTab: Locator;
  readonly deletedTab: Locator;

  // --- 用户表格 ---
  readonly userTable: Locator;
  readonly userRows: Locator;
  readonly tableHeaders: Locator;

  // --- 分页 ---
  readonly paginationControls: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly pageInfo: Locator;

  // --- 按钮 ---
  readonly createUserButton: Locator;
  readonly batchDeleteButton: Locator;
  readonly cleanupButton: Locator;

  // --- 弹窗 ---
  readonly createUserModal: Locator;
  readonly editUserModal: Locator;
  readonly deleteConfirmModal: Locator;
  readonly quotaModal: Locator;

  // --- 消息 ---
  readonly successToast: Locator;
  readonly errorMessage: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;

    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: /用户管理|用户列表/ });
    this.accessDenied = page.locator('.access-denied-state, .limited-access-card');

    // 搜索栏
    this.searchInput = page.getByPlaceholder(/搜索/);
    this.activeTab = page.getByRole('tab', { name: /活跃/ });
    this.deletedTab = page.getByRole('tab', { name: /已注销/ });

    // 用户表格
    this.userTable = page.locator('.users-table-card, [data-testid="user-table"]');
    this.userRows = page.locator('[data-testid="user-row"], .users-table-card tbody tr');
    this.tableHeaders = page.locator('.users-table-card th, [data-testid="user-table"] th');

    // 分页
    this.paginationControls = page.locator('.pagination, [data-testid="pagination"]');
    this.prevPageButton = page.getByRole('button', { name: /上一页|‹/ });
    this.nextPageButton = page.getByRole('button', { name: /下一页|›/ });
    this.pageInfo = page.locator('[data-testid="page-info"], .pagination .page-info');

    // 按钮
    this.createUserButton = page.getByRole('button', { name: /创建用户|添加用户|新建用户/ });
    this.batchDeleteButton = page.getByRole('button', { name: /批量删除|删除选中/ });
    this.cleanupButton = page.getByRole('button', { name: /清理已注销/ });

    // 弹窗 — 通过 dialog role + 文本内容定位
    this.createUserModal = page.locator('[role="dialog"]').filter({ hasText: /创建用户|新建用户/ });
    this.editUserModal = page.locator('[role="dialog"]').filter({ hasText: /编辑用户|修改用户|用户信息/ });
    this.deleteConfirmModal = page.locator('[role="dialog"]').filter({ hasText: /确认删除|删除用户/ });
    this.quotaModal = page.locator('[role="dialog"]').filter({ hasText: /配额|存储配额/ });

    // 消息
    this.successToast = page.locator('.success-toast, .toast-success');
    this.errorMessage = page.locator('.error-banner, .error-message, [role="alert"]');
    this.emptyState = page.locator('.empty-state, text=暂无数据, text=暂无用户');
  }

  /** 导航到用户管理页并等待加载完成 */
  async goto() {
    await this.page.goto('/users');
    await this.waitForLoadComplete();
  }

  /** 等待页面核心元素加载完成 */
  async waitForLoadComplete() {
    // 如果有权限，等待表格或Tab出现；如果无权限，denied 也会可见
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.userTable.waitFor({ state: 'visible', timeout: 15000 }),
      this.accessDenied.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {
      // 某些情况下两者都不立即可见（加载中），再等待一次
    });
  }

  // ================================================================
  //  搜索 & Tab 切换
  // ================================================================

  /** 搜索用户 */
  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  /** 清空搜索 */
  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForLoadState('networkidle');
  }

  /** 切换到指定Tab */
  async switchToTab(tab: 'active' | 'deleted') {
    if (tab === 'active') {
      await this.activeTab.click();
    } else {
      await this.deletedTab.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  // ================================================================
  //  表格操作
  // ================================================================

  /** 对指定列排序 */
  async sortByColumn(column: 'username' | 'email' | 'role' | 'status' | 'created') {
    const labelMap: Record<string, string> = {
      username: /用户名|账号/,
      email: /邮箱/,
      role: /角色/,
      status: /状态/,
      created: /创建时间|注册时间/,
    };
    const header = this.tableHeaders.filter({ hasText: labelMap[column] });
    await header.click();
    await this.page.waitForLoadState('networkidle');
  }

  // ================================================================
  //  分页
  // ================================================================

  /** 获取分页信息文本 */
  async getPageInfo(): Promise<string | null> {
    if (!(await this.pageInfo.isVisible().catch(() => false))) return null;
    return this.pageInfo.textContent();
  }

  /** 点击下一页 */
  async nextPage() {
    if (
      !(await this.nextPageButton.isDisabled().catch(() => false)) &&
      (await this.nextPageButton.isVisible().catch(() => false))
    ) {
      await this.nextPageButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /** 点击上一页 */
  async prevPage() {
    if (
      !(await this.prevPageButton.isDisabled().catch(() => false)) &&
      (await this.prevPageButton.isVisible().catch(() => false))
    ) {
      await this.prevPageButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  // ================================================================
  //  CRUD
  // ================================================================

  /** 创建用户 */
  async createUser(data: {
    username: string;
    email: string;
    password: string;
    role: string;
    quota?: number;
  }) {
    await this.createUserButton.click();
    const modal = this.createUserModal;
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    await modal.getByLabel(/用户名|账号/).fill(data.username);
    await modal.getByLabel(/邮箱/).fill(data.email);
    await modal.getByLabel(/密码/).fill(data.password);
    await modal.getByLabel(/角色/).selectOption(data.role);
    if (data.quota !== undefined) {
      await modal.getByLabel(/配额/).fill(String(data.quota));
    }

    await modal.getByRole('button', { name: /确认|提交|保存/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 编辑用户 */
  async editUser(
    username: string,
    data: { email?: string; role?: string; quota?: string; status?: string },
  ) {
    const row = this.getUserRow(username);
    await row.getByRole('button', { name: /编辑/ }).click();

    const modal = this.editUserModal;
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    if (data.email !== undefined) await modal.getByLabel(/邮箱/).fill(data.email);
    if (data.role !== undefined) await modal.getByLabel(/角色/).selectOption(data.role);
    if (data.quota !== undefined) await modal.getByLabel(/配额/).fill(data.quota);
    if (data.status !== undefined) await modal.getByLabel(/状态/).selectOption(data.status);

    await modal.getByRole('button', { name: /确认|提交|保存/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 删除用户 */
  async deleteUser(username: string) {
    const row = this.getUserRow(username);
    await row.getByRole('button', { name: /删除/ }).click();
    await this.deleteConfirmModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /** 在删除确认弹窗中点击确认 */
  async confirmDelete() {
    await this.deleteConfirmModal.getByRole('button', { name: /确认|删除/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 恢复已注销用户 */
  async restoreUser(username: string) {
    const row = this.getUserRow(username);
    await row.getByRole('button', { name: /恢复/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  // ================================================================
  //  批量操作
  // ================================================================

  /** 批量选中用户 */
  async batchSelect(usernames: string[]) {
    for (const name of usernames) {
      const row = this.getUserRow(name);
      const checkbox = row.locator('input[type="checkbox"]');
      await checkbox.check();
    }
  }

  /** 批量删除（先调用 batchSelect，再调用此方法） */
  async batchDelete() {
    await this.batchDeleteButton.click();
    await this.deleteConfirmModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  // ================================================================
  //  配额
  // ================================================================

  /** 设置用户存储配额 */
  async setUserQuota(username: string, quota: number) {
    const row = this.getUserRow(username);
    await row.getByRole('button', { name: /配额/ }).click();

    const modal = this.quotaModal;
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    await modal.getByLabel(/配额/).fill(String(quota));
    await modal.getByRole('button', { name: /确认|保存/ }).click();
    await this.page.waitForLoadState('networkidle');
  }

  // ================================================================
  //  查询
  // ================================================================

  /** 获取当前可见的用户行数 */
  async getUserCount(): Promise<number> {
    return this.userRows.count();
  }

  /** 获取空状态文本（若无空状态返回 null） */
  async getEmptyState(): Promise<string | null> {
    if (!(await this.emptyState.isVisible().catch(() => false))) return null;
    return this.emptyState.textContent();
  }

  /** 获取错误消息文本 */
  async getErrorMessage(): Promise<string | null> {
    if (!(await this.errorMessage.isVisible().catch(() => false))) return null;
    return this.errorMessage.textContent();
  }

  // ================================================================
  //  私有辅助
  // ================================================================

  /**
   * 根据用户名定位行
   * 不传则返回整组 rows 的 Locator
   */
  private getUserRow(username: string): Locator {
    return this.userRows.filter({ hasText: username });
  }
}
