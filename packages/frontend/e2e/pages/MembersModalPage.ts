import type { Page, Locator } from '@playwright/test';

interface MemberInfo {
  name: string;
  email: string;
  role: string;
}

interface RoleInfo {
  name: string;
  type: 'system' | 'custom';
  userCount: number;
}

/**
 * 项目成员弹窗 & 项目角色弹窗 Page Object
 *
 * MembersModal —— 管理项目成员：添加、移除、角色变更、所有权转让
 * ProjectRolesModal —— 管理项目角色：创建、编辑、删除、权限配置
 *
 * 两者都通过项目页面内的按钮触发，以 Modal 形式展示。
 */
export class MembersModalPage {
  readonly page: Page;

  // =========================================================================
  // MembersModal 选择器
  // =========================================================================

  /** 成员 Modal 容器 */
  readonly membersModal: Locator;
  readonly membersModalTitle: Locator;
  /** "添加成员" 虚线按钮 */
  readonly addMemberButton: Locator;
  /** 添加成员表单容器 */
  readonly addMemberForm: Locator;
  /** 搜索用户输入框 */
  readonly memberSearchInput: Locator;
  /** 搜索结果下拉 */
  readonly searchResultsDropdown: Locator;
  /** 已选用户卡片 */
  readonly selectedUserCard: Locator;
  /** 角色选择 <select> */
  readonly memberRoleSelect: Locator;
  /** 确认添加按钮 */
  readonly confirmAddBtn: Locator;
  /** 添加表单中的取消/关闭按钮 */
  readonly cancelAddBtn: Locator;
  /** 成员列表容器 */
  readonly memberList: Locator;
  /** 单个成员行 */
  readonly memberItems: Locator;
  /** 角色筛选下拉 */
  readonly filterRoleSelect: Locator;
  /** 成员计数文本 */
  readonly memberCountText: Locator;
  /** 加载中指示器 */
  readonly membersLoading: Locator;
  /** 空状态文本 */
  readonly membersEmptyState: Locator;
  /** 错误消息 */
  readonly membersError: Locator;
  /** Modal 关闭按钮 */
  readonly closeMembersBtn: Locator;

  // 转让所有权
  /** 转让弹窗 */
  readonly transferModal: Locator;
  readonly transferTargetName: Locator;
  readonly transferConfirmBtn: Locator;
  readonly transferCancelBtn: Locator;

  // =========================================================================
  // ProjectRolesModal 选择器
  // =========================================================================

  /** 角色 Modal 容器 */
  readonly rolesModal: Locator;
  readonly rolesModalTitle: Locator;
  readonly customRolesTab: Locator;
  readonly systemRolesTab: Locator;
  readonly createRoleBtn: Locator;
  /** 角色卡片列表（自定义或系统） */
  readonly roleCards: Locator;
  readonly rolesLoading: Locator;
  readonly rolesEmptyState: Locator;
  readonly rolesError: Locator;
  readonly closeRolesBtn: Locator;

  // 权限配置弹窗（由 ProjectRolesModal 打开的 PermissionConfigModal）
  readonly permissionConfigModal: Locator;
  readonly roleNameInput: Locator;
  readonly roleDescInput: Locator;
  readonly saveRoleBtn: Locator;
  readonly cancelConfigBtn: Locator;

  // 删除确认弹窗
  readonly deleteConfirmModal: Locator;
  readonly deleteRoleConfirmBtn: Locator;
  readonly deleteRoleCancelBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    // --- MembersModal ---
    this.membersModal = page.locator('[role="dialog"]').filter({ hasText: '项目成员' });
    this.membersModalTitle = this.membersModal.locator('h2, [role="heading"]').filter({ hasText: '项目成员' });
    this.addMemberButton = this.membersModal.getByRole('button', { name: /添加成员/ });
    this.addMemberForm = this.membersModal.locator('form');
    this.memberSearchInput = this.membersModal.locator('[data-tour="member-search-input"]');
    this.searchResultsDropdown = this.membersModal.locator('.absolute.z-10.w-full.rounded-lg.shadow-lg');
    this.selectedUserCard = this.membersModal.locator('.flex.items-center.gap-2.p-2.rounded-lg');
    this.memberRoleSelect = this.membersModal.locator('[data-tour="member-role-select"]');
    this.confirmAddBtn = this.membersModal.locator('[data-tour="member-add-btn"]');
    this.cancelAddBtn = this.addMemberForm.locator('button').filter({ hasText: '' }).locator('svg.lucide-x').locator('..');
    this.memberList = this.membersModal.locator('.space-y-2').last();
    this.memberItems = this.membersModal.locator('.flex.items-center.gap-3.p-3.rounded-lg');
    this.filterRoleSelect = this.membersModal.locator('select').filter({ hasText: /所有角色/ });
    this.memberCountText = this.membersModal.locator('text=/共 \\d+ 人/');
    this.membersLoading = this.membersModal.getByText(/加载中|检查权限/);
    this.membersEmptyState = this.membersModal.getByText(/暂无成员|没有符合条件的成员/);
    this.membersError = this.membersModal.locator('[style*="var(--error-light)"]');
    this.closeMembersBtn = this.membersModal.getByRole('button', { name: /关闭/ });

