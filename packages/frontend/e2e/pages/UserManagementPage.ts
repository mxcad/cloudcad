import type { Page, Locator } from '@playwright/test';

/**
 * 用户管理页面对象
 * 对应 src/pages/UserManagement/index.tsx
 */
export class UserManagementPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly addUserButton: Locator;
  readonly activeTab: Locator;
  readonly deletedTab: Locator;
  readonly searchBar: Locator;
  readonly usersTable: Locator;
  readonly userRows: Locator;
  readonly createUserModal: Locator;
  readonly editUserModal: Locator;
  readonly deleteConfirmModal: Locator;
  readonly quotaModal: Locator;
  readonly cleanupButton: Locator;
  readonly successToast: Locator;
  readonly errorBanner: Locator;
  readonly accessDenied: Locator;
  readonly paginationControls: Locator;
  readonly roleFilterSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: '用户管理' });
    // 添加用户按钮
    this.addUserButton = page.getByRole('button', { name: '添加用户' });
    // 活跃用户Tab
    this.activeTab = page.getByRole('button', { name: '活跃用户' });
    // 已注销Tab
    this.deletedTab = page.getByRole('button', { name: '已注销' });
    // 搜索栏
    this.searchBar = page.getByPlaceholder(/搜索/);
    // 用户表格
    this.usersTable = page.locator('.users-table-card');
    // 用户行
    this.userRows = page.locator('.users-table-card table tbody tr');
    // 创建用户弹窗
    this.createUserModal = page.locator('[role="dialog"]').filter({ hasText: /创建|新建用户/ });
    // 编辑用户弹窗
    this.editUserModal = page.locator('[role="dialog"]').filter({ hasText: /编辑|修改/ });
    // 删除确认弹窗
    this.deleteConfirmModal = page.locator('[role="dialog"]').filter({ hasText: /删除|确认/ });
    // 配额弹窗
    this.quotaModal = page.locator('[role="dialog"]').filter({ hasText: /配额/ });
    // 清理已注销用户按钮
    this.cleanupButton = page.getByRole('button', { name: /清理已注销/ });
    // 成功提示
    this.successToast = page.locator('.success-toast');
    // 错误横幅
    this.errorBanner = page.locator('.error-banner');
    // 无权限
    this.accessDenied = page.locator('.access-denied-state, .limited-access-card');
    // 分页控件
    this.paginationControls = page.locator('.user-tabs + div + div'); // 搜索栏区域含分页
    // 角色筛选下拉
    this.roleFilterSelect = page.locator('select').first();
  }

  async goto() {
    await this.page.goto('/users');
    await this.page.waitForLoadState('networkidle');
  }

  /** 点击添加用户打开弹窗 */
  async openCreateUser() {
    await this.addUserButton.click();
  }

  /** 切换到已注销Tab */
  async switchToDeletedTab() {
    await this.deletedTab.click();
  }

  /** 切换到活跃用户Tab */
  async switchToActiveTab() {
    await this.activeTab.click();
  }

  /** 搜索用户 */
  async searchUser(query: string) {
    const input = this.searchBar.first();
    await input.fill(query);
    // 等待debounce
    await this.page.waitForLoadState('networkidle');
  }

  /** 获取表格行数 */
  async getRowCount(): Promise<number> {
    return this.userRows.count();
  }

  /** 点击编辑按钮(第一行) */
  async clickEditOnFirstRow() {
    await this.userRows.first().getByRole('button', { name: /编辑/ }).click();
  }

  /** 点击删除按钮(第一行) */
  async clickDeleteOnFirstRow() {
    await this.userRows.first().getByRole('button', { name: /删除/ }).click();
  }

  /** 点击配额按钮(第一行) */
  async clickQuotaOnFirstRow() {
    await this.userRows.first().getByRole('button', { name: /配额/ }).click();
  }

  /** 点击恢复按钮(第一行) */
  async clickRestoreOnFirstRow() {
    await this.userRows.first().getByRole('button', { name: /恢复/ }).click();
  }

  /** 确认删除 */
  async confirmDelete() {
    await this.deleteConfirmModal.getByRole('button', { name: /确认/ }).click();
  }

  /** 提交创建/编辑表单 */
  async submitForm() {
    await this.page.locator('[role="dialog"]').getByRole('button', { name: /提交|确认|保存/ }).click();
  }
}
