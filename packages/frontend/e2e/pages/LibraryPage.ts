import type { Page, Locator } from '@playwright/test';

/**
 * 资源库域 — LibraryManager Page Object
 *
 * 覆盖：
 *   LibraryManager (/library/:libraryType) — 图纸库 / 图块库 的浏览、上传、搜索、
 *     右键菜单、分页、滚动加载、面包屑导航
 *   FontLibrary (/font-library) — 字体库的表格、上传、下载、删除、预览
 */

// ─── LibraryManager (图纸库 / 图块库) ────────────────────────────────────────

type LibraryType = 'drawing' | 'block';

export class LibraryPage {
  readonly page: Page;

  // ── 库类型切换 ──
  readonly drawingLibTab: Locator;
  readonly blockLibTab: Locator;

  // ── 工具栏 ──
  readonly uploadBtn: Locator;
  readonly newFolderBtn: Locator;
  readonly deleteSelectedBtn: Locator;

  // ── 搜索 ──
  readonly searchInput: Locator;
  readonly searchClearBtn: Locator;

  // ── 面包屑 ──
  readonly breadcrumbs: Locator;

  // ── 文件网格 ──
  readonly fileCards: Locator;
  readonly fileCardNames: Locator;

  // ── 右键菜单 ──
  readonly contextMenu: Locator;
  readonly contextMenuOpen: Locator;
  readonly contextMenuMove: Locator;
  readonly contextMenuCopy: Locator;
  readonly contextMenuDownload: Locator;
  readonly contextMenuDelete: Locator;

  // ── 分页控件 ──
  readonly pagination: Locator;
  readonly firstPageBtn: Locator;
  readonly prevPageBtn: Locator;
  readonly pageJumpInput: Locator;
  readonly nextPageBtn: Locator;
  readonly lastPageBtn: Locator;

  // ── 滚动加载 ──
  readonly scrollContainer: Locator;

  // ── 状态 ──
  readonly loadingSkeleton: Locator;
  readonly emptyState: Locator;

  // ── 上传模态框 ──
  readonly uploadModal: Locator;
  readonly uploadFileSelector: Locator;
  readonly uploadProgressBar: Locator;
  readonly uploadSubmitBtn: Locator;
  readonly uploadCancelBtn: Locator;

  // ── 新建文件夹模态框 ──
  readonly folderNameInput: Locator;
  readonly folderConfirmBtn: Locator;
  readonly folderCancelBtn: Locator;

  // ── 确认对话框 ──
  readonly confirmDialog: Locator;
  readonly confirmDeleteBtn: Locator;

  // ── Toast ──
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // 库类型切换
    this.drawingLibTab = page.getByRole('button', { name: /图纸库/ });
    this.blockLibTab = page.getByRole('button', { name: /图块库/ });

    // 工具栏
    this.uploadBtn = page.getByRole('button', { name: /上传/ });
    this.newFolderBtn = page.getByRole('button', { name: /新建文件夹/ });
    this.deleteSelectedBtn = page.getByRole('button', { name: /删除/ });

    // 搜索
    this.searchInput = page.getByPlaceholder(/搜索/);
    this.searchClearBtn = page.getByRole('button', { name: /清除/ });

    // 面包屑
    this.breadcrumbs = page.locator('[data-testid="breadcrumb"]');

    // 文件网格
    this.fileCards = page.locator('[data-testid="file-item"]');
    this.fileCardNames = page.locator('[data-testid="file-item"] [data-testid="file-name"]');

    // 右键菜单
    this.contextMenu = page.locator('[role="menu"]');
    this.contextMenuOpen = page.getByRole('menuitem', { name: /打开/ });
    this.contextMenuMove = page.getByRole('menuitem', { name: /移动/ });
    this.contextMenuCopy = page.getByRole('menuitem', { name: /复制/ });
    this.contextMenuDownload = page.getByRole('menuitem', { name: /下载/ });
    this.contextMenuDelete = page.getByRole('menuitem', { name: /删除/ });

    // 分页控件
    this.pagination = page.locator('[data-testid="pagination"]');
    this.firstPageBtn = page.getByRole('button', { name: /首页/ });
    this.prevPageBtn = page.getByRole('button', { name: /上一页/ });
    this.pageJumpInput = page.locator('[data-testid="page-jump-input"]');
    this.nextPageBtn = page.getByRole('button', { name: /下一页/ });
    this.lastPageBtn = page.getByRole('button', { name: /末页/ });

    // 滚动加载（列表容器，包含 500px 阈值触发加载更多）
    this.scrollContainer = page.locator('[data-testid="file-list-container"]');

    // 状态
    this.loadingSkeleton = page.locator('.skeleton-theme, [data-testid="skeleton-card"]');
    this.emptyState = page.getByText(/资源库暂无文件|文件夹是空的|暂无文件/);

