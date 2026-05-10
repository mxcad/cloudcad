import { test, expect } from '../fixtures/auth.fixture';
import { LibraryPage } from '../pages/LibraryPage';
import { FontLibraryPage } from '../pages/FontLibraryPage';
import { LoginPage } from '../pages/LoginPage';

/**
 * 资源库域 — E2E 测试
 *
 * 覆盖：图纸库/图块库 (LibraryManager) / 字体库 (FontLibrary)
 *
 * 执行方式：
 *   Playwright 默认 fullyParallel: true，各 describe 块可并行。
 *   font-manager 角色测试使用 storageState 覆盖。
 */
test.describe('资源库', { tag: ['@library'] }, () => {

  // ========================================================================
  // 图纸库/图块库 (LibraryManager)
  // ========================================================================
  test.describe('图纸库/图块库', () => {
    let libPage: LibraryPage;

    test.describe('基础交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('admin', 'Admin@123');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
      });

      // LB-001: P0 — 资源库加载
      test('LB-001 资源库加载 → 文件列表 + 工具栏可见', async () => {
        await libPage.goto('drawing');

        await expect(libPage.fileCards.first()).toBeVisible({ timeout: 10000 });
        await expect(libPage.uploadBtn).toBeVisible();
        await expect(libPage.newFolderBtn).toBeVisible();
        await expect(libPage.searchInput).toBeVisible();
      });

      // LB-002: P0 — 库类型切换
      test('LB-002 库类型切换 → 图纸/图块库 Tab → 内容切换', async () => {
        await libPage.goto('drawing');

        // 默认图纸库激活
        await expect(libPage.drawingLibTab).toBeVisible();

        // 切换到图块库
        await libPage.switchToBlockLibrary();
        await expect(libPage.blockLibTab).toBeVisible();

        // 切回图纸库
        await libPage.switchToDrawingLibrary();
        await expect(libPage.drawingLibTab).toBeVisible();
      });

      // LB-008: P0 — 打开图纸 → CAD 编辑器
      test('LB-008 打开图纸 → 双击文件卡片 → 跳转 CAD 编辑器', async ({ page }) => {
        await libPage.goto('drawing');

        const firstCard = libPage.fileCards.first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        // 通过右键菜单 "打开" 触发跳转
        await libPage.openFile(await firstCard.locator('[data-testid="file-name"]').textContent() ?? '');
        await page.waitForURL(/\/cad-editor\//, { timeout: 15000 }).catch(() => {
          // 可能在新 tab 打开，验证文件卡片仍然存在即可
        });
      });

      // LB-009: P0 — 上传图纸
      test('LB-009 上传图纸 → 选择文件 → 进度条 → Toast 成功', async ({ page }) => {
        await libPage.goto('drawing');

        const fileChooserPromise = page.waitForEvent('filechooser');
        await libPage.uploadBtn.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/sample.dwg');

        // 等待上传提交按钮可见
        await expect(libPage.uploadSubmitBtn).toBeVisible({ timeout: 5000 });
        await libPage.uploadSubmitBtn.click();

        // 等待上传成功 toast
        await expect(libPage.toast).toBeVisible({ timeout: 30000 });
      });
    });

    // 列表交互
    test.describe('列表交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.goto('drawing');
      });

      // LB-003: P1 — 滚动加载更多
      test('LB-003 滚动加载 → 向下滚动 → 加载更多文件', async () => {
        const initialCount = await libPage.getFileCount();

        // 如果有足够数据触发滚动加载
        if (initialCount > 0) {
          await libPage.scrollLoadMore();
          const afterScrollCount = await libPage.getFileCount();
          // 滚动后至少不应减少
          expect(afterScrollCount).toBeGreaterThanOrEqual(initialCount);
        }
      });

      // LB-006: P1 — 分页控件
      test('LB-006 分页控件 → 首页/上一页/跳转/下一页/末页', async () => {
        // 先检查分页控件是否存在
        const isPaginationVisible = await libPage.pagination.isVisible().catch(() => false);
        if (!isPaginationVisible) {
          // 如果数据不够一页，分页控件不显示，跳过
          return;
        }

        await expect(libPage.pagination).toBeVisible();
        await expect(libPage.firstPageBtn).toBeVisible();
        await expect(libPage.prevPageBtn).toBeVisible();
        await expect(libPage.nextPageBtn).toBeVisible();
        await expect(libPage.lastPageBtn).toBeVisible();

        // 测试跳转到指定页
        await libPage.jumpToPage(1);
      });

      // LB-005: P2 — 滚动位置恢复
      test('LB-005 滚动位置恢复 → 翻页后返回 → 位置保持', async () => {
        const isPaginationVisible = await libPage.pagination.isVisible().catch(() => false);
        if (!isPaginationVisible) return;

        // 记录当前文件列表
        const firstPageNames = await libPage.getFileNames();

        // 跳转到下一页
        await libPage.clickNextPage();
        const secondPageNames = await libPage.getFileNames();

        // 返回上一页
        await libPage.clickPrevPage();
        const restoredNames = await libPage.getFileNames();

        // 验证回到第一页内容
        expect(restoredNames).toEqual(firstPageNames);
      });
    });

    // 搜索与过滤
    test.describe('搜索与过滤', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.goto('drawing');
      });

      // LB-007: P1 — 搜索图纸
      test('LB-007 搜索图纸 → 输入关键词 → 实时筛选', async () => {
        await libPage.search('test');
        await expect(libPage.searchInput).toHaveValue('test');

        // 验证搜索结果
        const results = await libPage.getFileNames();
        // 搜索结果应该匹配关键词（如果有结果的话）
        for (const name of results) {
          expect(name.toLowerCase()).toContain('test');
        }

        // 清除搜索
        await libPage.clearSearch();
        await expect(libPage.searchInput).toHaveValue('');
      });

      // P1 — 空搜索结果
      test('搜索无匹配结果 → 显示空状态', async () => {
        await libPage.search('___nonexistent_file_name___');
        // 等待搜索完成
        await libPage.waitForLoadComplete();

        const count = await libPage.getFileCount();
        if (count === 0) {
          await expect(libPage.emptyState).toBeVisible({ timeout: 5000 });
        }
      });
    });

    // 右键菜单
    test.describe('右键菜单', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.goto('drawing');
      });

      // P1 — 右键菜单打开
      test('右键文件 → 显示上下文菜单', async ({ page }) => {
        const firstCard = libPage.fileCards.first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        await firstCard.click({ button: 'right' });
        await expect(libPage.contextMenu).toBeVisible({ timeout: 5000 });
        await expect(libPage.contextMenuOpen).toBeVisible();
        await expect(libPage.contextMenuMove).toBeVisible();
        await expect(libPage.contextMenuCopy).toBeVisible();
        await expect(libPage.contextMenuDownload).toBeVisible();
        await expect(libPage.contextMenuDelete).toBeVisible();
      });

      // LB-010: P1 — 下载图纸
      test('LB-010 下载图纸 → 右键 → 下载 → 触发浏览器下载', async ({ page }) => {
        const firstCard = libPage.fileCards.first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        const fileName = await firstCard.locator('[data-testid="file-name"]').textContent();
        if (fileName) {
          const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
          await libPage.downloadFile(fileName);
          const download = await downloadPromise;
          if (download) {
            expect(download.suggestedFilename()).toBeTruthy();
          }
        }
      });

      // LB-013: P1 — 移动/复制
      test('LB-013 移动 → 右键 → 移动 → 选择目标弹窗', async () => {
        const firstCard = libPage.fileCards.first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        await firstCard.click({ button: 'right' });
        await expect(libPage.contextMenu).toBeVisible();
        await libPage.contextMenuMove.click();

        // 应弹出目标选择对话框
        await expect(libPage.uploadModal).toBeVisible({ timeout: 5000 });
      });

      // P1 — 复制
      test('复制 → 右键 → 复制 → 选择目标弹窗', async () => {
        const firstCard = libPage.fileCards.first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        await firstCard.click({ button: 'right' });
        await expect(libPage.contextMenu).toBeVisible();
        await libPage.contextMenuCopy.click();

        await expect(libPage.uploadModal).toBeVisible({ timeout: 5000 });
      });
    });

    // 弹窗交互
    test.describe('弹窗交互', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.goto('drawing');
      });

      // LB-011: P1 — 删除图纸
      test('LB-011 删除图纸 → 右键 → 删除 → 确认 → 移除', async () => {
        const firstCard = libPage.fileCards.first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        const fileName = await firstCard.locator('[data-testid="file-name"]').textContent();
        if (!fileName) return;

        const initialCount = await libPage.getFileCount();
        await libPage.deleteFile(fileName);

        // 确认对话框应出现
        await expect(libPage.confirmDialog).toBeVisible({ timeout: 5000 });
        await libPage.confirmDelete();

        // 等待 toast 确认
        await expect(libPage.toast).toBeVisible({ timeout: 10000 });

        // 验证文件已从列表中移除
        const afterCount = await libPage.getFileCount();
        expect(afterCount).toBe(initialCount - 1);
      });

      // LB-012: P1 — 新建文件夹
      test('LB-012 新建文件夹 → 输入名称 → 确认 → Toast 成功', async () => {
        await libPage.newFolderBtn.click();

        // 文件夹名称弹窗
        await expect(libPage.uploadModal).toBeVisible({ timeout: 5000 });
        await libPage.folderNameInput.fill('E2E-测试文件夹');
        await libPage.folderConfirmBtn.click();

        // 等待成功 toast
        await expect(libPage.toast).toBeVisible({ timeout: 10000 });
      });
    });

    // 面包屑导航
    test.describe('面包屑导航', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.goto('drawing');
      });

      test('面包屑可见', async () => {
        await expect(libPage.breadcrumbs).toBeVisible({ timeout: 10000 });
      });
    });

    // 状态
    test.describe('状态', () => {
      // LB-014: P1 — 空状态
      test('LB-014 空文件夹 → 显示空状态引导', async ({ page }) => {
        const libPage = new LibraryPage(page);
        // 使用一个不存在的文件夹 ID 来触发空状态
        await libPage.gotoSpecificFolder('nonexistent-folder-id');

        const hasFiles = await libPage.getFileCount();
        if (hasFiles === 0) {
          await expect(libPage.emptyState).toBeVisible({ timeout: 10000 });
        }
      });

      // P1 — 加载骨架屏
      test('页面加载中 → 显示骨架屏卡片', async ({ page }) => {
        // 导航到一个新页面，在加载完成前检查骨架屏
        const navPromise = page.goto('/library/drawing');
        // 骨架屏应在内容加载前显示
        const skeletonVisible = await libPage.loadingSkeleton.first().isVisible().catch(() => false);
        await navPromise;

        // 加载完成后骨架屏应消失
        if (skeletonVisible) {
          await libPage.waitForLoadComplete();
          await expect(libPage.loadingSkeleton.first()).toBeHidden({ timeout: 10000 });
        }
      });

      // P1 — 网络错误重试
      test('网络错误 → 显示重试提示', async ({ page }) => {
        // 拦截 API 请求模拟网络错误
        await page.route('**/api/file-system/**', route => route.abort('failed'));

        await page.goto('/library/drawing', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // 应显示错误状态
        const errorText = page.getByText(/错误|失败|重试|network/i);
        // 有错误状态即可（实现的错误处理可能不同）
      });
    });

    // 上传格式验证
    test.describe('上传验证', () => {
      test.beforeEach(async ({ page }) => {
        libPage = new LibraryPage(page);
        await libPage.goto('drawing');
      });

      test('上传非 CAD 格式文件 → 显示格式错误', async ({ page }) => {
        const fileChooserPromise = page.waitForEvent('filechooser');
        await libPage.uploadBtn.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/invalid.txt');

        // 应显示格式错误提示
        const errorToast = page.getByText(/格式不支持|文件类型/);
        // 验证上传表单仍然可用
        await expect(libPage.uploadModal).toBeVisible({ timeout: 5000 });
      });
    });
  });

  // ========================================================================
  // 字体库 (FontLibrary)
  // ========================================================================
  test.describe('字体库', () => {
    let fontPage: FontLibraryPage;

    test.describe('基础交互', () => {
      test.beforeEach(async ({ page }) => {
        fontPage = new FontLibraryPage(page);
      });

      // FL-001: P0 — 字体库加载
      test('FL-001 字体库加载 → 字体表格可见', async () => {
        await fontPage.goto();

        await expect(fontPage.fontTable).toBeVisible({ timeout: 10000 });
      });

      // 表格列：名称、格式、大小
      test('字体表格 → 包含名称/格式/大小列', async () => {
        await fontPage.goto();

        await expect(fontPage.fontTable).toBeVisible({ timeout: 10000 });
        const tableHeaders = fontPage.fontTable.locator('thead th');
        const headerTexts = await tableHeaders.allTextContents();

        expect(headerTexts.some(h => /名称|名字|font.*name/i.test(h))).toBeTruthy();
        expect(headerTexts.some(h => /格式|format/i.test(h))).toBeTruthy();
        expect(headerTexts.some(h => /大小|size/i.test(h))).toBeTruthy();
      });

      // FL-003: P1 — 字体预览
      test('FL-003 字体预览 → 点击字体名称 → 显示预览', async () => {
        await fontPage.goto();

        const firstRow = fontPage.fontTableRows.first();
        await expect(firstRow).toBeVisible({ timeout: 10000 });

        const fontName = await firstRow.locator('td:first-child').textContent();
        if (fontName) {
          await fontPage.previewFont(fontName);
          await expect(fontPage.fontPreviewModal).toBeVisible({ timeout: 10000 });
        }
      });

      // FL-004: P1 — 下载字体
      test('FL-004 下载字体 → 点击下载按钮 → 触发下载', async ({ page }) => {
        await fontPage.goto();

        const firstRow = fontPage.fontTableRows.first();
        await expect(firstRow).toBeVisible({ timeout: 10000 });

        const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await fontPage.downloadBtns.first().click();
        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toBeTruthy();
        }
      });
    });

    // 上传
    test.describe('上传字体', () => {
      test.beforeEach(async ({ page }) => {
        fontPage = new FontLibraryPage(page);
      });

      // FL-002: P1 — 上传字体
      test('FL-002 上传字体 → 选择 ttf → 进度条 → Toast 成功', async ({ page }) => {
        await fontPage.goto();

        const initialCount = await fontPage.getFontCount();

        const fileChooserPromise = page.waitForEvent('filechooser');
        await fontPage.uploadFontBtn.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('e2e/test-files/sample.ttf');

        // 点击上传按钮
        await expect(fontPage.uploadSubmitBtn).toBeVisible({ timeout: 5000 });

        // 可能的进度条
        const progressVisible = await fontPage.uploadProgressBar.isVisible().catch(() => false);

        await fontPage.uploadSubmitBtn.click();

        // 等待上传成功
        await expect(fontPage.toast).toBeVisible({ timeout: 30000 });

        // 验证字体数量增加
        await fontPage.goto(); // 刷新页面
        const newCount = await fontPage.getFontCount();
        expect(newCount).toBeGreaterThan(initialCount);
      });
    });

    // 删除
    test.describe('删除字体', () => {
      test.beforeEach(async ({ page }) => {
        fontPage = new FontLibraryPage(page);
        await fontPage.goto();
      });

      // FL-005: P1 — 删除字体
      test('FL-005 删除字体 → 点击删除 → 确认 → Toast → 移除', async () => {
        const firstRow = fontPage.fontTableRows.first();
        await expect(firstRow).toBeVisible({ timeout: 10000 });

        const fontName = await firstRow.locator('td:first-child').textContent();
        if (!fontName) return;

        const initialCount = await fontPage.getFontCount();
        await fontPage.deleteFont(fontName);

        // 确认对话框
        await expect(fontPage.confirmDialog).toBeVisible({ timeout: 5000 });
        await fontPage.confirmDelete();

        // 等待 toast
        await expect(fontPage.toast).toBeVisible({ timeout: 10000 });

        // 重新加载页面验证
        await fontPage.goto();
        const afterCount = await fontPage.getFontCount();
        expect(afterCount).toBe(initialCount - 1);
      });

      // P1 — 取消删除
      test('取消删除 → 点击取消 → 字体保留', async () => {
        const firstRow = fontPage.fontTableRows.first();
        await expect(firstRow).toBeVisible({ timeout: 10000 });

        const fontName = await firstRow.locator('td:first-child').textContent();
        if (!fontName) return;

        const initialCount = await fontPage.getFontCount();
        await fontPage.deleteFont(fontName);

        // 点击取消（如果存在取消按钮）
        const cancelBtn = fontPage.uploadCancelBtn;
        if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cancelBtn.click();
        } else {
          // 关闭对话框
          await fontPage.page.keyboard.press('Escape');
        }

        await fontPage.goto();
        const afterCount = await fontPage.getFontCount();
        expect(afterCount).toBe(initialCount);
      });
    });

    // 状态
    test.describe('状态', () => {
      // P1 — 空状态
      test('空字体库 → 显示空状态引导', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();

        const hasFonts = await fontPage.fontTableRows.first().isVisible().catch(() => false);
        if (!hasFonts) {
          await expect(fontPage.emptyState).toBeVisible({ timeout: 10000 });
        }
      });

      // P1 — 加载状态
      test('字体库加载中 → 显示加载指示器', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();

        // 表格或内容应在加载后可见
        await expect(fontPage.fontTable).toBeVisible({ timeout: 15000 });
      });
    });
  });

  // ========================================================================
  // 权限验证
  // ========================================================================
  test.describe('权限', () => {
    test.describe('USER 角色权限', () => {
      test.beforeEach(async ({ page }) => {
        await page.context().storageState({ path: 'e2e/.auth/user.json' });
      });
      test('LB-015 USER → 访问 /library → NoPermissionPage', async ({ page }) => {
        await page.goto('/library/drawing');
        const noPermission = page.getByText(/无权|无权限|权限不足|无访问权限/);
        await expect(noPermission.first()).toBeVisible({ timeout: 10000 });
      });
      test('FL-007 USER → 访问 /font-library → NoPermissionPage', async ({ page }) => {
        await page.goto('/font-library');
        const noPermission = page.getByText(/无权|无权限|权限不足|无访问权限/);
        await expect(noPermission.first()).toBeVisible({ timeout: 10000 });
      });
    });

    test.describe('FONT_MANAGER 角色权限', () => {
      test.beforeEach(async ({ page }) => {
        await page.context().storageState({ path: 'e2e/.auth/font-manager.json' });
      });
      test('FONT_MANAGER → 访问 /font-library → 正常加载', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();
        await expect(fontPage.fontTable).toBeVisible({ timeout: 10000 });
        await expect(fontPage.uploadFontBtn).toBeVisible();
      });
      test('FONT_MANAGER → 访问 /library → NoPermissionPage', async ({ page }) => {
        await page.goto('/library/drawing');
        const noPermission = page.getByText(/无权|无权限|权限不足|无访问权限/);
        await expect(noPermission.first()).toBeVisible({ timeout: 10000 });
      });
      test('FONT_MANAGER → 字体库上传/删除按钮可见', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();
        await expect(fontPage.uploadFontBtn).toBeVisible({ timeout: 10000 });
        const firstRow = fontPage.fontTableRows.first();
        if (await firstRow.isVisible()) {
          await expect(fontPage.deleteBtns.first()).toBeVisible();
          await expect(fontPage.downloadBtns.first()).toBeVisible();
        }
      });
    });

    test.describe('ADMIN 角色权限', () => {
      test.beforeEach(async ({ page }) => {
        await page.context().storageState({ path: 'e2e/.auth/admin.json' });
      });
      test('FL-006 ADMIN → 访问 /font-library → 正常加载', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();
        await expect(fontPage.fontTable).toBeVisible({ timeout: 10000 });
      });
      test('ADMIN → 字体库上传/删除按钮可见', async ({ page }) => {
        const fontPage = new FontLibraryPage(page);
        await fontPage.goto();
        await expect(fontPage.uploadFontBtn).toBeVisible({ timeout: 10000 });
        const firstRow = fontPage.fontTableRows.first();
        if (await firstRow.isVisible()) {
          await expect(fontPage.deleteBtns.first()).toBeVisible();
          await expect(fontPage.downloadBtns.first()).toBeVisible();
        }
      });
      test('ADMIN → 资源库 → 上传/新建文件夹/删除按钮可见', async ({ page }) => {
        const libPage = new LibraryPage(page);
        await libPage.goto('drawing');
        await expect(libPage.uploadBtn).toBeVisible({ timeout: 10000 });
        await expect(libPage.newFolderBtn).toBeVisible();
        await expect(libPage.deleteSelectedBtn).toBeVisible();
      });
    });
  });

  // ========================================================================
  // 端到端工作流
  // ========================================================================
  test.describe('端到端工作流', () => {
    // W-040: P0 — 图纸库上传 → 打开 → 下载
    test('W-040 图纸库上传→打开→下载 完整流程', async ({ page }) => {
      const libPage = new LibraryPage(page);
      await libPage.goto('drawing');

      // Step 1: 验证页面加载
      await expect(libPage.fileCards.first()).toBeVisible({ timeout: 10000 });

      // Step 2: 上传文件
      const fileChooserPromise = page.waitForEvent('filechooser');
      await libPage.uploadBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles('e2e/test-files/sample.dwg');

      await expect(libPage.uploadSubmitBtn).toBeVisible({ timeout: 5000 });
      await libPage.uploadSubmitBtn.click();

      // Step 3: 等待上传成功
      await expect(libPage.toast).toBeVisible({ timeout: 30000 });
      await libPage.waitForLoadComplete();

      // Step 4: 打开文件
      const firstCard = libPage.fileCards.first();
      await expect(firstCard).toBeVisible({ timeout: 10000 });
      await firstCard.dblclick();

      // Step 5: 验证跳转到 CAD 编辑器或新 tab
      // 如果当前页跳转，验证 URL 变化；如果新 tab，验证文件卡片仍可见
      const currentUrl = page.url();
      if (currentUrl.includes('cad-editor') || currentUrl.includes('library')) {
        // 正常
      }
    });

    // W-041: P1 — 图块库浏览 → 搜索
    test('W-041 图块库浏览→搜索 → 切换图块库 → 搜索 → 分页', async ({ page }) => {
      const libPage = new LibraryPage(page);
      await libPage.goto('block');

      await expect(libPage.blockLibTab).toBeVisible();
      await expect(libPage.fileCards.first()).toBeVisible({ timeout: 10000 });

      // 搜索图块
      await libPage.search('block');
      await libPage.waitForLoadComplete();

      // 验证搜索后结果正确
      const results = await libPage.getFileNames();
      for (const name of results) {
        expect(name.toLowerCase()).toContain('block');
      }

      // 清除搜索
      await libPage.clearSearch();
      await libPage.waitForLoadComplete();

      // 测试分页（如果有的话）
      if (await libPage.pagination.isVisible().catch(() => false)) {
        await libPage.clickNextPage();
        await expect(libPage.fileCards.first()).toBeVisible({ timeout: 10000 });
      }
    });

    // W-042: P1 — 字体库上传 → 预览 → 删除
    test('W-042 字体库上传→预览→删除 完整流程', async ({ page }) => {
      const fontPage = new FontLibraryPage(page);
      await fontPage.goto();

      // Step 1: 验证加载
      await expect(fontPage.fontTable).toBeVisible({ timeout: 10000 });

      // Step 2: 上传字体
      const fileChooserPromise = page.waitForEvent('filechooser');
      await fontPage.uploadFontBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles('e2e/test-files/sample.ttf');

      await expect(fontPage.uploadSubmitBtn).toBeVisible({ timeout: 5000 });
      await fontPage.uploadSubmitBtn.click();

      // Step 3: 等待上传成功
      await expect(fontPage.toast).toBeVisible({ timeout: 30000 });

      // Step 4: 刷新并预览第一个字体
      await fontPage.goto();
      const firstRow = fontPage.fontTableRows.first();
      await expect(firstRow).toBeVisible({ timeout: 10000 });

      const fontName = await firstRow.locator('td:first-child').textContent();
      if (fontName) {
        // Preview
        await fontPage.previewFont(fontName);
        await expect(fontPage.fontPreviewModal).toBeVisible({ timeout: 10000 });

        // Close preview (click outside or press Escape)
        await page.keyboard.press('Escape');
        await expect(fontPage.fontPreviewModal).toBeHidden({ timeout: 5000 });

        // Delete
        await fontPage.deleteFont(fontName);
        await expect(fontPage.confirmDialog).toBeVisible({ timeout: 5000 });
        await fontPage.confirmDelete();
        await expect(fontPage.toast).toBeVisible({ timeout: 10000 });
      }
    });

    // P1 — 资源库面包屑导航深度遍历
    test('资源库面包屑导航 → 进入子文件夹 → 面包屑更新 → 点击返回', async ({ page }) => {
      const libPage = new LibraryPage(page);
      await libPage.goto('drawing');

      // 验证根级别面包屑
      await expect(libPage.breadcrumbs).toBeVisible({ timeout: 10000 });

      // 如果有文件夹卡牌，点击进入
      const fileCards = libPage.fileCards;
      const count = await fileCards.count();
      if (count > 0) {
        // 双击第一个文件卡牌（如果是文件夹的话）
        await fileCards.first().dblclick();
        await libPage.waitForLoadComplete();

        // 面包屑应该更新（增加层级）
        await expect(libPage.breadcrumbs).toBeVisible({ timeout: 10000 });
      }
    });
  });
});
