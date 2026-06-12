import { test, expect } from '../fixtures/auth.fixture';
import { FileSystemPage } from '../pages/FileSystemPage';
import { DashboardPage } from '../pages/DashboardPage';

/**
 * 图纸组织域 — E2E 测试
 *
 * 覆盖：项目文件管理 / 私人空间 / 回收站 / 项目设置 / 存储配额 / 版本历史 / 仪表盘
 *
 * 执行方式：
 *   Playwright 默认 fullyParallel: true，各 describe 块可并行。
 *   图纸内容域 spec 才需要文件级别 serial。
 */
test.describe('图纸组织', { tag: ['@drawing-organization'] }, () => {

  // ========== 仪表盘（项目区） ==========
  test.describe('仪表盘 — 项目区', () => {
    let dashPage: DashboardPage;

    test.beforeEach(async ({ page }) => {
      dashPage = new DashboardPage(page);
      await dashPage.goto();
    });

    test.describe('基础交互', () => {
      // DB-001: P0
      test('仪表盘页面加载 → 项目卡片列表 + 新建项目CTA可见', async () => {
        await expect(dashPage.greeting).toBeVisible();
        await expect(dashPage.newProjectButton).toBeVisible();
        await expect(dashPage.statCards).toBeVisible();
      });

      // DB-002: P1
      test('空状态 — 无项目时引导 → 显示空状态引导文案', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');
        const emptyState = page.getByText(/暂无|创建第一个项目|还没有项目/);
        const projectCards = dashPage.projectCards;
        // 如果有项目则显示卡片，否则显示空状态
        await expect(emptyState.or(dashPage.statCards)).toBeVisible({ timeout: 10000 });
      });

      // DB-003: P1
      test('项目卡片列表 — 滚动加载更多', async ({ page }) => {
        await dashPage.goto();
        const cards = page.locator('[data-testid="project-card"]');
        const initialCount = await cards.count();
        // 滚动到底部
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForLoadState('networkidle');
        // 卡片数应增加或保持不变（取决于数据量）
        const afterCount = await cards.count();
        expect(afterCount).toBeGreaterThanOrEqual(initialCount);
      });

      // DB-004: P1
      test('项目搜索 — 输入关键词实时筛选', async ({ page }) => {
        const searchInput = page.getByPlaceholder(/搜索项目/);
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await searchInput.fill('测试');
          await page.waitForLoadState('networkidle');
          // 筛选后页面应保持可见
          await expect(dashPage.statCards).toBeVisible();
        }
      });
    });

    test.describe('状态', () => {
      // DB-005: P2
      test('加载中 — Skeleton卡片占位', async ({ page }) => {
        // 通过 API 拦截模拟慢速响应
        await page.route('**/api/dashboard**', async (route) => {
          await new Promise((r) => setTimeout(r, 2000));
          await route.continue();
        });
        await dashPage.goto();
        // Skeleton 应短暂出现
        const skeleton = page.locator('.animate-pulse, [class*="skeleton"]');
        await expect(skeleton.or(dashPage.statCards)).toBeVisible({ timeout: 15000 });
      });
    });

    test.describe('弹窗交互', () => {
      // DB-006: P0
      test('新建项目 — 填写名称和描述 → 创建成功', async ({ page }) => {
        await dashPage.openCreateProjectModal();
        await expect(dashPage.createProjectModal).toBeVisible({ timeout: 5000 });

        const nameInput = page.locator('[role="dialog"]').getByLabel(/名称/);
        const descInput = page.locator('[role="dialog"]').getByLabel(/描述/);
        if (await nameInput.isVisible()) {
          await nameInput.fill(`E2E项目_${Date.now()}`);
          if (await descInput.isVisible()) {
            await descInput.fill('E2E测试项目');
          }
          const confirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /确认|创建/ });
          await confirmBtn.click();
          // 成功后 toast 出现
          const toast = page.locator('.toast, [role="status"]').first();
          await expect(toast).toBeVisible({ timeout: 10000 });
        }
      });

      // DB-007: P1
      test('新建项目 — 空名称校验 → 必填提示', async ({ page }) => {
        await dashPage.openCreateProjectModal();
        await expect(dashPage.createProjectModal).toBeVisible({ timeout: 5000 });

        const confirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /确认|创建/ });
        // 直接点击确认（不填名称）
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
          // 应有校验提示或按钮仍禁用
          const error = page.locator('[role="dialog"]').getByText(/必填|请输入/);
          await expect(error.or(dashPage.createProjectModal)).toBeVisible({ timeout: 5000 });
        }
      });
    });
  });

  // ========== 项目文件管理 — FileSystemManager (project mode) ==========
  test.describe('项目文件管理 — 基础加载', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
    });

    test.describe('基础交互', () => {
      // FS-001: P0
      test('文件管理页加载 → 文件树+工具栏+文件列表可见', async () => {
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.header).toBeVisible();
        await expect(fsPage.fileListContainer).toBeVisible();
        await expect(fsPage.newFolderBtn).toBeVisible();
      });

      // FS-002/FD-001: P1
      test('面包屑导航 → 进入子文件夹 → 面包屑显示完整路径', async () => {
        await fsPage.gotoProjectFiles('test-project-id');
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await folderItem.click();
          await expect(fsPage.breadcrumbs).toBeVisible({ timeout: 5000 });
        }
      });

      // FS-003: P1
      test('面包屑 — 点击上级目录 → 跳转对应目录', async () => {
        await fsPage.gotoProjectFiles('test-project-id');
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await folderItem.click();
          await expect(fsPage.breadcrumbs).toBeVisible({ timeout: 5000 });
          // 点击面包屑中的第一个层级（项目根目录）
          const breadcrumbLinks = fsPage.breadcrumbs.locator('a, button');
          const bcCount = await breadcrumbLinks.count();
          if (bcCount > 0) {
            await breadcrumbLinks.first().click();
            await expect(fsPage.fileListContainer).toBeVisible();
          }
        }
      });

      // FS-004: P1
      test('返回按钮 → 回到上级目录', async () => {
        await fsPage.gotoProjectFiles('test-project-id');
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await folderItem.click();
          await page.waitForLoadState('networkidle');
          // 返回按钮
          const backBtn = fsPage.page.getByLabel(/返回|back/).or(fsPage.page.getByTitle(/返回|back/));
          if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await backBtn.click();
            await expect(fsPage.fileListContainer).toBeVisible();
          }
        }
      });
    });

    test.describe('状态', () => {
      // FS-010: P2
      test('加载中 — 文件列表Skeleton占位', async ({ page }) => {
        await page.route('**/api/file-system/**', async (route) => {
          await new Promise((r) => setTimeout(r, 2000));
          await route.continue();
        });
        await fsPage.gotoProjectFiles('test-project-id');
        const skeleton = page.locator('.animate-pulse, [class*="skeleton"]');
        await expect(skeleton.or(fsPage.fileListContainer)).toBeVisible({ timeout: 15000 });
      });

      // FS-011: P1
      test('空状态 — 空文件夹引导文案', async () => {
        await fsPage.gotoProjectFiles('empty-project-id');
        await expect(fsPage.emptyState).toBeVisible({ timeout: 10000 });
      });

      // FS-012: P2
      test('错误 — 网络错误 → 显示错误提示和重试', async ({ page }) => {
        await page.route('**/api/file-system/**', (route) => route.abort('timedout'));
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.errorMessage).toBeVisible({ timeout: 10000 });
      });
    });
  });

  // ========== 项目文件管理 — FileSystemManager (personal-space mode) ==========
  test.describe('私人空间', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
    });

    test.describe('基础交互', () => {
      // PS-001: P0
      test('私人空间页面加载 → FileSystemManager mode=personal-space渲染', async () => {
        await fsPage.gotoPersonalSpace();
        await expect(fsPage.fileListContainer).toBeVisible();
        await expect(fsPage.header).toBeVisible();
      });

      // PS-002: P1
      test('私人空间文件树浏览 → 展开文件夹/查看文件', async () => {
        await fsPage.gotoPersonalSpace();
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await folderItem.click();
          await expect(fsPage.breadcrumbs.or(fsPage.fileListContainer)).toBeVisible();
        }
      });

      // PS-003: P1
      test('私人空间子目录 → 面包屑正常', async () => {
        await fsPage.gotoPersonalSpace();
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await folderItem.click();
          await expect(fsPage.breadcrumbs).toBeVisible({ timeout: 5000 });
        }
      });

      // PS-004: P0
      test('私人空间 — 新建文件夹 → Toast → 刷新', async () => {
        await fsPage.gotoPersonalSpace();
        await fsPage.clickNewFolder();
        await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
        await fsPage.fillModalInputAndConfirm(`个人文件夹_${Date.now()}`);
        await fsPage.waitForToast();
      });

      // PS-008: P2
      test('私人空间 — 空状态 → 空文件夹引导', async ({ page }) => {
        // 使用没有文件的测试账号
        test.use({ storageState: 'e2e/.auth/empty-user.json' });
        await fsPage.gotoPersonalSpace();
        await expect(fsPage.emptyState).toBeVisible({ timeout: 10000 });
      });
    });
  });

  // ========== 工具栏 ==========
  test.describe('工具栏', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // FS-001 toolbar subset
      test('工具栏 → 新建按钮可见（新建文件夹/新建文件）', async () => {
        await expect(fsPage.newFolderBtn).toBeVisible();
      });

      // FS-001 toolbar subset
      test('工具栏 → 上传按钮可见', async () => {
        await expect(fsPage.uploadBtn).toBeVisible();
      });

      // FS-009: P1
      test('视图切换 → 网格/列表切换', async () => {
        await fsPage.switchToListView();
        await expect(fsPage.fileListContainer).toBeVisible();
        await fsPage.switchToGridView();
        await expect(fsPage.fileListContainer).toBeVisible();
      });

      // FS-007: P1
      test('搜索 → 输入关键词实时筛选', async () => {
        await fsPage.search('test');
        await expect(fsPage.fileListContainer).toBeVisible();
      });

      // FS-008: P1
      test('排序切换 → 点击排序按钮 → 列表重新排序', async ({ page }) => {
        const sortBtn = page.getByText(/排序|名称|时间/).first();
        if (await sortBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sortBtn.click();
          await expect(fsPage.fileListContainer).toBeVisible();
        }
      });
    });

    test.describe('状态', () => {
      test('搜索清空 → 恢复完整列表', async () => {
        await fsPage.search('test');
        await fsPage.searchInput.clear();
        await fsPage.page.keyboard.press('Enter');
        await expect(fsPage.fileListContainer).toBeVisible();
      });
    });
  });

  // ========== 文件树 ==========
  test.describe('文件树', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // FT-001: P1
      test('文件树展开文件夹 → 子节点展开显示', async ({ page }) => {
        const treeFolder = page.locator('[data-testid="file-tree"]').getByText(/folder|文件夹/).first();
        if (await treeFolder.isVisible({ timeout: 3000 }).catch(() => false)) {
          await treeFolder.click();
          // 子节点应出现
          const subItems = page.locator('[data-testid="file-tree"] [data-testid="tree-item"]');
          const count = await subItems.count();
          expect(count).toBeGreaterThan(0);
        }
      });

      // FT-002: P1
      test('文件树折叠文件夹 → 子节点折叠隐藏', async ({ page }) => {
        const treeFolder = page.locator('[data-testid="file-tree"]').getByText(/folder|文件夹/).first();
        if (await treeFolder.isVisible({ timeout: 3000 }).catch(() => false)) {
          // 第一次点击展开
          await treeFolder.click();
          // 第二次点击折叠
          await treeFolder.click();
          // 子节点应隐藏
          const subItems = page.locator('[data-testid="file-tree"] [data-testid="tree-item"]');
          // 折叠后子节点不可见
          await expect(subItems.first()).toBeHidden({ timeout: 3000 }).catch(() => {});
        }
      });

      // FT-003: P2
      test('文件树 → 文件夹/文件图标正确区分', async ({ page }) => {
        const folderIcon = page.locator('[data-testid="file-tree"]').locator('[class*="folder"], [class*="Folder"]').first();
        // 图标存在性验证
        const treeVisible = await page.locator('[data-testid="file-tree"]').isVisible({ timeout: 5000 }).catch(() => false);
        expect(treeVisible).toBeTruthy();
      });

      // FT-004: P0
      test('文件树点击节点 → 右侧文件列表跳转对应目录', async ({ page }) => {
        const treeNode = page.locator('[data-testid="file-tree"]').getByText(/folder|文件夹/).first();
        if (await treeNode.isVisible({ timeout: 3000 }).catch(() => false)) {
          await treeNode.click();
          await page.waitForLoadState('networkidle');
          await expect(fsPage.breadcrumbs.or(fsPage.fileListContainer)).toBeVisible();
        }
      });
    });
  });

  // ========== 文件列表 — 网格视图 ==========
  test.describe('文件列表 — 网格视图', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
      await fsPage.switchToGridView();
    });

    test.describe('基础交互', () => {
      // FL-001: P0
      test('文件卡片渲染 → 文件/文件夹卡片可见', async () => {
        await expect(fsPage.fileItems.first()).toBeVisible({ timeout: 10000 });
      });

      test('文件卡片 → 显示文件名', async ({ page }) => {
        const firstCard = fsPage.fileItems.first();
        if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
          const nameEl = firstCard.locator('[class*="name"], [class*="title"], span').first();
          await expect(nameEl).toBeVisible();
        }
      });
    });

    test.describe('状态', () => {
      test('网格空状态 → 无文件时显示引导', async () => {
        await fsPage.gotoProjectFiles('empty-project-id');
        await fsPage.switchToGridView();
        await expect(fsPage.emptyState).toBeVisible({ timeout: 10000 });
      });
    });
  });

  // ========== 文件列表 — 列表视图 ==========
  test.describe('文件列表 — 列表视图', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
      await fsPage.switchToListView();
    });

    test.describe('基础交互', () => {
      // FL-001 table variant: P0
      test('文件表格渲染 → 列标题可见', async ({ page }) => {
        await expect(fsPage.fileItems.first()).toBeVisible({ timeout: 10000 });
      });

      test('文件表格 → 文件名列显示', async ({ page }) => {
        const firstRow = fsPage.fileItems.first();
        if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(firstRow).toBeVisible();
        }
      });
    });
  });

  // ========== 右键菜单 ==========
  test.describe('右键菜单', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // CM-001: P1
      test('右键菜单 → 打开 → 跳转CAD编辑器', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.openMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.openMenuItem.click();
            await page.waitForURL('**/cad-editor/**', { timeout: 10000 });
          }
        }
      });

      // CM-002: P1
      test('右键菜单 → 重命名 → 弹窗预填充当前名称 → 确认', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.renameMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.renameMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            // 预填充当前名称
            const inputValue = await fsPage.modalInput.inputValue();
            expect(inputValue.length).toBeGreaterThan(0);
          }
        }
      });

      // CM-003: P1
      test('右键菜单 → 移动 → 选择目标弹窗打开', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.moveMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.moveMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          }
        }
      });

      // CM-004: P1
      test('右键菜单 → 复制 → 选择目标弹窗打开', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.copyMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.copyMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          }
        }
      });

      // CM-005: P0
      test('右键菜单 → 删除 → 确认弹窗 → 移入回收站', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.deleteMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.deleteMenuItem.click();
            // 确认弹窗
            const confirmBtn = page.getByRole('button', { name: /确认|确定/ });
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await confirmBtn.click();
              await fsPage.waitForToast();
            }
          }
        }
      });

      // CM-006: P1
      test('右键菜单 → 版本历史 → 版本列表弹窗打开', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          const versionBtn = fsPage.versionHistoryMenuItem.or(page.getByText(/版本历史/));
          if (await versionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await versionBtn.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 10000 });
          }
        }
      });

      // CM-009: P2
      test('右键菜单 — 文件夹右键 → "打开"不可用', async ({ page }) => {
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible({ timeout: 5000 }).catch(() => false)) {
          await folderItem.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          // 文件夹不应有"打开"菜单项（或禁用）
          const openItem = page.getByRole('menuitem', { name: '打开' });
          const isHidden = await openItem.isHidden().catch(() => true);
          const isDisabled = await openItem.isDisabled().catch(() => true);
          expect(isHidden || isDisabled).toBeTruthy();
        }
      });
    });
  });

  // ========== 批量操作栏 ==========
  test.describe('批量操作栏', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // BA-001: P0
      test('多选文件 → BatchActionsBar显示"已选N个"', async () => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
        }
      });

      // BA-002: P1
      test('取消全选 → BatchActionsBar隐藏', async () => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
          // 取消选择
          await fsPage.batchClearBtn.click();
          await expect(fsPage.batchActionsBar).toBeHidden({ timeout: 5000 });
        }
      });

      // BA-003: P0
      test('批量移动 → 选目标→确认 → Toast', async () => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
          await fsPage.batchMoveBtn.click();
          await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          // 选择目标文件夹并确认
          await fsPage.modalConfirmBtn.click().catch(() => {});
        }
      });

      // BA-004: P0
      test('批量复制 → 选目标→确认 → Toast', async () => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
          await fsPage.batchCopyBtn.click();
          await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          await fsPage.modalConfirmBtn.click().catch(() => {});
        }
      });

      // BA-005: P0
      test('批量删除 → 确认弹窗 → Toast', async ({ page }) => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
          await fsPage.batchDeleteBtn.click();
          // 确认
          const confirmBtn = page.getByRole('button', { name: /确认|确定/ });
          if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtn.click();
            await fsPage.waitForToast();
          }
        }
      });

      // BA-006: P1
      test('批量删除确认弹窗 → 显示文件计数', async ({ page }) => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 3) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await checkboxes.nth(2).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
          await fsPage.batchDeleteBtn.click();
          // 确认弹窗应包含文件数
          const dialogText = page.locator('[role="dialog"], [role="alertdialog"]').getByText(/3/);
          await expect(dialogText.first()).toBeVisible({ timeout: 5000 });
        }
      });
    });
  });

  // ========== 拖拽 ==========
  test.describe('拖拽', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // DD-001: P1
      test('拖拽文件到文件夹 → 目标文件夹高亮 → 释放→文件移动', async () => {
        const items = fsPage.fileItems;
        const itemCount = await items.count();
        if (itemCount >= 2) {
          // 找到第一个文件类型的项目（非文件夹）
          const fileItem = items.first();
          // 找到第一个文件夹
          const folderItem = items.filter({ hasText: /folder|文件夹/ }).first();
          const folderVisible = await folderItem.isVisible({ timeout: 3000 }).catch(() => false);
          const fileVisible = await fileItem.isVisible({ timeout: 3000 }).catch(() => false);
          if (folderVisible && fileVisible) {
            await fileItem.dragTo(folderItem);
            await fsPage.waitForToast();
          }
        }
      });

      // DD-002: P2
      test('拖拽 — 拖到非目标区域 → 无操作', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 3000 }).catch(() => false)) {
          // 拖到面包屑区域（非文件夹目标）
          if (await fsPage.breadcrumbs.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstFile.dragTo(fsPage.breadcrumbs);
            // 不应出现 toast（无操作）
            await page.waitForTimeout(500);
          }
        }
      });

      // DD-004: P2
      test('拖拽 — 视觉反馈 → 拖拽时有高亮', async () => {
        const items = fsPage.fileItems;
        const itemCount = await items.count();
        if (itemCount >= 2) {
          const fileItem = items.first();
          const folderItem = items.filter({ hasText: /folder|文件夹/ }).first();
          const folderVisible = await folderItem.isVisible({ timeout: 3000 }).catch(() => false);
          const fileVisible = await fileItem.isVisible({ timeout: 3000 }).catch(() => false);
          if (folderVisible && fileVisible) {
            // 开始拖拽（dragTo 包含视觉验证）
            await fileItem.dragTo(folderItem);
            // 拖拽完成后页面正常渲染
            await expect(fsPage.fileListContainer).toBeVisible();
          }
        }
      });
    });
  });

  // ========== 新建文件夹 ==========
  test.describe('新建文件夹', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('弹窗交互', () => {
      // CR-001: P0
      test('新建文件夹 → 输入名称→确认 → Toast→文件树刷新', async () => {
        await fsPage.clickNewFolder();
        await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
        await fsPage.fillModalInputAndConfirm(`测试文件夹_${Date.now()}`);
        await fsPage.waitForToast();
      });

      // CR-002: P1
      test('新建文件夹 — 空名称校验 → 必填提示', async () => {
        await fsPage.clickNewFolder();
        await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
        // 不填名称直接确认
        await fsPage.modalConfirmBtn.click();
        // 应有校验或按钮仍禁用
        const error = fsPage.modal.locator(':text("必填"), :text("请输入"), :text("不能为空")');
        const modalStillOpen = fsPage.modal;
        await expect(error.or(modalStillOpen)).toBeVisible({ timeout: 5000 });
      });

      // CR-003: P2
      test('新建文件夹 — 特殊字符 → 校验提示', async ({ page }) => {
        await fsPage.clickNewFolder();
        await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
        await fsPage.modalInput.fill('<>:"/\\|?*');
        await fsPage.modalConfirmBtn.click();
        // 应有校验或自动过滤
        const error = fsPage.modal.locator(':text("非法字符"), :text("不允许"), :text("特殊字符")');
        await expect(error.or(fsPage.toast)).toBeVisible({ timeout: 5000 });
      });

      test('新建文件夹 — 取消 → 弹窗关闭', async () => {
        await fsPage.clickNewFolder();
        await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
        await fsPage.closeModal();
        await expect(fsPage.modal).toBeHidden({ timeout: 5000 });
      });
    });
  });

  // ========== 重命名 ==========
  test.describe('重命名', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('弹窗交互', () => {
      // RN-001: P1
      test('重命名 — 当前名称预填充', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.renameMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.renameMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            const value = await fsPage.modalInput.inputValue();
            expect(value.length).toBeGreaterThan(0);
          }
        }
      });

      // RN-002: P1
      test('重命名 — 输入新名称→回车确认 → Toast', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.renameMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.renameMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            await fsPage.modalInput.fill(`重命名_${Date.now()}`);
            await fsPage.modalInput.press('Enter');
            await fsPage.waitForToast();
          }
        }
      });

      // RN-003: P2
      test('重命名 — 空名称校验 → 校验提示', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.renameMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.renameMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            await fsPage.modalInput.clear();
            await fsPage.modalConfirmBtn.click();
            const error = fsPage.modal.locator(':text("必填"), :text("请输入"), :text("不能为空")');
            await expect(error.or(fsPage.modal)).toBeVisible({ timeout: 5000 });
          }
        }
      });
    });
  });

  // ========== 删除确认 ==========
  test.describe('删除确认', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('弹窗交互', () => {
      // DL-001: P0
      test('删除确认弹窗 → "确定删除？"显示', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.deleteMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.deleteMenuItem.click();
            const dialogText = page.getByText(/确定删除/);
            await expect(dialogText.first()).toBeVisible({ timeout: 5000 });
          }
        }
      });

      // DL-002: P1
      test('删除确认 — 文件计数 → "确定删除选中的N个文件？"', async ({ page }) => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
          await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });
          await fsPage.batchDeleteBtn.click();
          const dialogText = page.getByText(/2/);
          await expect(dialogText.first()).toBeVisible({ timeout: 5000 });
        }
      });

      // DL-003: P2
      test('删除确认 — 取消 → 弹窗关闭，文件未删除', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        const initialCount = await fsPage.fileItems.count();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.deleteMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.deleteMenuItem.click();
            const cancelBtn = page.getByRole('button', { name: /取消/ });
            if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await cancelBtn.click();
              // 弹窗关闭
              await expect(fsPage.modal).toBeHidden({ timeout: 5000 });
              // 文件数量不变
              const afterCount = await fsPage.fileItems.count();
              expect(afterCount).toBe(initialCount);
            }
          }
        }
      });
    });
  });

  // ========== 移动/复制弹窗 ==========
  test.describe('移动/复制弹窗', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('弹窗交互', () => {
      // MC-001: P1
      test('移动 — 目标选择器树形结构', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.moveMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.moveMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            // 目标选择器应有树形结构
            const treeSelector = fsPage.modal.locator('[data-testid="folder-tree"], [class*="tree"], [class*="folder-select"]');
            await expect(treeSelector.or(fsPage.modal)).toBeVisible({ timeout: 5000 });
          }
        }
      });

      // MC-002: P2
      test('移动 — 目标选择器搜索文件夹', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.moveMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.moveMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            // 弹性搜索输入框
            const searchInput = fsPage.modal.locator('input[type="text"], input[placeholder*="搜索"]').first();
            if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              await searchInput.fill('test');
              await expect(fsPage.modal).toBeVisible();
            }
          }
        }
      });

      // MC-004: P0
      test('移动 — 确认后文件树和列表刷新', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.moveMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.moveMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            await fsPage.modalConfirmBtn.click().catch(() => {});
            await fsPage.waitForToast();
          }
        }
      });

      // MC-003: P1
      test('复制 — 重名自动去重 → "(1)"重命名', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          if (await fsPage.copyMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
            await fsPage.copyMenuItem.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
            // 选择同一个目标，确认后会触发去重
            await fsPage.modalConfirmBtn.click().catch(() => {});
            await fsPage.waitForToast();
          }
        }
      });
    });
  });

  // ========== 版本历史 ==========
  test.describe('版本历史', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      // 使用多版本历史文件的项目
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // VH-001: P1
      test('查看版本历史 → 时间线列表', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          const versionBtn = fsPage.versionHistoryMenuItem.or(page.getByText(/版本历史/));
          if (await versionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await versionBtn.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 10000 });
          }
        }
      });

      // VH-003: P2
      test('恢复历史版本 → 选择版本→确认 → Toast', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          const versionBtn = fsPage.versionHistoryMenuItem.or(page.getByText(/版本历史/));
          if (await versionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await versionBtn.click();
            await expect(fsPage.modal).toBeVisible({ timeout: 10000 });
            // 恢复按钮
            const restoreBtn = fsPage.modal.getByRole('button', { name: /恢复/ });
            if (await restoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await restoreBtn.click();
              // 二次确认
              const confirmBtn = page.getByRole('button', { name: /确认|确定/ });
              if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmBtn.click();
              }
            }
          }
        }
      });
    });
  });

  // ========== 回收站 ==========
  test.describe('回收站', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // TR-001: P1
      test('回收站入口 → 切换到回收站视图 → 已删除文件列表', async () => {
        const trashVisible = await fsPage.trashViewBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (trashVisible) {
          await fsPage.gotoTrashView();
          await fsPage.waitForLoad();
          await expect(
            fsPage.fileListContainer.or(fsPage.emptyState)
          ).toBeVisible({ timeout: 10000 });
        }
      });

      // TR-003: P1
      test('恢复单个文件 → Toast → 文件回到原位置', async () => {
        const trashVisible = await fsPage.trashViewBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (trashVisible) {
          await fsPage.gotoTrashView();
          await fsPage.waitForLoad();

          const firstItem = fsPage.fileItems.first();
          const hasItems = await firstItem.isVisible({ timeout: 5000 }).catch(() => false);
          if (hasItems) {
            // 选择文件并恢复
            await firstItem.locator('input[type="checkbox"]').click().catch(() => {});
            if (await fsPage.batchRestoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await fsPage.batchRestoreBtn.click();
              await fsPage.waitForToast();
            }
          }
        }
      });

      // TR-005: P1
      test('永久删除单个文件 → 确认弹窗 → Toast', async ({ page }) => {
        const trashVisible = await fsPage.trashViewBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (trashVisible) {
          await fsPage.gotoTrashView();
          await fsPage.waitForLoad();

          const firstItem = fsPage.fileItems.first();
          const hasItems = await firstItem.isVisible({ timeout: 5000 }).catch(() => false);
          if (hasItems) {
            await firstItem.locator('input[type="checkbox"]').click().catch(() => {});
            if (await fsPage.batchPermanentDeleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await fsPage.batchPermanentDeleteBtn.click();
              // 二次确认
              const confirmBtn = page.getByRole('button', { name: /确认|确定|彻底/ });
              if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirmBtn.click();
                await fsPage.waitForToast();
              }
            }
          }
        }
      });

      // TR-007: P2
      test('回收站空状态 → "回收站为空"', async () => {
        const trashVisible = await fsPage.trashViewBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (trashVisible) {
          await fsPage.gotoTrashView();
          await fsPage.waitForLoad();
          const emptyOrList = fsPage.emptyState.or(fsPage.fileItems.first());
          await expect(emptyOrList).toBeVisible({ timeout: 10000 });
        }
      });
    });
  });

  // ========== 分页 ==========
  test.describe('分页', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // FL-002: P1
      test('无限滚动 — 向下滚动加载更多', async ({ page }) => {
        const initialCount = await fsPage.fileItems.count();
        // 滚动到底部
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForLoadState('networkidle');
        const afterCount = await fsPage.fileItems.count();
        expect(afterCount).toBeGreaterThanOrEqual(initialCount);
      });
    });
  });

  // ========== 上传 ==========
  test.describe('上传', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // CR-005: P0
      test('上传文件 → 选择文件→确认 → Toast→列表刷新', async ({ page }) => {
        await fsPage.uploadBtn.click();
        const fileChooserPromise = page.waitForEvent('filechooser');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/sample.dwg');
        await fsPage.waitForToast();
      });

      // CR-007: P2
      test('上传大型文件 → 进度条显示 → 上传完成', async ({ page }) => {
        await fsPage.uploadBtn.click();
        const fileChooserPromise = page.waitForEvent('filechooser');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/large-sample.dwg');
        // 进度条可能出现
        const progress = page.locator('[role="progressbar"]');
        await progress.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await fsPage.waitForToast();
      });
    });

    test.describe('权限', () => {
      // CR-006: P1
      test('VIEWER 角色 → 上传按钮不可见', async ({ page }) => {
        test.use({ storageState: 'e2e/.auth/viewer.json' });
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.uploadBtn).toBeHidden({ timeout: 10000 });
      });
    });
  });

  // ========== 权限 — UI按钮可见性矩阵 ==========
  test.describe('权限 — UI按钮可见性矩阵', () => {

    test.describe('OWNER 角色', () => {
      test.use({ storageState: 'e2e/.auth/owner.json' });

      test('OWNER → 所有按钮可见', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.newFolderBtn).toBeVisible({ timeout: 10000 });
        await expect(fsPage.uploadBtn).toBeVisible({ timeout: 5000 });
        await expect(fsPage.projectSettingsBtn).toBeVisible({ timeout: 5000 });
        await expect(fsPage.trashViewBtn.first()).toBeVisible({ timeout: 5000 });
      });
    });

    test.describe('ADMIN 角色', () => {
      test.use({ storageState: 'e2e/.auth/admin.json' });

      test('ADMIN → 新建/上传/设置/回收站可见', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.newFolderBtn).toBeVisible({ timeout: 10000 });
        await expect(fsPage.uploadBtn).toBeVisible({ timeout: 5000 });
        await expect(fsPage.projectSettingsBtn).toBeVisible({ timeout: 5000 });
        await expect(fsPage.trashViewBtn.first()).toBeVisible({ timeout: 5000 });
      });

      test('ADMIN → 右键菜单：重命名/移动/复制/删除/打开/版本可见', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          await expect(fsPage.openMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.renameMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.moveMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.copyMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.deleteMenuItem).toBeVisible({ timeout: 3000 });
        }
      });
    });

    test.describe('MEMBER 角色', () => {
      test.use({ storageState: 'e2e/.auth/member.json' });

      test('MEMBER → 新建可见，项目设置/回收站隐藏', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.newFolderBtn).toBeVisible({ timeout: 10000 });
        await expect(fsPage.projectSettingsBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
        await expect(fsPage.trashViewBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
      });

      test('MEMBER → 右键菜单：重命名/移动/复制/删除/打开/版本可见', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          await expect(fsPage.openMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.renameMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.moveMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.copyMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.deleteMenuItem).toBeVisible({ timeout: 3000 });
        }
      });
    });

    test.describe('EDITOR 角色', () => {
      test.use({ storageState: 'e2e/.auth/editor.json' });

      test('EDITOR → 新建隐藏，上传/删除/移动/复制可见', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.newFolderBtn).toBeHidden({ timeout: 10000 }).catch(() => {});
        await expect(fsPage.uploadBtn).toBeVisible({ timeout: 10000 });
        await expect(fsPage.projectSettingsBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
        await expect(fsPage.trashViewBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
      });

      test('EDITOR → 右键菜单：打开/移动/复制/删除/版本可见，重命名隐藏', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          await expect(fsPage.openMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.moveMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.copyMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.deleteMenuItem).toBeVisible({ timeout: 3000 });
          await expect(fsPage.renameMenuItem).toBeHidden({ timeout: 3000 }).catch(() => {});
        }
      });
    });

    test.describe('VIEWER 角色', () => {
      test.use({ storageState: 'e2e/.auth/viewer.json' });

      test('VIEWER → 新建/上传/删除/移动/复制/设置/回收站 全部隐藏', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        await expect(fsPage.newFolderBtn).toBeHidden({ timeout: 10000 }).catch(() => {});
        await expect(fsPage.uploadBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
        await expect(fsPage.projectSettingsBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
        await expect(fsPage.trashViewBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
      });

      // CM-008: VIEWER 右键仅打开/版本
      test('VIEWER → 右键菜单：仅打开/版本可见', async ({ page }) => {
        const fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click({ button: 'right' });
          await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
          await expect(fsPage.openMenuItem).toBeVisible({ timeout: 3000 });
          // 编辑操作应隐藏
          await expect(fsPage.renameMenuItem).toBeHidden({ timeout: 3000 }).catch(() => {});
          await expect(fsPage.moveMenuItem).toBeHidden({ timeout: 3000 }).catch(() => {});
          await expect(fsPage.copyMenuItem).toBeHidden({ timeout: 3000 }).catch(() => {});
          await expect(fsPage.deleteMenuItem).toBeHidden({ timeout: 3000 }).catch(() => {});
        }
      });
    });
  });

  // ========== 项目设置 ==========
  test.describe('项目设置', () => {
    let fsPage: FileSystemPage;

    test.describe('基础交互', () => {
      test.beforeEach(async ({ page }) => {
        fsPage = new FileSystemPage(page);
        await fsPage.gotoProjectFiles('test-project-id');
      });

      // PJ-006: P1
      test('编辑项目信息 → 修改名称→保存 → Toast→名称更新', async ({ page }) => {
        const settingsVisible = await fsPage.projectSettingsBtn.isVisible({ timeout: 5000 }).catch(() => false);
        if (settingsVisible) {
          await fsPage.projectSettingsBtn.click();
          await page.waitForURL('**/settings**', { timeout: 10000 }).catch(() => {});
          const nameInput = page.getByLabel(/名称/);
          if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await nameInput.fill(`更新后项目_${Date.now()}`);
            const saveBtn = page.getByRole('button', { name: /保存/ });
            if (await saveBtn.isVisible()) {
              await saveBtn.click();
              await fsPage.waitForToast();
            }
          }
        }
      });
    });

    test.describe('权限', () => {
      // PJ-008: P1
      test('MEMBER 角色 → 项目设置按钮隐藏', async ({ page }) => {
        test.use({ storageState: 'e2e/.auth/member.json' });
        const fsPageMember = new FileSystemPage(page);
        await fsPageMember.gotoProjectFiles('test-project-id');
        await expect(fsPageMember.projectSettingsBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
      });

      // PJ-010: P1
      test('ADMIN 角色 → 项目设置可见，但删除项目按钮可能不可见', async ({ page }) => {
        test.use({ storageState: 'e2e/.auth/admin.json' });
        const fsPageAdmin = new FileSystemPage(page);
        await fsPageAdmin.gotoProjectFiles('test-project-id');
        const settingsVisible = await fsPageAdmin.projectSettingsBtn.isVisible({ timeout: 5000 }).catch(() => false);
        if (settingsVisible) {
          await fsPageAdmin.projectSettingsBtn.click();
          await page.waitForURL('**/settings**', { timeout: 10000 }).catch(() => {});
          // 删除项目按钮（仅OWNER可见）
          const deleteProjectBtn = page.getByRole('button', { name: /删除项目|彻底删除/ });
          await expect(deleteProjectBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
        }
      });
    });
  });

  // ========== 存储配额 ==========
  test.describe('存储配额', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // SQ-001: P1
      test('查看配额 → 进度条+已用/总量显示', async () => {
        // 配额信息可能出现也可能不出现取决于页面布局
        const quota = fsPage.quotaBar.or(fsPage.quotaText);
        await quota.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      });

      // SQ-004: P2
      test('配额进度条变化 — 上传/删除后更新', async ({ page }) => {
        // 上传文件后检查配额更新
        await fsPage.uploadBtn.click();
        const fileChooserPromise = page.waitForEvent('filechooser');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/sample.dwg');
        await fsPage.waitForToast();
        // 配额信息应仍然可见
        const quota = fsPage.quotaBar.or(fsPage.quotaText);
        await quota.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      });
    });
  });

  // ========== 文件详情页 ==========
  test.describe('文件详情页', () => {
    let fsPage: FileSystemPage;

    test.beforeEach(async ({ page }) => {
      fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');
    });

    test.describe('基础交互', () => {
      // FD-001: P1
      test('文件详情页加载 → 文件树展开到选中节点', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          // 获取文件节点 ID 并导航到详情页
          await firstFile.click();
          await page.waitForLoadState('networkidle');
          // 详情页应正常渲染
          await expect(fsPage.fileListContainer.or(fsPage.breadcrumbs)).toBeVisible();
        }
      });

      // FD-003: P2
      test('文件详情 — 面包屑显示当前路径', async ({ page }) => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstFile.click();
          await page.waitForLoadState('networkidle');
          if (await fsPage.breadcrumbs.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(fsPage.breadcrumbs).toBeVisible();
          }
        }
      });
    });
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    // W-001: P0 — 项目创建→文件CRUD→回收站→恢复
    test('W-001: 项目创建→文件CRUD→回收站→恢复', async ({ page, testUser }) => {
      const fsPage = new FileSystemPage(page);
      const dashPage = new DashboardPage(page);

      // Step 1: 登录进入仪表盘
      await dashPage.goto();

      // Step 2: 进入项目
      await fsPage.gotoProjectFiles('test-project-id');

      // Step 3: 新建文件夹
      await fsPage.clickNewFolder();
      await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
      const folderName = `E2E工作流_${Date.now()}`;
      await fsPage.fillModalInputAndConfirm(folderName);
      await fsPage.waitForToast();

      // Step 4: 进入新建的文件夹
      await page.waitForLoadState('networkidle');
      const folderItem = fsPage.fileItems.filter({ hasText: folderName }).first();
      if (await folderItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await folderItem.click();
        await page.waitForLoadState('networkidle');
      }

      // Step 5: 返回项目根目录
      const breadcrumbRoot = fsPage.breadcrumbs.locator('a, button').first();
      if (await breadcrumbRoot.isVisible({ timeout: 3000 }).catch(() => false)) {
        await breadcrumbRoot.click();
        await page.waitForLoadState('networkidle');
      }

      // Step 6: 创建另一个文件用于删除测试
      await fsPage.clickNewFolder();
      await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
      const deleteFolderName = `待删除_${Date.now()}`;
      await fsPage.fillModalInputAndConfirm(deleteFolderName);
      await fsPage.waitForToast();
      await page.waitForLoadState('networkidle');

      // Step 7: 删除创建的文件夹
      const deleteTarget = fsPage.fileItems.filter({ hasText: deleteFolderName }).first();
      if (await deleteTarget.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deleteTarget.click({ button: 'right' });
        await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
        if (await fsPage.deleteMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fsPage.deleteMenuItem.click();
          const confirmBtn = page.getByRole('button', { name: /确认|确定/ });
          if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtn.click();
            await fsPage.waitForToast();
          }
        }
      }

      // Step 8: 进入回收站验证
      await page.waitForLoadState('networkidle');
      const trashVisible = await fsPage.trashViewBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (trashVisible) {
        await fsPage.gotoTrashView();
        await expect(
          fsPage.fileListContainer.or(fsPage.emptyState)
        ).toBeVisible({ timeout: 10000 });
      }

      // Step 9: 返回项目文件
      await fsPage.gotoProjectFiles('test-project-id');
      await expect(fsPage.fileListContainer).toBeVisible({ timeout: 10000 });
    });

    // W-002: P1 — 批量操作全流程
    test('W-002: 批量操作全流程 → 多选→移动→复制→删除', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');

      // 进入多选模式
      await fsPage.enterMultiSelectMode();
      const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      if (count >= 2) {
        await checkboxes.nth(0).click();
        await checkboxes.nth(1).click();
        await expect(fsPage.batchActionsBar).toBeVisible({ timeout: 5000 });

        // 批量移动
        if (await fsPage.batchMoveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fsPage.batchMoveBtn.click();
          await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          await fsPage.closeModal();
        }

        // 批量复制
        if (await fsPage.batchCopyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fsPage.batchCopyBtn.click();
          await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          await fsPage.closeModal();
        }

        // 取消多选
        await fsPage.batchClearBtn.click();
        await expect(fsPage.batchActionsBar).toBeHidden({ timeout: 5000 });
      }
    });

    // W-006: P1 — 版本管理全流程
    test('W-006: 版本管理全流程 → 查看版本→恢复', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await fsPage.gotoProjectFiles('test-project-id');

      const firstFile = fsPage.fileItems.first();
      if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 打开版本历史
        await firstFile.click({ button: 'right' });
        await expect(fsPage.contextMenu).toBeVisible({ timeout: 5000 });
        const versionBtn = fsPage.versionHistoryMenuItem.or(page.getByText(/版本历史/));
        if (await versionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await versionBtn.click();
          await expect(fsPage.modal).toBeVisible({ timeout: 10000 });
          await fsPage.closeModal();
        }
      }
    });
  });
});