    // 上传模态框
    this.uploadModal = page.getByRole('dialog');
    this.uploadFileSelector = page.getByRole('dialog').locator('input[type="file"]').first();
    this.uploadProgressBar = page.getByRole('progressbar');
    this.uploadSubmitBtn = page.getByRole('dialog').getByRole('button', { name: /上传/ });
    this.uploadCancelBtn = page.getByRole('dialog').getByRole('button', { name: /取消/ });

    // 新建文件夹模态框
    this.folderNameInput = page.getByRole('dialog').getByLabel(/文件夹名称/);
    this.folderConfirmBtn = page.getByRole('dialog').getByRole('button', { name: /确认|创建/ });
    this.folderCancelBtn = page.getByRole('dialog').getByRole('button', { name: /取消/ });

    // 确认对话框
    this.confirmDialog = page.getByRole('dialog').getByText(/确认要删除|确认删除/);
    this.confirmDeleteBtn = page.getByRole('button', { name: /确认删除|确定/ });

    // Toast
    this.toast = page.locator('.toast, [role="status"]');
  }

  // ── 导航 ──

  /** 导航到资源库 (/library/:libraryType) */
  async goto(libraryType: LibraryType = 'drawing') {
    await this.page.goto(`/library/${libraryType}`);
    await this.waitForLoadComplete();
  }

  /** 导航到指定文件夹 */
  async gotoSpecificFolder(folderId: string) {
    await this.page.goto(`/library/drawing?folderId=${folderId}`);
    await this.waitForLoadComplete();
  }

  /** 导航到字体库 */
  async gotoFontLibrary() {
    await this.page.goto('/font-library');
    await this.waitForLoadComplete();
  }

  // ── 库类型切换 ──

  async switchToDrawingLibrary() {
    await this.drawingLibTab.click();
    await this.waitForLoadComplete();
  }

  async switchToBlockLibrary() {
    await this.blockLibTab.click();
    await this.waitForLoadComplete();
  }

  async isDrawingLibrarySelected(): Promise<boolean> {
    const tab = this.drawingLibTab;
    const className = await tab.getAttribute('class');
    return className?.includes('active') || false;
  }

  async isBlockLibrarySelected(): Promise<boolean> {
    const tab = this.blockLibTab;
    const className = await tab.getAttribute('class');
    return className?.includes('active') || false;
  }

  // ── 搜索 ──

  /** 输入搜索关键词（实时过滤） */
  async search(query: string) {
    await this.searchInput.fill(query);
    // 实时搜索会有请求延迟，等待 debounce
    await this.page.waitForTimeout(300);
  }

  /** 清除搜索 */
  async clearSearch() {
    await this.searchClearBtn.click();
    await this.waitForLoadComplete();
  }

  // ── 文件操作 ──

  /** 上传文件 */
  async uploadFile(filePath: string) {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
    await this.uploadSubmitBtn.click();
  }

  /** 创建新文件夹 */
  async createFolder(name: string) {
    await this.newFolderBtn.click();
    await this.folderNameInput.fill(name);
    await this.folderConfirmBtn.click();
  }

  /** 通过右键菜单打开文件（按文件名匹配） */
  async openFile(name: string) {
    await this.fileWithName(name).click({ button: 'right' });
    await this.contextMenuOpen.click();
  }

  /** 通过右键菜单下载文件（按文件名匹配） */
  async downloadFile(name: string) {
    await this.fileWithName(name).click({ button: 'right' });
    await this.contextMenuDownload.click();
  }

  /** 通过右键菜单删除文件（按文件名匹配） */
  async deleteFile(name: string) {
    await this.fileWithName(name).click({ button: 'right' });
    await this.contextMenuDelete.click();
  }

  /** 在确认对话框确认删除 */
  async confirmDelete() {
    await this.confirmDeleteBtn.click();
  }

  // ── 分页 ──

  async clickFirstPage() {
    await this.firstPageBtn.click();
    await this.waitForLoadComplete();
  }

  async clickPrevPage() {
    await this.prevPageBtn.click();
    await this.waitForLoadComplete();
  }

  async clickNextPage() {
    await this.nextPageBtn.click();
    await this.waitForLoadComplete();
  }

  async clickLastPage() {
    await this.lastPageBtn.click();
    await this.waitForLoadComplete();
  }

  /** 跳转到指定页码 */
  async jumpToPage(pageNumber: number) {
    await this.pageJumpInput.fill(String(pageNumber));
    await this.pageJumpInput.press('Enter');
    await this.waitForLoadComplete();
  }

  // ── 滚动加载更多 ──

  /** 滚动到底部以触发加载更多（500px 阈值） */
  async scrollLoadMore() {
    await this.scrollContainer.evaluate((el) => {
      el.scrollTo(0, el.scrollHeight);
    });
    // 等待加载更多请求完成
    await this.page.waitForTimeout(500);
  }

  // ── 查询方法 ──

  /** 获取当前可见文件数量 */
  async getFileCount(): Promise<number> {
    return this.fileCards.count();
  }

  /** 获取当前可见文件名列表 */
  async getFileNames(): Promise<string[]> {
    return this.fileCardNames.allTextContents();
  }

  /** 等待加载完成（骨架屏消失） */
  async waitForLoadComplete() {
    await this.page.waitForLoadState('networkidle');
    // 额外等待骨架屏消失
    await this.loadingSkeleton.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  /** 获取空状态提示文本 */
  async getEmptyState(): Promise<string | null> {
    if (await this.emptyState.isVisible()) {
      return this.emptyState.textContent();
    }
    return null;
  }

  // ── 内部辅助 ──

  /** 按文件名定位到对应的文件卡片 */
  private fileWithName(name: string): Locator {
    return this.fileCards.filter({ hasText: name });
  }
}