    // 转让弹窗
    this.transferModal = page.locator('[role="dialog"]').filter({ hasText: '转让项目所有权' });
    this.transferTargetName = this.transferModal.locator('.text-sm.font-medium').last();
    this.transferConfirmBtn = this.transferModal.getByRole('button', { name: /确认转让/ });
    this.transferCancelBtn = this.transferModal.getByRole('button', { name: '取消' });

    // --- ProjectRolesModal ---
    this.rolesModal = page.locator('[role="dialog"]').filter({ hasText: '项目角色管理' });
    this.rolesModalTitle = this.rolesModal.locator('h2, [role="heading"]').filter({ hasText: '项目角色管理' });
    this.customRolesTab = this.rolesModal.getByRole('button', { name: /自定义角色/ });
    this.systemRolesTab = this.rolesModal.getByRole('button', { name: /系统角色/ });
    this.createRoleBtn = this.rolesModal.getByRole('button', { name: /新建角色/ });
    this.roleCards = this.rolesModal.locator('.grid > div');
    this.rolesLoading = this.rolesModal.getByText(/加载中/);
    this.rolesEmptyState = this.rolesModal.getByText(/暂无.*角色/);
    this.rolesError = this.rolesModal.locator('.bg-red-50');
    this.closeRolesBtn = this.rolesModal.getByRole('button', { name: /关闭/ });

    // 权限配置弹窗
    this.permissionConfigModal = page.locator('[role="dialog"]').filter({ hasText: /配置.*权限|新建.*角色/ });
    this.roleNameInput = this.permissionConfigModal.locator('input').first();
    this.roleDescInput = this.permissionConfigModal.locator('textarea').first();
    this.saveRoleBtn = this.permissionConfigModal.getByRole('button', { name: /保存|确认/ }).last();
    this.cancelConfigBtn = this.permissionConfigModal.getByRole('button', { name: /取消/ });

