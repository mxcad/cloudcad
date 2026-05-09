import type { Page, Locator } from '@playwright/test';

/**
 * 资源库域 — LibraryManager Page Object
 *
 * 覆盖：图纸库 / 图块库 的浏览、上传、下载、删除、移动/复制、分页
 */
export class LibraryPage {
  readonly page: Page;

  // --- 顶部导航 ---
  readonly headerTitle: Locator;
  readonly drawingLibTab: Locator;
  readonly blockLibTab: Locator;
  readonly storageQuotaBtn: Locator;
  readonly newFolderBtn: Locator;
  readonly batchImportBtn: Locator;
  readonly uploadBtn: Locator;

  // --- 面包屑和工具栏 ---
  readonly breadcrumbs: Locator;
  readonly searchInput: Locator;
  readonly searchSubmitBtn: Locator;
  readonly gridViewBtn: Locator;
  readonly listViewBtn: Locator;
  readonly refreshBtn: Locator;
  readonly multiSelectToggleBtn: Locator;
  readonly selectAllBtn: Locator;

  // --- 文件列表 ---
  readonly fileItems: Locator;
  readonly emptyState: Locator;
  readonly loadingSpinner: Locator;
  readonly errorBanner: Locator;

  // --- 分页 ---
  readonly pagination: Locator;
  readonly pageSizeChanger: Locator;

  // --- 批量操作栏 ---
  readonly batchActionsBar: Locator;
  readonly batchMoveBtn: Locator;
  readonly batchCopyBtn: Locator;
  readonly batchDeleteBtn: Locator;
  readonly batchCancelBtn: Locator;

  // --- 模态框 ---
  readonly modal: Locator;
  readonly modalTitle: Locator;
  readonly modalInput: Locator;
  readonly modalConfirmBtn: Locator;
  readonly modalCancelBtn: Locator;

  // --- 确认对话框 ---
  readonly confirmDialog: Locator;

  // --- 配额模态框 ---
  readonly quotaInput: Locator;
  readonly quotaSaveBtn: Locator;

  // --- Toast ---
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // 顶部导航
    this.headerTitle = page.getByRole('heading', { name: /公共资源库/ });
    this.drawingLibTab = page.getByRole('button', { name: '图纸库' });
    this.blockLibTab = page.getByRole('button', { name: '图块库' });
    this.storageQuotaBtn = page.getByRole('button', { name: /存储配额/ });
    this.newFolderBtn = page.getByRole('button', { name: /新建文件夹/ });
    this.batchImportBtn = page.getByRole('button', { name: /批量导入/ });
    this.uploadBtn = page.getByRole('button', { name: /上传文件/ });

    // 面包屑和工具栏
    this.breadcrumbs = page.locator('[data-testid="breadcrumb"]');
    this.searchInput = page.getByPlaceholder(/搜索文件/);
    this.searchSubmitBtn = page.getByTitle('搜索');
    this.gridViewBtn = page.getByTitle('网格视图');
    this.listViewBtn = page.getByTitle('列表视图');
    this.refreshBtn = page.getByTitle('刷新');
    this.multiSelectToggleBtn = page.getByTitle('多选模式');
    this.selectAllBtn = page.getByTitle(/全选|取消全选/);

    // 文件列表
    this.fileItems = page.locator('[data-testid="file-item"]');
    this.emptyState = page.getByText(/暂无内容|文件夹是空的|资源库暂无/);
    this.loadingSpinner = page.locator('.animate-spin');
    this.errorBanner = page.locator('[role="alert"]');

    // 分页
    this.pagination = page.locator('[data-testid="pagination"]');
    this.pageSizeChanger = page.locator('[data-testid="page-size-changer"]');

    // 批量操作栏
    this.batchActionsBar = page.getByText(/已选中 \d+ 项/);
    this.batchMoveBtn = page.getByRole('button', { name: '移动' });
    this.batchCopyBtn = page.getByRole('button', { name: '复制' });
    this.batchDeleteBtn = page.getByRole('button', { name: /批量删除/ });
    this.batchCancelBtn = page.getByRole('button', { name: /取消选择/ });

    // 模态框
    this.modal = page.locator('[role="dialog"]');
    this.modalTitle = page.locator('[role="dialog"] h2');
    this.modalInput = page.locator('[role="dialog"] input').first();
    this.modalConfirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /确认|确定|创建/ });
    this.modalCancelBtn = page.locator('[role="dialog"]').getByRole('button', { name: /取消/ });

    // 确认对话框
    this.confirmDialog = page.locator('[role="dialog"]').getByText(/确认|确定要/);

    // 配额模态框
    this.quotaInput = page.locator('[role="dialog"] input[type="number"]');
    this.quotaSaveBtn = page.getByRole('button', { name: /保存/ });

    // Toast
    this.toast = page.locator('.toast, [role="status"]');
  }

  /** 导航到图纸库 */
  async gotoDrawingLibrary() {
    await this.page.goto('/library/drawing');
    await this.waitForLoad();
  }

  /** 导航到图块库 */
  async gotoBlockLibrary() {
    await this.page.goto('/library/block');
    await this.waitForLoad();
  }

  /** 导航到资源库默认页 */
  async goto() {
    await this.page.goto('/library');
    await this.waitForLoad();
  }

  /** 等待页面加载完成 */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /** 切换到图纸库 */
  async switchToDrawingLib() {
    await this.drawingLibTab.click();
    await this.waitForLoad();
  }

  /** 切换到图块库 */
  async switchToBlockLib() {
    await this.blockLibTab.click();
    await this.waitForLoad();
  }

  /** 搜索文件 */
  async search(keyword: string) {
    await this.searchInput.fill(keyword);
    await this.searchSubmitBtn.click();
  }

  /** 点击新建文件夹 */
  async clickNewFolder() {
    await this.newFolderBtn.click();
  }

  /** 在模态框中输入名称并确认 */
  async fillModalInputAndConfirm(name: string) {
    await this.modalInput.fill(name);
    await this.modalConfirmBtn.click();
  }

  /** 等待 Toast 消息 */
  async waitForToast(text?: string) {
    if (text) {
      await this.page.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 });
    } else {
      await this.toast.first().waitFor({ state: 'visible', timeout: 10000 });
    }
  }

  /** 进入多选模式 */
  async enterMultiSelectMode() {
    await this.multiSelectToggleBtn.click();
  }

  /** 勾选第 N 个文件 */
  async selectFileAt(index: number) {
    await this.fileItems.nth(index).locator('input[type="checkbox"]').click();
  }

  /** 右键点击文件 */
  async rightClickFileAt(index: number) {
    await this.fileItems.nth(index).click({ button: 'right' });
  }
}