// ─── FontLibrary (字体库) ──────────────────────────────────────────────────

export class FontLibraryPage {
  readonly page: Page;

  // ── 按钮 ──
  readonly uploadFontBtn: Locator;

  // ── 字体表格 ──
  readonly fontTable: Locator;
  readonly fontTableRows: Locator;
  readonly fontTableNameColumn: Locator;

  // ── 每行操作按钮 ──
  readonly downloadBtns: Locator;
  readonly deleteBtns: Locator;

  // ── 上传模态框 ──
  readonly uploadModal: Locator;
  readonly uploadFileInput: Locator;
  readonly uploadProgressBar: Locator;
  readonly uploadSubmitBtn: Locator;
  readonly uploadCancelBtn: Locator;

  // ── 删除确认对话框 ──
  readonly confirmDialog: Locator;
  readonly confirmDeleteBtn: Locator;

  // ── 字体预览 ──
  readonly fontPreviewModal: Locator;

  // ── 状态 ──
  readonly emptyState: Locator;

  // ── Toast ──
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // 按钮
    this.uploadFontBtn = page.getByRole('button', { name: /上传字体/ });

    // 字体表格
    this.fontTable = page.locator('table');
    this.fontTableRows = page.locator('table tbody tr');
    this.fontTableNameColumn = page.locator('table tbody tr td:first-child');

    // 每行操作
    this.downloadBtns = page.getByTitle(/下载/);
    this.deleteBtns = page.getByTitle(/删除/);

    // 上传模态框
    this.uploadModal = page.getByRole('dialog');
    this.uploadFileInput = page.getByRole('dialog').locator('input[type="file"]').first();
    this.uploadProgressBar = page.getByRole('progressbar');
    this.uploadSubmitBtn = page.getByRole('dialog').getByRole('button', { name: /上传/ });
    this.uploadCancelBtn = page.getByRole('dialog').getByRole('button', { name: /取消/ });

    // 删除确认
    this.confirmDialog = page.getByRole('dialog').getByText(/确认要删除|确认删除/);
    this.confirmDeleteBtn = page.getByRole('button', { name: /确认删除|确定/ });

    // 字体预览
    this.fontPreviewModal = page.locator('[data-testid="font-preview"]');

    // 状态
    this.emptyState = page.getByText(/暂无字体|没有找到/);

    // Toast
    this.toast = page.locator('.toast, [role="status"]');
  }

  /** 导航到字体库 */
  async goto() {
    await this.page.goto('/font-library');
    await this.page.waitForLoadState('networkidle');
  }

  /** 上传字体文件 */
  async uploadFont(filePath: string) {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.uploadFontBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
    await this.uploadSubmitBtn.click();
  }

  /** 按名称下载字体（期望行中已有该名称的链接/按钮） */
  async downloadFont(name: string) {
    await this.fontRow(name).getByTitle(/下载/).click();
  }

  /** 按名称删除字体 */
  async deleteFont(name: string) {
    await this.fontRow(name).getByTitle(/删除/).click();
  }

  /** 确认删除对话框 */
  async confirmDelete() {
    await this.confirmDeleteBtn.click();
  }

  /** 点击字体名称预览 */
  async previewFont(name: string) {
    await this.fontRow(name).locator('td:first-child').click();
  }

  /** 获取字体数量 */
  async getFontCount(): Promise<number> {
    return this.fontTableRows.count();
  }

  /** 获取所有字体名称 */
  async getFontNames(): Promise<string[]> {
    return this.fontTableNameColumn.allTextContents();
  }

  // ── 内部辅助 ──

  private fontRow(name: string): Locator {
    return this.fontTableRows.filter({ hasText: name });
  }
}
