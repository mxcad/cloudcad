import type { Page, Locator } from '@playwright/test';

/**
 * 角色管理页面对象
 * 对应 src/pages/RoleManagement.tsx
 */
export class RoleManagementPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly projectRoleTab: Locator;
  readonly systemRoleTab: Locator;
  readonly searchInput: Locator;
  readonly createRoleButton: Locator;
  readonly roleCards: Locator;
  readonly permissionConfigModal: Locator;
  readonly deleteConfirmModal: Locator;
  readonly errorModal: Locator;
  readonly successToast: Locator;
  readonly accessDenied: Locator;

  constructor(page: Page) {
    this.page = page;
    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: '角色与权限' });
    // 项目角色 Tab
    this.projectRoleTab = page.getByRole('button', { name: '项目角色' });
    // 系统角色 Tab
    this.systemRoleTab = page.getByRole('button', { name: '系统角色' });
    // 搜索输入
    this.searchInput = page.getByPlaceholder('搜索角色...');
    // 新建角色按钮（可能有多个，取可见的）
    this.createRoleButton = page.getByRole('button', { name: '新建角色' });
    // 角色卡片列表
    this.roleCards = page.locator('.role-card');
    // 权限配置弹窗
    this.permissionConfigModal = page.locator('[role="dialog"]').filter({ hasText: /配置.*角色|新建.*角色/ });
    // 删除确认弹窗
    this.deleteConfirmModal = page.locator('[role="dialog"]').filter({ hasText: '确认删除角色' });
    // 错误提示弹窗
    this.errorModal = page.locator('[role="dialog"]').filter({ hasText: '提示' });
    // 成功提示
    this.successToast = page.locator('.success-toast');
    // 无权限
    this.accessDenied = page.locator('.access-denied-state');
  }

  async goto() {
    await this.page.goto('/roles');
    await this.page.waitForLoadState('networkidle');
  }

  /** 切换到系统角色 Tab */
  async switchToSystemRoles() {
    await this.systemRoleTab.click();
  }

  /** 切换到项目角色 Tab */
  async switchToProjectRoles() {
    await this.projectRoleTab.click();
  }

  /** 搜索角色 */
  async searchRole(query: string) {
    await this.searchInput.fill(query);
  }

  /** 获取角色卡片数量 */
  async getRoleCardCount(): Promise<number> {
    return this.roleCards.count();
  }

  /** 点击新建角色按钮（取第一个可见的） */
  async openCreateRole() {
    await this.createRoleButton.first().click();
  }

  /**
   * 点击指定角色卡片的"配置权限"按钮
   * @param index 卡片索引
   */
  async clickConfigurePermission(index: number) {
    await this.roleCards.nth(index).getByRole('button', { name: '配置权限' }).click();
  }

  /**
   * 删除指定角色卡片
   * @param index 卡片索引
   */
  async clickDeleteRole(index: number) {
    await this.roleCards.nth(index).locator('button[title="删除角色"]').click();
  }

  /** 确认删除 */
  async confirmDelete() {
    await this.deleteConfirmModal.getByRole('button', { name: /确认删除/ }).click();
  }

  /** 取消删除 */
  async cancelDelete() {
    await this.deleteConfirmModal.getByRole('button', { name: '取消' }).click();
  }

  /** 确认错误提示弹窗 */
  async dismissErrorModal() {
    await this.errorModal.getByRole('button', { name: '确定' }).click();
  }
}
