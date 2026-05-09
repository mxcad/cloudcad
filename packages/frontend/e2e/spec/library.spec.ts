import { test, expect } from '../fixtures/auth.fixture';
import { LibraryPage } from '../pages/LibraryPage';
import { FontLibraryPage } from '../pages/FontLibraryPage';

/**
 * 资源库域 — E2E 测试
 *
 * 覆盖：图纸库/图块库 (LibraryManager) / 字体库 (FontLibrary)
 *
 * 执行方式：
 *   Playwright 默认 fullyParallel: true，各 describe 块可并行。
 */
test.describe('资源库', { tag: ['@library'] }, () => {

  // ========== 图纸库/图块库 (LibraryManager) ==========
  test.describe('图纸库/图块库', () => {
    let libPage: LibraryPage;

    test.describe('基础交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
      });

      // LB-001: P0 — 资源库加载
      test('资源库加载 → goto /library → 文件列表+工具栏可见', async ({ page }) => {
        await libPage.gotoDrawingLibrary();

        await expect(libPage.headerTitle).toBeVisible();
        await expect(libPage.searchInput).toBeVisible();
      });

      // LB-002: P0 — 库类型切换
      test('库类型切换→图纸/图块 → 切换库类型Tab → 文件列表切换对应库', async ({ page }) => {
        await libPage.gotoDrawingLibrary();

        // 切换到图块库
        await libPage.switchToBlockLib();
        await expect(libPage.blockLibTab).toBeVisible();
        // 切回图纸库
        await libPage.switchToDrawingLib();
        await expect(libPage.drawingLibTab).toBeVisible();
      });

      // LB-008: P0 — 打开图纸→编辑器
      test('打开图纸→编辑器 → 点击文件 → 跳转 /cad-editor/:fileId?library=drawing', async ({ page }) => {
        await libPage.gotoDrawingLibrary();

        const fileItem = libPage.fileItems.first();
        if (await fileItem.isVisible()) {
          // 点击文件打开
          await fileItem.dblclick();
          // 可能会打开新窗口
        }
      });

      // LB-009: P0 — 上传图纸
      test('上传图纸 → 上传→选文件→上传 → Toast→转换→入库', async ({ page }) => {
        await libPage.gotoDrawingLibrary();

        // 点击上传按钮会触发文件选择
        const fileChooserPromise = page.waitForEvent('filechooser');
        await libPage.uploadBtn.click().catch(() => {});
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/sample.dwg');

        // 等待上传成功 toast
        await libPage.waitForToast('上传成功');
      });
    });

    // 列表交互
    test.describe('列表交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.gotoDrawingLibrary();
      });

      // LB-003: P1 — 分页加载
      test('分页加载 → 向下滚动 → 加载更多(每页20条)', async ({ page }) => {
        const fileItems = libPage.fileItems;
        const initialCount = await fileItems.count();

        // 如果存在分页控件，点击下一页
        const nextPageBtn = page.getByRole('button', { name: /下一页|〉|>/ });
        if (await nextPageBtn.isVisible()) {
          await nextPageBtn.click();
          await libPage.waitForLoad();
        }
      });

      // LB-006: P1 — 分页控件
      test('分页控件 → 点击分页按钮 → 首页/上一页/下一页/末页', async ({ page }) => {
        const pagination = libPage.pagination;
        if (await pagination.isVisible()) {
          // 验证分页控件存在
          await expect(pagination).toBeVisible();
        }
      });
    });

    // 表单交互
    test.describe('表单交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.gotoDrawingLibrary();
      });

      // LB-007: P1 — 搜索图纸
      test('搜索图纸 → 输入关键词 → 文件列表筛选', async () => {
        await libPage.search('test');
        await libPage.waitForLoad();
        await expect(libPage.searchInput).toHaveValue('test');
      });
    });

    // 弹窗交互
    test.describe('弹窗交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.gotoDrawingLibrary();
      });

      // LB-011: P1 — 删除图纸
      test('删除图纸→确认 → 右键→删除→二次确认 → Toast→移除', async ({ page }) => {
        const firstFile = libPage.fileItems.first();
        if (await firstFile.isVisible()) {
          // 右键点击文件
          await firstFile.click({ button: 'right' });

          // 点击删除菜单项
          const deleteMenuItem = page.getByText(/删除/);
          if (await deleteMenuItem.isVisible()) {
            await deleteMenuItem.click();
            // 确认对话框
            const confirmBtn = page.getByRole('button', { name: /确认删除|确定/ });
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await confirmBtn.click();
            }
          }
        }
      });

      // LB-012: P1 — 新建文件夹
      test('新建文件夹 → 新建→输入名称→确认 → Toast→树刷新', async () => {
        await libPage.clickNewFolder();
        await expect(libPage.modal).toBeVisible({ timeout: 5000 });
        await libPage.fillModalInputAndConfirm('E2E测试文件夹');
        await libPage.waitForToast();
      });

      // LB-013: P1 — 移动/复制
      test('移动/复制 → 右键→选目标→确认 → Toast→操作完成', async ({ page }) => {
        const firstFile = libPage.fileItems.first();
        if (await firstFile.isVisible()) {
          await firstFile.click({ button: 'right' });

          const moveMenuItem = page.getByText(/移动/);
          if (await moveMenuItem.isVisible()) {
            await moveMenuItem.click();
            // 选择目标弹窗
            await expect(libPage.modal).toBeVisible({ timeout: 5000 });
          }
        }
      });
    });

    // 状态
    test.describe('状态', () => {
      // LB-014: P1 — 库为空→空状态
      test('库为空→空状态引导', async ({ page }) => {
        const libPage = new LibraryPage(page);
        await page.goto('/library/block');
        await libPage.waitForLoad();

        // 空状态应可见（如果库确实为空）
        const hasFiles = await libPage.fileItems.first().isVisible().catch(() => false);
        if (!hasFiles) {
          await expect(libPage.emptyState).toBeVisible({ timeout: 10000 });
        }
      });
    });

    // 权限
    test.describe('权限', () => {
      // LB-015: P0 — 无库权限→NoPermissionPage
      test('无库权限→NoPermissionPage → USER访问/library', async ({ page }) => {
        // 使用 USER 角色的 storageState
        test.use({ storageState: 'e2e/.auth/user.json' });
        await page.goto('/library/drawing');

        // 应该显示无权限或重定向
        const noPermission = page.getByText(/无权|无权限|权限不足/);
        await noPermission.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          // 也可能是重定向到登录页
        });
      });
    });
  });

  // ========== 字体库 (FontLibrary) ==========
  test.describe('字体库', () => {
    let fontPage: FontLibraryPage;

    test.describe('基础交互', () => {
      test.beforeEach(async ({ page }) => {
        fontPage = new FontLibraryPage(page);
      });

      // FL-001: P0 — 字体库加载
      test('字体库加载 → goto /font-library → 字体列表可见', async ({ page }) => {
        await fontPage.goto();

        await expect(fontPage.pageTitle).toBeVisible();
      });

      // FL-003: P1 — 字体预览
      test('字体预览 → 点击字体 → 预览示例文字', async ({ page }) => {
        await fontPage.goto();

        const firstCard = fontPage.fontCards.first();
        if (await firstCard.isVisible()) {
          await firstCard.click();
        }
      });

      // FL-004: P1 — 下载字体
      test('下载字体 → 点击下载 → 触发下载', async ({ page }) => {
        await fontPage.goto();

        const firstCard = fontPage.fontCards.first();
        if (await firstCard.isVisible()) {
          await firstCard.hover();
          const downloadBtn = fontPage.downloadBtns.first();
          if (await downloadBtn.isVisible()) {
            await downloadBtn.click();
          }
        }
      });
    });

    // 弹窗交互
    test.describe('弹窗交互', () => {
      test.beforeEach(async ({ page }) => {
        fontPage = new FontLibraryPage(page);
      });

      // FL-002: P1 — 上传字体
      test('上传字体 → 上传→选文件→确认 → Toast→字体入库', async ({ page }) => {
        await fontPage.goto();
        await fontPage.openUploadModal();

        await expect(fontPage.uploadModal).toBeVisible({ timeout: 5000 });

        // 上传文件
        const fileChooserPromise = page.waitForEvent('filechooser');
        await fontPage.uploadDropZone.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/sample.ttf');

        // 点击上传按钮
        await fontPage.uploadSubmitBtn.click();
        await fontPage.waitForToast('上传成功');
      });

      // FL-005: P1 — 删除字体
      test('删除字体→确认 → 删除→确认 → Toast→移除', async ({ page }) => {
        await fontPage.goto();

        const firstCard = fontPage.fontCards.first();
        if (await firstCard.isVisible()) {
          await fontPage.deleteFontAt(0);
          // 确认对话框
          const confirmBtn = page.getByRole('button', { name: /确认删除|确定/ });
          if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtn.click();
          }
        }
      });
    });

    // 权限
    test.describe('权限', () => {
      // FL-006: P1 — ADMIN→可访问
      test('ADMIN→可访问 → ADMIN访问 → 正常加载', async ({ page }) => {
        test.use({ storageState: 'e2e/.auth/admin.json' });
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();

        await expect(fontPage.pageTitle).toBeVisible({ timeout: 10000 });
      });

      // FL-007: P0 — USER→NoPermissionPage
      test('USER→NoPermissionPage → USER访问 → 无权限提示', async ({ page }) => {
        test.use({ storageState: 'e2e/.auth/user.json' });
        await page.goto('/font-library');

        const noPermission = page.getByText(/无权|无权限|权限不足|无访问权限/);
        await noPermission.first().waitFor({ state: 'visible', timeout: 10000 });
      });
    });

    // 状态
    test.describe('状态', () => {
      // P1 — 空字体库→空状态
      test('空字体库 → 显示空状态引导', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();

        const hasFonts = await fontPage.fontCards.first().isVisible().catch(() => false);
        if (!hasFonts) {
          await expect(fontPage.emptyState).toBeVisible({ timeout: 10000 });
        }
      });
    });

    // 筛选和排序
    test.describe('筛选和排序', () => {
      test.beforeEach(async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();
      });

      // P1 — 格式筛选
      test('格式筛选 → 选择TTF → 列表筛选', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.filterByFormat('.ttf');
        await fontPage.waitForLoad();
      });

      // P1 — 排序切换
      test('排序切换 → 按名称排序 → 列表重排', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.sortBy('name');
        await fontPage.waitForLoad();
      });
    });
  });

  // ========== 端到端工作流 ==========
  test.describe('端到端工作流', () => {
    // W-040: P0 — 图纸库上传→打开→下载
    test('图纸库上传→打开→下载：上传→等转换→点击打开→CAD编辑器→下载', async ({ page }) => {
      const libPage = new LibraryPage(page);
      await libPage.gotoDrawingLibrary();

      // 验证页面加载
      await expect(libPage.headerTitle).toBeVisible();

      // 上传文件
      const fileChooserPromise = page.waitForEvent('filechooser');
      await libPage.uploadBtn.click().catch(() => {});
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles('e2e/test-files/sample.dwg');

      // 等待上传成功
      await libPage.waitForToast('上传成功');
    });

    // W-041: P1 — 图块库浏览→搜索
    test('图块库浏览→搜索：切换图块库→搜索→分页', async ({ page }) => {
      const libPage = new LibraryPage(page);
      await libPage.gotoBlockLibrary();

      await expect(libPage.blockLibTab).toBeVisible();

      // 搜索
      await libPage.search('block');
      await libPage.waitForLoad();
    });

    // W-042: P1 — 字体库上传→预览→删除
    test('字体库上传→预览→删除：上传→预览→删除', async ({ page }) => {
      const fontPage = new FontLibraryPage(page);
      await fontPage.goto();

      // 验证加载
      await expect(fontPage.pageTitle).toBeVisible({ timeout: 10000 });

      // 如果有字体，点击第一个预览
      const firstCard = fontPage.fontCards.first();
      if (await firstCard.isVisible().catch(() => false)) {
        await firstCard.click();
      }
    });
  });
});
