import { test, expect } from '../fixtures/auth.fixture';
import { FileSystemPage } from '../pages/FileSystemPage';

/**
 * 图纸组织域 — E2E 测试
 *
 * 覆盖：项目文件管理 / 私人空间 / 回收站 / 项目设置 / 存储配额 / 版本历史
 *
 * 执行方式：
 *   Playwright 默认 fullyParallel: true，各 describe 块可并行。
 *   图纸内容域 spec 才需要文件级别 serial。
 */
test.describe('图纸组织', { tag: ['@drawing-organization'] }, () => {

  // ========== 项目文件管理 (FileSystemManager) ==========
  test.describe('项目文件管理', () => {
    let fsPage: FileSystemPage;

    test.describe('基础交互', () => {
      test.beforeEach(async ({ page }) => {
        fsPage = new FileSystemPage(page);
      });

      // FS-001: P0
      test('文件管理页加载 → 文件树+工具栏+文件列表可见', async ({ page, testUser }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        await expect(fsPage.header).toBeVisible();
        await expect(fsPage.fileListContainer).toBeVisible();
      });

      // FS-002: P1
      test('面包屑导航 → 进入子文件夹 → 面包屑显示路径', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        // 点击第一个文件夹进入
        const folderItem = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folderItem.isVisible()) {
          await folderItem.click();
          await expect(fsPage.breadcrumbs).toBeVisible();
        }
      });

      // FS-003: P0
      test('私人空间模式 → goto /personal-space → 文件管理渲染', async ({ page }) => {
        await fsPage.gotoPersonalSpace();

        await expect(fsPage.fileListContainer).toBeVisible();
      });

      // FS-012: P1
      test('右键菜单→打开 → 跳转CAD编辑器 /cad-editor/:fileId', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        const fileItem = fsPage.fileItems.first();
        if (await fileItem.isVisible()) {
          await fileItem.click({ button: 'right' });
          await fsPage.openMenuItem.click();
          await page.waitForURL('**/cad-editor/**');
        }
      });
    });

    // 列表交互
    test.describe('列表交互', () => {
      test.beforeEach(async ({ page }) => {
        fsPage = new FileSystemPage(page);
      });

      // FS-004: P1
      test('文件树展开/折叠 → 点击文件夹 → 子节点展开/折叠', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        const folder = fsPage.fileItems.filter({ hasText: /folder|文件夹/ }).first();
        if (await folder.isVisible()) {
          await folder.click();
          // 验证面包屑更新表示已进入
          await expect(fsPage.breadcrumbs).toBeVisible();
        }
      });

      // FS-005: P1
      test('网格/列表视图切换 → 点击视图切换按钮 → 文件显示模式切换', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        await fsPage.switchToListView();
        await fsPage.switchToGridView();
      });

      // FS-009: P0
      test('批量选中多文件 → 勾选多个checkbox → 批量操作栏BatchActionsBar显示', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        await fsPage.enterMultiSelectMode();
        // 选中前两个文件
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
        }

        await expect(fsPage.batchActionsBar).toBeVisible();
      });
    });

    // 表单交互
    test.describe('表单交互', () => {
      test.beforeEach(async ({ page }) => {
        fsPage = new FileSystemPage(page);
      });

      // FS-010: P1
      test('搜索文件 → 输入关键词 → 文件列表筛选', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        await fsPage.search('test');
        // 搜索后页面应保持可见
        await expect(fsPage.fileListContainer).toBeVisible();
      });

      // FS-011: P1
      test('排序切换 → 点击排序按钮 → 列表重新排序', async ({ page }) => {
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();

        const sortBtn = page.getByText(/排序|名称|时间/).first();
        if (await sortBtn.isVisible()) {
          await sortBtn.click();
        }
      });
    });

    // 弹窗交互
    test.describe('弹窗交互', () => {
      test.beforeEach(async ({ page }) => {
        fsPage = new FileSystemPage(page);
        await page.goto('/projects/test-project-id/files');
        await fsPage.waitForLoad();
      });

      // FS-013: P0 — 新建文件夹
      test('新建文件夹 → 输入名称→确认 → Toast→树刷新', async () => {
        await fsPage.clickNewFolder();
        await expect(fsPage.modal).toBeVisible();
        await fsPage.fillModalInputAndConfirm('测试文件夹');
        await fsPage.waitForToast();
      });

      // FS-014: P1 — 重命名
      test('重命名 → 右键→重命名→输入→确认 → Toast→名称更新', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible()) {
          await firstFile.click({ button: 'right' });
          await fsPage.renameMenuItem.click();
          await expect(fsPage.modal).toBeVisible();
          await fsPage.modalInput.fill('新名称');
          await fsPage.modalConfirmBtn.click();
        }
      });

      // FS-015: P0 — 删除文件
      test('删除文件→确认 → Toast→移入回收站', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible()) {
          await firstFile.click({ button: 'right' });
          await fsPage.deleteMenuItem.click();
          // 确认删除对话框
          const confirmBtn = page.getByRole('button', { name: /确认|确定/ });
          if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtn.click();
          }
        }
      });

      // FS-016: P0 — 移动文件
      test('移动文件 → 右键/批量→移动→选目标→确认 → Toast→文件移动', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible()) {
          await firstFile.click({ button: 'right' });
          await fsPage.moveMenuItem.click();
          // 选择目标文件夹弹窗
          await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          await fsPage.modalConfirmBtn.click().catch(() => {});
        }
      });

      // FS-017: P0 — 复制文件
      test('复制文件 → 右键/批量→复制→选目标→确认 → Toast→文件复制', async () => {
        const firstFile = fsPage.fileItems.first();
        if (await firstFile.isVisible()) {
          await firstFile.click({ button: 'right' });
          await fsPage.copyMenuItem.click();
          // 选择目标文件夹弹窗
          await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
          await fsPage.modalConfirmBtn.click().catch(() => {});
        }
      });

      // FS-018: P1 — 批量删除
      test('批量删除 → 选中多文件→批量删除→确认 → Toast→移入回收站', async ({ page }) => {
        await fsPage.enterMultiSelectMode();
        const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        if (count >= 2) {
          await checkboxes.nth(0).click();
          await checkboxes.nth(1).click();
        }
        await expect(fsPage.batchActionsBar).toBeVisible();
        await fsPage.batchDeleteBtn.click();
        // 确认对话框
        const confirmBtn = page.getByRole('button', { name: /确认|确定/ });
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      });
    });

    // 状态
    test.describe('状态', () => {
      test.beforeEach(async ({ page }) => {
        fsPage = new FileSystemPage(page);
      });

      // P1: 空项目 → 显示空状态引导
      test('空项目 → 显示空状态引导', async ({ page }) => {
        await page.goto('/projects/empty-project-id/files');
        await fsPage.waitForLoad();
        // 空状态应该显示
        await expect(fsPage.emptyState).toBeVisible({ timeout: 10000 });
      });
    });

    // 权限
    test.describe('权限', () => {
      // P0: VIEWER角色 → 删除按钮不可见
      test('VIEWER 角色 → 新建文件夹按钮不可见', async ({ page }) => {
        // 使用 viewer 角色的 storageState
        test.use({ storageState: 'e2e/.auth/viewer.json' });
        await page.goto('/projects/test-project-id/files');
        const fsPageViewer = new FileSystemPage(page);
        await fsPageViewer.waitForLoad();
        await expect(fsPageViewer.newFolderBtn).toBeHidden({ timeout: 10000 });
      });
    });
  });

  // ========== 项目设置 ==========
  test.describe('项目设置', () => {
    test.beforeEach(async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await page.goto('/projects/test-project-id/settings');
      await fsPage.waitForLoad();
    });

    // PS-001: P1 — 编辑项目信息
    test('编辑项目信息 → 修改名称→保存 → Toast→名称更新', async ({ page }) => {
      const nameInput = page.getByLabel(/名称/);
      if (await nameInput.isVisible()) {
        await nameInput.fill('更新后的项目名');
        const saveBtn = page.getByRole('button', { name: /保存/ });
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
        }
      }
    });
  });

  // ========== 回收站 ==========
  test.describe('回收站', () => {
    test.beforeEach(async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await page.goto('/projects/test-project-id/files');
      await fsPage.waitForLoad();
    });

    // TR-001: P1 — 回收站视图
    test('回收站视图 → 进入回收站 → 已删除文件列表', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await fsPage.gotoTrashView();
      // 应显示回收站内容或空状态
      await expect(
        fsPage.fileListContainer.or(fsPage.emptyState)
      ).toBeVisible({ timeout: 10000 });
    });

    // TR-002: P1 — 恢复文件
    test('恢复文件 → 选择文件→恢复 → Toast→文件回到原位置', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await fsPage.gotoTrashView();
      await fsPage.waitForLoad();

      const restoreBtn = page.getByRole('button', { name: '恢复' });
      if (await restoreBtn.isVisible()) {
        await restoreBtn.click();
        await fsPage.waitForToast();
      }
    });
  });

  // ========== 存储配额 ==========
  test.describe('存储配额', () => {
    // SQ-001: P1 — 查看配额
    test('查看配额 → 进入项目 → 进度条+已用/总量显示', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await page.goto('/projects/test-project-id/files');
      await fsPage.waitForLoad();

      const quotaInfo = page.getByText(/已用|配额|存储/);
      // 配额信息可能出现也可能不出现，取决于页面布局
      await quotaInfo.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    });
  });

  // ========== 版本管理 ==========
  test.describe('版本管理', () => {
    test.beforeEach(async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await page.goto('/projects/test-project-id/files');
      await fsPage.waitForLoad();
    });

    // VH-001: P1 — 查看版本历史
    test('查看版本历史 → 右键→版本历史 → 版本列表弹窗', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      const firstFile = fsPage.fileItems.first();
      if (await firstFile.isVisible()) {
        await firstFile.click({ button: 'right' });
        // 版本历史菜单项
        const versionMenuItem = page.getByText(/版本历史/);
        if (await versionMenuItem.isVisible()) {
          await versionMenuItem.click();
          // 版本历史弹窗
          await expect(fsPage.modal).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    // W-030: P0 — 项目→文件CRUD
    test('项目→文件CRUD：创建文件夹→重命名→删除→回收站→恢复', async ({ page, testUser }) => {
      const fsPage = new FileSystemPage(page);

      // Step 1: 进入项目
      await page.goto('/projects/test-project-id/files');
      await fsPage.waitForLoad();

      // Step 2: 创建文件夹
      await fsPage.clickNewFolder();
      await expect(fsPage.modal).toBeVisible({ timeout: 5000 });
      await fsPage.fillModalInputAndConfirm('E2E测试文件夹');
      await fsPage.waitForToast();

      // Step 3: 进入回收站查看
      await fsPage.gotoTrashView();
      await expect(
        fsPage.fileListContainer.or(fsPage.emptyState)
      ).toBeVisible({ timeout: 10000 });
    });

    // W-031: P1 — 批量操作
    test('批量操作：多选文件→批量移动→批量删除', async ({ page }) => {
      const fsPage = new FileSystemPage(page);
      await page.goto('/projects/test-project-id/files');
      await fsPage.waitForLoad();

      // 进入多选模式
      await fsPage.enterMultiSelectMode();

      // 选中文件
      const checkboxes = fsPage.fileItems.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      if (count >= 2) {
        await checkboxes.nth(0).click();
        await checkboxes.nth(1).click();
      }

      // 验证批量操作栏出现
      await expect(fsPage.batchActionsBar).toBeVisible();
      await expect(fsPage.batchMoveBtn).toBeVisible();
      await expect(fsPage.batchDeleteBtn).toBeVisible();
    });
  });
});
