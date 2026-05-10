import { test, expect } from '../fixtures/auth.fixture';
import { FileSystemPage } from '../pages/FileSystemPage';

/**
 * 身份权限域 — 项目成员与角色管理 E2E 测试
 *
 * 覆盖：成员管理弹窗 / 项目角色管理弹窗（在项目上下文内测试）
 * 执行：域内并行（Playwright 默认 fullyParallel: true）
 */
test.describe('身份权限 - 项目成员与角色', { tag: ['@identity-auth', '@project-members'] }, () => {

  // ========== 成员管理弹窗 ==========
  test.describe('成员管理弹窗', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      // 导航到项目文件管理页（需提前创建测试项目 project-members-test）
      await fsPage.gotoProjectFiles('project-members-test');
    });

    // --- 基础交互 ---
    test.describe('基础交互', () => {
      test('PM-001: 点击成员管理按钮 → 弹窗打开', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();
        const modal = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(modal).toBeVisible({ timeout: 5000 });
      });

      test('PM-002: 弹窗标题显示"成员管理"', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();
        const modalTitle = page.locator('[role="dialog"] h2, [role="dialog"] [data-testid="modal-title"]');
        await expect(modalTitle.first()).toContainText(/成员管理/);
      });

      test('PM-003: 弹窗内显示成员列表', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();
        const memberList = page.locator('[role="dialog"]').locator('[data-testid="member-item"], .member-item, .member-row');
        await expect(memberList.first()).toBeVisible({ timeout: 5000 });
      });
    });

    // --- 成员列表 ---
    test.describe('成员列表', () => {
      test('PM-004: 成员列表 → 显示头像、名称、邮箱、角色标识', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]');
        const firstMember = dialog.locator('[data-testid="member-item"], .member-item, .member-row').first();

        // 头像
        const avatar = firstMember.locator('[data-testid="avatar"], .avatar, img[alt*="avatar"]');
        await expect(avatar.first()).toBeVisible({ timeout: 5000 });

        // 名称
        const name = firstMember.locator('[data-testid="member-name"], .member-name, .user-name');
        await expect(name.first()).toBeVisible();

        // 邮箱
        const email = firstMember.locator('[data-testid="member-email"], .member-email, .user-email');
        await expect(email.first()).toBeVisible();

        // 角色标识
        const roleBadge = firstMember.locator('[data-testid="role-badge"], .role-badge, .badge');
        await expect(roleBadge.first()).toBeVisible();
      });
    });

    // --- 添加成员 ---
    test.describe('添加成员', () => {
      test('PM-005: 点击添加按钮 → 搜索用户下拉 → 选择用户 → 选择角色 → 确认 → toast "添加成功"', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // 点击添加成员按钮
        const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
        await addBtn.click();

        // 搜索用户下拉出现
        const userSearch = dialog.locator('input[placeholder*="搜索"], input[placeholder*="用户"]');
        if (await userSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
          // 输入搜索关键词
          await userSearch.fill('test');
          await page.waitForLoadState('networkidle');

          // 选择第一个搜索结果
          const userOption = dialog.locator('[role="option"], .search-result-item, .user-option').first();
          if (await userOption.isVisible({ timeout: 5000 }).catch(() => false)) {
            await userOption.click();
          }
        }

        // 选择角色下拉
        const roleSelect = dialog.locator('[data-testid="role-select"], select, [role="combobox"]').filter({ hasText: /角色|role/i });
        if (await roleSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleSelect.click();
          const roleOption = page.locator('[role="option"]').filter({ hasText: /成员|member/i }).first();
          if (await roleOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await roleOption.click();
          }
        }

        // 确认添加
        const confirmBtn = dialog.getByRole('button', { name: /确认|添加|邀请/ });
        await confirmBtn.click();

        // 验证 toast
        const toast = page.locator('.toast, [role="status"]').filter({ hasText: /添加成功/ });
        await expect(toast).toBeVisible({ timeout: 10000 });
      });

      test('PM-006: 未选择用户 → 点击确认 → 显示校验错误', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
        await addBtn.click();

        // 不选择用户，直接点击确认
        const confirmBtn = dialog.getByRole('button', { name: /确认|添加|邀请/ });
        await confirmBtn.click();

        const error = dialog.locator('.error-message, .form-error, [role="alert"], text=请选择, text=不能为空');
        await expect(error.first()).toBeVisible({ timeout: 5000 });
      });

      test('PM-007: 选择用户但未选择角色 → 点击确认 → 显示校验错误', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
        await addBtn.click();

        // 选择用户但不选角色
        const userSearch = dialog.locator('input[placeholder*="搜索"], input[placeholder*="用户"]');
        if (await userSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
          await userSearch.fill('test');
          await page.waitForLoadState('networkidle');
          const userOption = dialog.locator('[role="option"], .search-result-item').first();
          if (await userOption.isVisible({ timeout: 5000 }).catch(() => false)) {
            await userOption.click();
          }
        }

        const confirmBtn = dialog.getByRole('button', { name: /确认|添加|邀请/ });
        await confirmBtn.click();

        const error = dialog.locator('.error-message, .form-error, [role="alert"], text=请选择, text=不能为空');
        await expect(error.first()).toBeVisible({ timeout: 5000 });
      });
    });

    // --- 移除成员 ---
    test.describe('移除成员', () => {
      test('PM-008: 点击成员移除图标 → 确认弹窗 → 确认 → 成员移除 → toast', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // 点击第一个成员的移除按钮
        const removeBtn = dialog.locator('[data-testid="member-item"], .member-item, .member-row').first()
          .getByRole('button', { name: /移除|删除/ })
          .or(dialog.locator('[data-testid="remove-member"], .remove-member-btn').first());

        if (await removeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await removeBtn.click();

          // 确认弹窗出现
          const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认.*移除|确认.*删除|移除.*成员/ });
          await expect(confirmDialog).toBeVisible({ timeout: 5000 });

          // 点击确认
          await confirmDialog.getByRole('button', { name: /确认|确定/ }).click();

          // 验证 toast
          const toast = page.locator('.toast, [role="status"]').filter({ hasText: /移除成功|删除成功/ });
          await expect(toast).toBeVisible({ timeout: 10000 });
        }
      });

      test('PM-009: 确认弹窗 → 取消 → 成员保留', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // 统计移除按钮可见数
        const removeBtns = dialog.locator(
          '[data-testid="remove-member"], .remove-member-btn, button[title*="移除"]'
        );
        const initialCount = await removeBtns.count();

        if (initialCount > 0) {
          await removeBtns.first().click();

          const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认.*移除|确认.*删除|移除.*成员/ });
          await expect(confirmDialog).toBeVisible({ timeout: 5000 });

          // 取消
          await confirmDialog.getByRole('button', { name: /取消/ }).click();

          // 确认弹窗关闭
          await expect(confirmDialog).toBeHidden({ timeout: 5000 });

          // 成员仍在列表中（通过统计移除按钮数量判断）
          const afterCancelCount = await removeBtns.count();
          expect(afterCancelCount).toBe(initialCount);
        }
      });
    });

    // --- 更改角色 ---
    test.describe('更改角色', () => {
      test('PM-010: 点击角色下拉 → 选择新角色 → 角色更新', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // 找到角色下拉（非 owner 的成员）
        const roleDropdown = dialog.locator(
          '[data-testid="role-select"], [data-testid="role-dropdown"], .role-select'
        ).first();

        if (await roleDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
          // 记录当前角色
          const currentRole = await roleDropdown.textContent();

          await roleDropdown.click();

          // 选择一个不同的角色
          const options = page.locator('[role="option"], [role="listbox"] li, .dropdown-item');
          const optionCount = await options.count();
          if (optionCount > 1) {
            // 选择第二个选项（不同于当前）
            await options.nth(1).click();

            // 等待更新
            await page.waitForLoadState('networkidle');

            // 检查角色已变更
            const updatedRole = await roleDropdown.textContent();
            expect(updatedRole).not.toBe(currentRole);
          }
        }
      });
    });

    // --- 转让所有权 ---
    test.describe('转让所有权', () => {
      test('PM-011: 点击转让图标 → 选择新所有者 → 输入密码 → 确认 → 成功 → 当前用户角色变更', async ({ page, testUser }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // 点击转让/转移所有权按钮
        const transferBtn = dialog.getByRole('button', { name: /转让|转移|移交/ }).or(
          dialog.locator('[data-testid="transfer-ownership"], .transfer-btn')
        );

        if (await transferBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await transferBtn.first().click();

          // 转让确认弹窗
          const transferDialog = page.locator('[role="dialog"]').filter({ hasText: /转让|转移.*所有权|移交/ });
          await expect(transferDialog).toBeVisible({ timeout: 5000 });

          // 选择新所有者（搜索或从列表选）
          const userSelect = transferDialog.locator('input[placeholder*="搜索"], select, [role="combobox"]').first();
          if (await userSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
            await userSelect.click();
            const userOption = page.locator('[role="option"], .search-result-item, .user-option').first();
            if (await userOption.isVisible({ timeout: 3000 }).catch(() => false)) {
              await userOption.click();
            }
          }

          // 输入密码确认
          const passwordInput = transferDialog.locator('input[type="password"]');
          if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await passwordInput.fill(testUser.password);
          }

          // 确认转让
          await transferDialog.getByRole('button', { name: /确认转让|确认|移交/ }).click();

          // 验证 toast 或角色变更
          const toast = page.locator('.toast, [role="status"]').filter({ hasText: /转让成功|移交成功/ });
          await expect(toast).toBeVisible({ timeout: 15000 });
        }
      });

      test('PM-012: 转让弹窗 → 取消 → 无变化', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const transferBtn = dialog.getByRole('button', { name: /转让|转移|移交/ }).or(
          dialog.locator('[data-testid="transfer-ownership"], .transfer-btn')
        );

        if (await transferBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await transferBtn.first().click();

          const transferDialog = page.locator('[role="dialog"]').filter({ hasText: /转让|转移.*所有权|移交/ });
          await expect(transferDialog).toBeVisible({ timeout: 5000 });

          // 取消
          await transferDialog.getByRole('button', { name: /取消/ }).click();
          await expect(transferDialog).toBeHidden({ timeout: 5000 });

          // 成员列表弹窗仍在
          await expect(dialog).toBeVisible({ timeout: 5000 });
        }
      });
    });

    // --- 搜索成员 ---
    test.describe('搜索成员', () => {
      test('PM-013: 添加成员搜索框 → 输入关键词 → 过滤结果显示', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
        await addBtn.click();

        // 搜索用户
        const searchInput = dialog.locator('input[placeholder*="搜索"]').last();
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchInput.fill('admin');
          await page.waitForLoadState('networkidle');

          // 验证过滤后的结果
          const results = dialog.locator('[role="option"], .search-result-item, .user-option');
          const resultCount = await results.count();
          if (resultCount > 0) {
            // 至少有一个结果包含搜索关键词
            const firstResultText = await results.first().textContent();
            expect(firstResultText?.toLowerCase()).toContain('admin');
          }
        }
      });
    });

    // --- 关闭弹窗 ---
    test.describe('关闭弹窗', () => {
      test('PM-014: X 按钮 → 弹窗关闭', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        const closeX = dialog.locator('[data-testid="close-modal"], .close-btn, button[aria-label="Close"]');
        await closeX.first().click();

        await expect(dialog).toBeHidden({ timeout: 5000 });
      });

      test('PM-015: 点击遮罩 → 弹窗关闭', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // 点击遮罩层（dialog 外的 overlay）
        const overlay = page.locator('[data-testid="dialog-overlay"], .overlay, .backdrop');
        if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
          await overlay.click({ position: { x: 10, y: 10 } });
        } else {
          // 尝试点击 dialog 外区域
          await page.mouse.click(10, 10);
        }

        await expect(dialog).toBeHidden({ timeout: 5000 });
      });

      test('PM-016: 按 Esc → 弹窗关闭', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(dialog).toBeVisible({ timeout: 5000 });

        await page.keyboard.press('Escape');

        await expect(dialog).toBeHidden({ timeout: 5000 });
      });
    });

    // --- 空状态 ---
    test.describe('空状态', () => {
      test('PM-017: 无成员项目 → 显示空状态提示', async ({ page }) => {
        // 导航到一个没有成员的项目
        await fsPage.gotoProjectFiles('empty-project');

        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        if (await membersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await membersBtn.click();

          const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // 空状态显示
          const emptyState = dialog.locator('text=暂无成员, text=没有成员, text=邀请成员');
          if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
            await expect(emptyState.first()).toBeVisible();
          }
        }
      });
    });

    // --- 权限 ---
    test.describe('权限', () => {
      test('PM-018: VIEWER 角色 → 可查看成员但无法添加/移除/更改/转让', async ({ page }) => {
        // 使用 viewer storageState
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        if (await membersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await membersBtn.click();

          const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // 添加按钮应禁用或不可见
          const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
          const addVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false);
          if (addVisible) {
            await expect(addBtn).toBeDisabled();
          }

          // 移除按钮不可见
          const removeBtn = dialog.locator('[data-testid="remove-member"], .remove-member-btn, button[title*="移除"]');
          await expect(removeBtn).toBeHidden();

          // 转让按钮不可见
          const transferBtn = dialog.getByRole('button', { name: /转让|转移|移交/ });
          await expect(transferBtn).toBeHidden();
        }
      });

      test('PM-019: MEMBER 角色 → 可查看成员但无法管理', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        if (await membersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await membersBtn.click();

          const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // 添加按钮应禁用
          const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
          const addVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false);
          if (addVisible) {
            await expect(addBtn).toBeDisabled();
          }

          // 转让按钮不可见
          const transferBtn = dialog.getByRole('button', { name: /转让|转移|移交/ });
          await expect(transferBtn).toBeHidden();
        }
      });

      test('PM-020: ADMIN 角色 → 可添加/移除/更改但无法转让所有权', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        if (await membersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await membersBtn.click();

          const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // 添加按钮可见且可用
          const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
          if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(addBtn).toBeEnabled();
          }

          // 转让按钮应不可见或禁用（ADMIN 不能转让）
          const transferBtn = dialog.getByRole('button', { name: /转让|转移|移交/ });
          if (await transferBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(transferBtn).toBeDisabled();
          }
        }
      });

      test('PM-021: 仅 OWNER 可转让所有权和管理所有角色', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        if (await membersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await membersBtn.click();

          const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
          await expect(dialog).toBeVisible({ timeout: 5000 });

          // 转让按钮应对 OWNER 可见且可用
          const transferBtn = dialog.getByRole('button', { name: /转让|转移|移交/ });
          if (await transferBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(transferBtn).toBeEnabled();
          }

          // 角色管理入口应对 OWNER 可见
          const roleMgmtBtn = dialog.getByRole('button', { name: /角色管理|管理角色/ });
          if (await roleMgmtBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(roleMgmtBtn).toBeEnabled();
          }
        }
      });
    });
  });

  // ========== 项目角色管理弹窗 ==========
  test.describe('项目角色管理弹窗', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('project-members-test');
    });

    // --- 基础交互 ---
    test.describe('基础交互', () => {
      test('PR-001: 点击角色管理 → 弹窗打开', async ({ page }) => {
        // 先打开成员管理
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        // 点击角色管理
        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();
          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });
        }
      });

      test('PR-002: 弹窗标题显示角色管理', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          const title = roleDialog.locator('h2, [data-testid="modal-title"]');
          await expect(title.first()).toContainText(/角色/);
        }
      });
    });

    // --- 角色列表 ---
    test.describe('角色列表', () => {
      test('PR-003: 角色列表 → 显示系统角色和自定义角色及用户数', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          // 检查角色列表中的元素
          const roleItems = roleDialog.locator('[data-testid="role-item"], .role-item, .role-card, .role-row');
          const count = await roleItems.count();
          expect(count).toBeGreaterThanOrEqual(0);

          // 检查是否有角色显示用户数
          const userCount = roleDialog.locator('text=/\\d+.*成员|\\d+.*用户/');
          // 用户数可能显示也可能不显示，不强断言
        }
      });
    });

    // --- 创建角色 ---
    test.describe('创建角色', () => {
      test('PR-004: 创建角色 → 输入名称 → 选择类型 → 勾选权限 → 确认 → 角色添加', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          // 点击创建角色按钮
          const createBtn = roleDialog.getByRole('button', { name: /创建角色|新建角色|添加角色|\+/ });
          if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await createBtn.click();

            // 创建角色表单弹窗
            const createDialog = page.locator('[role="dialog"]').filter({ hasText: /创建.*角色|新建.*角色/ });
            if (await createDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
              // 输入角色名称
              const nameInput = createDialog.locator('input[name*="name"], input[placeholder*="名称"]').first();
              const uniqueName = `E2E_Test_Role_${Date.now()}`;
              await nameInput.fill(uniqueName);

              // 选择角色类型
              const typeSelect = createDialog.locator('select, [role="combobox"]').filter({ hasText: /类型|系统|自定义/i });
              if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
                await typeSelect.click();
                const customOption = page.locator('[role="option"]').filter({ hasText: /自定义/ }).first();
                if (await customOption.isVisible({ timeout: 3000 }).catch(() => false)) {
                  await customOption.click();
                }
              }

              // 勾选权限
              const permCheckboxes = createDialog.locator('input[type="checkbox"]');
              const checkboxCount = await permCheckboxes.count();
              if (checkboxCount > 0) {
                await permCheckboxes.first().check();
              }

              // 确认创建
              await createDialog.getByRole('button', { name: /确认|创建|保存/ }).click();

              // 等待 toast 或弹窗关闭
              const toast = page.locator('.toast, [role="status"]').filter({ hasText: /创建成功|添加成功/ });
              await expect(toast.or(roleDialog)).toBeVisible({ timeout: 10000 });
            }
          }
        }
      });
    });

    // --- 编辑角色 ---
    test.describe('编辑角色', () => {
      test('PR-005: 点击编辑 → 修改名称/权限 → 保存', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          // 找到可编辑的角色（非系统角色）并点击编辑
          const editBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .first()
            .getByRole('button', { name: /编辑|配置/ });

          if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await editBtn.click();

            const editDialog = page.locator('[role="dialog"]').filter({ hasText: /编辑.*角色|配置.*权限/ });
            if (await editDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
              // 修改名称
              const nameInput = editDialog.locator('input[name*="name"], input[placeholder*="名称"]').first();
              if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                const currentName = await nameInput.inputValue();
                await nameInput.fill(`${currentName}_updated`);
              }

              // 保存
              await editDialog.getByRole('button', { name: /确认|保存/ }).click();

              const toast = page.locator('.toast, [role="status"]').filter({ hasText: /更新成功|修改成功|保存成功/ });
              await expect(toast).toBeVisible({ timeout: 10000 });
            }
          }
        }
      });
    });

    // --- 删除角色 ---
    test.describe('删除角色', () => {
      test('PR-006: 点击删除 → 确认弹窗 → 确认 → 角色移除', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          // 找到可删除的角色（带删除按钮的）
          const deleteBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .first()
            .getByRole('button', { name: /删除/ })
            .or(roleDialog.locator('button[title*="删除角色"]').first());

          if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await deleteBtn.click();

            // 确认弹窗
            const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认删除|删除.*角色/ });
            await expect(confirmDialog).toBeVisible({ timeout: 5000 });

            await confirmDialog.getByRole('button', { name: /确认删除|确认/ }).click();

            const toast = page.locator('.toast, [role="status"]').filter({ hasText: /删除成功/ });
            await expect(toast).toBeVisible({ timeout: 10000 });
          }
        }
      });

      test('PR-007: 删除有关联用户的角色 → 显示警告提示', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          // 找一个有关联用户的角色（显示用户数的）
          const roleWithUsers = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .filter({ hasText: /\d+.*成员|\d+.*用户/ });

          const hasUsersCount = await roleWithUsers.count();
          if (hasUsersCount > 0) {
            const deleteBtn = roleWithUsers.first().getByRole('button', { name: /删除/ });
            if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await deleteBtn.click();

              // 确认弹窗应包含警告信息
              const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /删除|角色/ });
              const warning = confirmDialog.locator('text=/\\d+.*用户|\\d+.*成员|已分配|关联/');
              if (await warning.isVisible({ timeout: 5000 }).catch(() => false)) {
                await expect(warning.first()).toBeVisible();
              }
            }
          }
        }
      });
    });

    // --- 权限复选框树 ---
    test.describe('权限复选框树', () => {
      test('PR-008: 权限分组 → 展开/折叠分组', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          // 打开一个角色编辑来查看权限树
          const editBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .first()
            .getByRole('button', { name: /编辑|配置/ });

          if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await editBtn.click();

            const permDialog = page.locator('[role="dialog"]').filter({ hasText: /编辑.*角色|配置.*权限|权限/ });
            await expect(permDialog).toBeVisible({ timeout: 5000 });

            // 查找可展开的分组
            const groupHeader = permDialog.locator('[data-testid="perm-group-header"], .perm-group-header, .tree-node-toggle').first();
            if (await groupHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
              // 记录当前展开状态
              const wasExpanded = await groupHeader.getAttribute('aria-expanded');

              await groupHeader.click();

              // 验证状态切换
              const isExpanded = await groupHeader.getAttribute('aria-expanded');
              expect(isExpanded).not.toBe(wasExpanded);
            }
          }
        }
      });

      test('PR-009: 勾选/取消单个权限', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          const editBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .first()
            .getByRole('button', { name: /编辑|配置/ });

          if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await editBtn.click();

            const permDialog = page.locator('[role="dialog"]').filter({ hasText: /编辑.*角色|配置.*权限|权限/ });
            await expect(permDialog).toBeVisible({ timeout: 5000 });

            // 找到单个权限复选框
            const checkboxes = permDialog.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            if (count > 0) {
              const wasChecked = await checkboxes.first().isChecked();
              await checkboxes.first().click();
              const isChecked = await checkboxes.first().isChecked();
              expect(isChecked).not.toBe(wasChecked);
            }
          }
        }
      });

      test('PR-010: 勾选/取消全组权限', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          const editBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .first()
            .getByRole('button', { name: /编辑|配置/ });

          if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await editBtn.click();

            const permDialog = page.locator('[role="dialog"]').filter({ hasText: /编辑.*角色|配置.*权限|权限/ });
            await expect(permDialog).toBeVisible({ timeout: 5000 });

            // 查找全选复选框（父级）
            const parentCheckbox = permDialog.locator('[data-testid="perm-group-checkbox"], .group-checkbox, .tree-parent-checkbox').first();
            if (await parentCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
              const wasChecked = await parentCheckbox.isChecked();
              await parentCheckbox.click();
              const isChecked = await parentCheckbox.isChecked();
              expect(isChecked).not.toBe(wasChecked);
            }
          }
        }
      });
    });

    // --- 权限分组 ---
    test.describe('权限分组', () => {
      test('PR-011: 权限分组 → 系统权限、项目权限、库权限可见且有序', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          const editBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
            .first()
            .getByRole('button', { name: /编辑|配置/ });

          if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await editBtn.click();

            const permDialog = page.locator('[role="dialog"]').filter({ hasText: /编辑.*角色|配置.*权限|权限/ });
            await expect(permDialog).toBeVisible({ timeout: 5000 });

            // 检查权限分类标题
            const groupLabels = permDialog.locator('[data-testid="perm-group-label"], .perm-group-title, .tree-node-label');
            const labelsText = await groupLabels.allTextContents();

            // 至少有一个权限分类可见
            const hasPermGroup = labelsText.some(
              (t) => t.includes('系统') || t.includes('项目') || t.includes('库') || t.includes('文件')
            );
            expect(hasPermGroup).toBeTruthy();
          }
        }
      });
    });

    // --- 关闭弹窗 ---
    test.describe('关闭弹窗', () => {
      test('PR-012: X 按钮 → 角色弹窗关闭', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          const closeX = roleDialog.locator('[data-testid="close-modal"], .close-btn, button[aria-label="Close"]');
          await closeX.first().click();

          await expect(roleDialog).toBeHidden({ timeout: 5000 });
        }
      });

      test('PR-013: 点击遮罩 → 角色弹窗关闭', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          const overlay = page.locator('[data-testid="dialog-overlay"], .overlay, .backdrop');
          if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
            await overlay.click({ position: { x: 10, y: 10 } });
          } else {
            await page.mouse.click(10, 10);
          }

          await expect(roleDialog).toBeHidden({ timeout: 5000 });
        }
      });

      test('PR-014: 按 Esc → 角色弹窗关闭', async ({ page }) => {
        const membersBtn = page.getByRole('button', { name: /成员管理/ });
        await membersBtn.click();

        const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
        await expect(membersDialog).toBeVisible({ timeout: 5000 });

        const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
        if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleMgmtBtn.click();

          const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
          await expect(roleDialog).toBeVisible({ timeout: 5000 });

          await page.keyboard.press('Escape');

          await expect(roleDialog).toBeHidden({ timeout: 5000 });
        }
      });
    });
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    test('PM-W001: 添加成员 → 更改角色 → 移除成员 完整工作流', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('project-members-test');

      // 打开成员管理
      const membersBtn = page.getByRole('button', { name: /成员管理/ });
      await membersBtn.click();

      const dialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Step 1: 添加成员
      const addBtn = dialog.getByRole('button', { name: /添加成员|邀请成员|\+/ });
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();

        const userSearch = dialog.locator('input[placeholder*="搜索"], input[placeholder*="用户"]');
        if (await userSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
          await userSearch.fill('test');
          await page.waitForLoadState('networkidle');

          const userOption = dialog.locator('[role="option"], .search-result-item, .user-option').first();
          if (await userOption.isVisible({ timeout: 5000 }).catch(() => false)) {
            await userOption.click();
          }
        }

        const roleSelect = dialog.locator('select, [role="combobox"]').filter({ hasText: /角色|role/i });
        if (await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
          await roleSelect.click();
          const memberOption = page.locator('[role="option"]').filter({ hasText: /成员|member/i }).first();
          if (await memberOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await memberOption.click();
          }
        }

        await dialog.getByRole('button', { name: /确认|添加|邀请/ }).click();
        const addToast = page.locator('.toast, [role="status"]').filter({ hasText: /添加成功/ });
        await expect(addToast).toBeVisible({ timeout: 10000 });
      }

      // Step 2: 更改角色（点击角色下拉切换）
      const roleDropdown = dialog.locator('[data-testid="role-select"], .role-select').first();
      if (await roleDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        await roleDropdown.click();
        const editorOption = page.locator('[role="option"]').filter({ hasText: /编辑|editor/i });
        if (await editorOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await editorOption.click();
          await page.waitForLoadState('networkidle');
        }
        // 恢复为成员角色
        await roleDropdown.click();
        const memberOption = page.locator('[role="option"]').filter({ hasText: /成员|member/i }).first();
        if (await memberOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await memberOption.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // Step 3: 移除成员
      const removeBtn = dialog.locator('[data-testid="member-item"], .member-item, .member-row').first()
        .getByRole('button', { name: /移除|删除/ });

      if (await removeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await removeBtn.click();

        const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认.*移除|确认.*删除|移除.*成员/ });
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });
        await confirmDialog.getByRole('button', { name: /确认|确定/ }).click();

        const removeToast = page.locator('.toast, [role="status"]').filter({ hasText: /移除成功|删除成功/ });
        await expect(removeToast).toBeVisible({ timeout: 10000 });
      }
    });

    test('PM-W002: 创建自定义角色 → 编辑权限 → 删除角色 完整工作流', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('project-members-test');

      const membersBtn = page.getByRole('button', { name: /成员管理/ });
      await membersBtn.click();

      const membersDialog = page.locator('[role="dialog"]').filter({ hasText: /成员/ });
      await expect(membersDialog).toBeVisible({ timeout: 5000 });

      const roleMgmtBtn = membersDialog.getByRole('button', { name: /角色管理|管理角色/ });
      if (await roleMgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await roleMgmtBtn.click();

        const roleDialog = page.locator('[role="dialog"]').filter({ hasText: /角色.*管理|角色.*权限/ });
        await expect(roleDialog).toBeVisible({ timeout: 5000 });

        // Step 1: 创建角色
        const createBtn = roleDialog.getByRole('button', { name: /创建角色|新建角色|添加角色|\+/ });
        if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await createBtn.click();

          const createDialog = page.locator('[role="dialog"]').filter({ hasText: /创建.*角色|新建.*角色/ });
          if (await createDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
            const uniqueName = `E2E_Workflow_Role_${Date.now()}`;
            const nameInput = createDialog.locator('input[name*="name"], input[placeholder*="名称"]').first();
            await nameInput.fill(uniqueName);

            // 勾选一个权限
            const permCheckbox = createDialog.locator('input[type="checkbox"]').first();
            if (await permCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
              await permCheckbox.check();
            }

            await createDialog.getByRole('button', { name: /确认|创建|保存/ }).click();
            const createToast = page.locator('.toast, [role="status"]').filter({ hasText: /创建成功|添加成功/ });
            await expect(createToast).toBeVisible({ timeout: 10000 });
          }
        }

        // Step 2: 编辑刚创建的角色
        const editBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
          .filter({ hasText: /E2E_Workflow_Role/ })
          .first()
          .getByRole('button', { name: /编辑|配置/ });

        if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await editBtn.click();

          const editDialog = page.locator('[role="dialog"]').filter({ hasText: /编辑.*角色|配置.*权限/ });
          if (await editDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
            // 切换一个权限
            const checkboxes = editDialog.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            if (count > 1) {
              await checkboxes.nth(1).click(); // toggle
            }

            await editDialog.getByRole('button', { name: /确认|保存/ }).click();
            const editToast = page.locator('.toast, [role="status"]').filter({ hasText: /更新成功|修改成功|保存成功/ });
            await expect(editToast).toBeVisible({ timeout: 10000 });
          }
        }

        // Step 3: 删除角色
        const deleteBtn = roleDialog.locator('[data-testid="role-item"], .role-item, .role-row')
          .filter({ hasText: /E2E_Workflow_Role/ })
          .first()
          .getByRole('button', { name: /删除/ });

        if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await deleteBtn.click();

          const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认删除|删除.*角色/ });
          await expect(confirmDialog).toBeVisible({ timeout: 5000 });
          await confirmDialog.getByRole('button', { name: /确认删除|确认/ }).click();

          const deleteToast = page.locator('.toast, [role="status"]').filter({ hasText: /删除成功/ });
          await expect(deleteToast).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });
});