    // 删除确认弹窗
    this.deleteConfirmModal = page.locator('[role="dialog"]').filter({ hasText: '确认删除' });
    this.deleteRoleConfirmBtn = this.deleteConfirmModal.getByRole('button', { name: /确认删除/ }).last();
    this.deleteRoleCancelBtn = this.deleteConfirmModal.getByRole('button', { name: '取消' });
  }

  // =========================================================================
  // MembersModal 方法
  // =========================================================================

  /** 通过 URL 导航到项目页面 */
  async goto(projectId: string) {
    await this.page.goto(`/projects/${projectId}/files`);
    await this.page.waitForLoadState('networkidle');
  }

  /** 点击项目设置/成员入口打开成员弹窗 */
  async openMembersModal() {
    // 通过项目设置入口打开成员弹窗
    const settingsBtn = this.page.getByRole('button', { name: /项目设置/ });
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
    }
    // 寻找成员管理入口
    const membersEntry = this.page.getByText(/成员管理|项目成员/);
    if (await membersEntry.isVisible()) {
      await membersEntry.click();
    }
    await this.waitForModalLoaded();
  }

  /** 等待成员弹窗完全加载 */
  async waitForModalLoaded() {
    await expect(this.membersModal).toBeVisible({ timeout: 10000 });
    // 等待加载指示器消失
    await this.membersLoading.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  /** 获取成员列表 */
  async getMemberList(): Promise<MemberInfo[]> {
    await this.waitForModalLoaded();
    const items = this.memberItems;
    const count = await items.count();
    const result: MemberInfo[] = [];
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const name = (await item.locator('.text-sm.font-medium').first().textContent())?.trim() || '';
      const email = (await item.locator('.text-xs').first().textContent())?.trim() || '';
      const roleEl = item.locator('select, .px-2.py-1.text-xs.rounded');
      const role = (await roleEl.textContent())?.trim() || '';
      result.push({ name, email, role });
    }
    return result;
  }

  /** 获取成员总数 */
  async getMemberCount(): Promise<number> {
    await this.waitForModalLoaded();
    const text = await this.memberCountText.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /** 搜索用户并选择 */
  async searchMember(query: string) {
    await this.addMemberButton.click();
    await expect(this.memberSearchInput).toBeVisible();
    await this.memberSearchInput.fill(query);
    // 等待防抖搜索（300ms）后结果出现
    await this.page.waitForTimeout(500);
  }

  /** 添加成员（搜索 → 选择结果 → 选角色 → 确认） */
  async addMember(search: string, role: string) {
    await this.addMemberButton.click();
    await expect(this.memberSearchInput).toBeVisible();
    await this.memberSearchInput.fill(search);
    await this.page.waitForTimeout(500);

    // 点击第一个搜索结果
    const firstResult = this.searchResultsDropdown.locator('button').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
    }

    // 选择角色
    await this.memberRoleSelect.selectOption({ label: role });
    await this.confirmAddBtn.click();
  }

  /** 确认添加 */
  async confirmAddMember() {
    await this.confirmAddBtn.click();
  }

  /** 移除指定成员（按名称查找成员行中的 X 按钮） */
  async removeMember(name: string) {
    const memberRow = this.memberItems.filter({ hasText: name }).first();
    // 点击该行的移除按钮（title="移除成员"）
    const removeBtn = memberRow.locator('button[title="移除成员"]');
    await removeBtn.click();
  }

  /** 确认移除 */
  async confirmRemoveMember() {
    // 移除成员直接调用 API，没有二次确认弹窗；这里主要等待列表更新
    await this.page.waitForLoadState('networkidle');
  }

  /** 修改成员角色 */
  async changeMemberRole(name: string, newRole: string) {
    const memberRow = this.memberItems.filter({ hasText: name }).first();
    const roleSelect = memberRow.locator('select');
    await roleSelect.selectOption({ label: newRole });
    await this.page.waitForLoadState('networkidle');
  }

  /** 触发转让所有权流程 */
  async transferOwnership(name: string, _password: string) {
    const memberRow = this.memberItems.filter({ hasText: name }).first();
    const transferBtn = memberRow.locator('button[title="转让项目所有权"]');
    await transferBtn.click();
    await expect(this.transferModal).toBeVisible();
  }

  /** 确认转让 */
  async confirmTransfer() {
    await this.transferConfirmBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 关闭成员弹窗 */
  async closeModal() {
    await this.closeMembersBtn.click();
    await expect(this.membersModal).toBeHidden({ timeout: 5000 });
  }

  /** 按 Escape 关闭弹窗 */
  async pressEscapeOnModal() {
    await this.page.keyboard.press('Escape');
    await expect(this.membersModal).toBeHidden({ timeout: 5000 });
  }

  /** 获取空状态文本 */
  async getEmptyState(): Promise<string> {
    if (await this.membersEmptyState.isVisible()) {
      return (await this.membersEmptyState.textContent())?.trim() || '';
    }
    return '';
  }

  /** 获取错误消息 */
  async getErrorMessage(): Promise<string> {
    if (await this.membersError.isVisible()) {
      return (await this.membersError.textContent())?.trim() || '';
    }
    return '';
  }

  // =========================================================================
  // ProjectRolesModal 方法
  // =========================================================================

  /** 在项目设置页面打开角色管理弹窗 */
  async openRolesModal() {
    const settingsBtn = this.page.getByRole('button', { name: /项目设置/ });
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
    }
    const rolesEntry = this.page.getByText(/角色管理/);
    if (await rolesEntry.isVisible()) {
      await rolesEntry.click();
    }
    await this.waitForRolesModalLoaded();
  }

  /** 等待角色弹窗加载完成 */
  async waitForRolesModalLoaded() {
    await expect(this.rolesModal).toBeVisible({ timeout: 10000 });
    await this.rolesLoading.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  /** 获取角色列表 */
  async getRoleList(): Promise<RoleInfo[]> {
    await this.waitForRolesModalLoaded();
    const cards = this.roleCards;
    const count = await cards.count();
    const result: RoleInfo[] = [];

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const name = (await card.locator('.text-sm.font-semibold').first().textContent())?.trim() || '';
      const isSystem = (await card.locator('text=/^系统$/').count()) > 0;
      result.push({
        name,
        type: isSystem ? 'system' : 'custom',
        userCount: 0, // 弹窗中不直接显示用户数
      });
    }
    return result;
  }

  /** 创建新角色（打开权限配置弹窗） */
  async createRole(name: string, _type: 'system' | 'custom', permissions: string[]) {
    await this.customRolesTab.click();
    await this.createRoleBtn.click();
    await expect(this.permissionConfigModal).toBeVisible({ timeout: 5000 });

    // 填写名称
    await this.roleNameInput.fill(name);

    // 勾选权限（权限项通过 label/checkbox 定位）
    for (const perm of permissions) {
      const permCheckbox = this.permissionConfigModal.locator(`label`).filter({ hasText: new RegExp(perm) }).locator('input[type="checkbox"]');
      if (await permCheckbox.isVisible()) {
        if (!(await permCheckbox.isChecked())) {
          await permCheckbox.check();
        }
      }
    }

    await this.saveRoleBtn.click();
    await expect(this.permissionConfigModal).toBeHidden({ timeout: 5000 });
  }

  /** 编辑角色（打开权限配置弹窗） */
  async editRole(name: string, newName?: string, permissions?: string[]) {
    await this.waitForRolesModalLoaded();

    // 找到对应角色卡片中的编辑按钮
    const roleCard = this.roleCards.filter({ hasText: name }).first();
    const editBtn = roleCard.locator('button').first();
    await editBtn.click();

    await expect(this.permissionConfigModal).toBeVisible({ timeout: 5000 });

    if (newName) {
      await this.roleNameInput.fill(newName);
    }

    if (permissions) {
      for (const perm of permissions) {
        const permCheckbox = this.permissionConfigModal.locator(`label`).filter({ hasText: new RegExp(perm) }).locator('input[type="checkbox"]');
        if (await permCheckbox.isVisible()) {
          if (!(await permCheckbox.isChecked())) {
            await permCheckbox.check();
          }
        }
      }
    }

    await this.saveRoleBtn.click();
    await expect(this.permissionConfigModal).toBeHidden({ timeout: 5000 });
  }

  /** 删除角色 */
  async deleteRole(name: string) {
    await this.waitForRolesModalLoaded();
    const roleCard = this.roleCards.filter({ hasText: name }).first();
    // 垃圾桶图标按钮
    const deleteBtn = roleCard.locator('button').last();
    await deleteBtn.click();
    await expect(this.deleteConfirmModal).toBeVisible({ timeout: 5000 });
  }

  /** 确认删除角色 */
  async confirmDeleteRole() {
    await this.deleteRoleConfirmBtn.click();
    await expect(this.deleteConfirmModal).toBeHidden({ timeout: 5000 });
  }

  /** 在权限配置弹窗中切换单个权限 */
  async togglePermission(name: string) {
    await expect(this.permissionConfigModal).toBeVisible({ timeout: 5000 });
    const permCheckbox = this.permissionConfigModal.locator(`label`).filter({ hasText: new RegExp(name) }).locator('input[type="checkbox"]');
    if (await permCheckbox.isVisible()) {
      await permCheckbox.click();
    }
  }

  /** 在权限配置弹窗中切换权限组（展开/折叠 + 全选） */
  async togglePermissionGroup(name: string) {
    await expect(this.permissionConfigModal).toBeVisible({ timeout: 5000 });
    // 找权限组标题并点击展开/折叠，或全选其中的 checkbox
    const groupHeader = this.permissionConfigModal.locator(`text=${name}`).first();
    if (await groupHeader.isVisible()) {
      await groupHeader.click();
    }
  }

  /** 关闭角色管理弹窗 */
  async closeRolesModal() {
    await this.closeRolesBtn.click();
    await expect(this.rolesModal).toBeHidden({ timeout: 5000 });
  }
}
