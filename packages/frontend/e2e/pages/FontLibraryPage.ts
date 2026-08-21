import type { Page, Locator } from '@playwright/test';

/**
 * 资源库域 — FontLibrary Page Object
 *
 * 覆盖：字体库管理页面，包含后端/前端标签页切换、上传、下载、删除、筛选、排序、视图切换
 */
export class FontLibraryPage {
  readonly page: Page;

  // --- 页面头部 ---
  readonly pageTitle: Locator;
  readonly uploadFontBtn: Locator;
  readonly statsCards: Locator;

  // --- 标签页切换 ---
  readonly backendTab: Locator;
  readonly frontendTab: Locator;

  // --- 统计卡片 ---
  readonly fontCountStat: Locator;
  readonly totalSizeStat: Locator;
  readonly typeCountStat: Locator;

  // --- 搜索和筛选 ---
  readonly searchInput: Locator;
  readonly formatFilter: Locator;
  readonly filterToggleBtn: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly clearFilterBtn: Locator;

  // --- 视图切换 ---
  readonly gridViewBtn: Locator;
  readonly listViewBtn: Locator;

  // --- 排序 ---
  readonly sortByTimeBtn: Locator;
  readonly sortByNameBtn: Locator;
  readonly sortBySizeBtn: Locator;

  // --- 字体列表 ---
  readonly fontCards: Locator;
  readonly fontTableRows: Locator;
  readonly fontTableNameColumn: Locator;
  readonly fontCheckboxes: Locator;
  readonly selectAllCheckbox: Locator;

  // --- 字体预览 ---
  readonly fontPreviewModal: Locator;

  // --- 文件操作按钮（悬浮单个） ---
  readonly downloadBtns: Locator;
  readonly deleteBtns: Locator;

  // --- 批量操作栏 ---
  readonly batchActionsBar: Locator;
  readonly batchDeleteBtn: Locator;
  readonly batchCancelSelectionBtn: Locator;

  // --- 上传模态框 ---
  readonly uploadModal: Locator;
  readonly uploadFileInput: Locator;
  readonly uploadDropZone: Locator;
  readonly uploadTargetBothBtn: Locator;
  readonly uploadTargetBackendBtn: Locator;
  readonly uploadTargetFrontendBtn: Locator;
  readonly uploadSubmitBtn: Locator;
  readonly uploadCancelBtn: Locator;
  readonly uploadRemoveFileBtn: Locator;

  // --- 确认对话框 ---
  readonly confirmDialog: Locator;
  readonly confirmDeleteBtn: Locator;

  // --- 状态 ---
  readonly loadingSkeleton: Locator;
  readonly emptyState: Locator;
  readonly noPermissionPage: Locator;

  // --- Toast ---
  readonly toast: Locator;

  // --- 统计信息 ---
  readonly footerStats: Locator;

  constructor(page: Page) {
    this.page = page;

    // 页面头部
    this.pageTitle = page.getByRole('heading', { name: '字体库管理' });
    this.uploadFontBtn = page.getByRole('button', { name: '上传字体' });
    this.statsCards = page.locator('.card-theme');

    // 标签页
    this.backendTab = page.getByRole('button', { name: /后端字体/ });
    this.frontendTab = page.getByRole('button', { name: /前端字体/ });

    // 统计卡片
    this.fontCountStat = page.getByText('字体总数');
    this.totalSizeStat = page.getByText('总存储');
    this.typeCountStat = page.getByText('格式种类');

    // 搜索和筛选
    this.searchInput = page.getByPlaceholder('搜索字体名称...');
    this.formatFilter = page.locator('select');
    this.filterToggleBtn = page.getByRole('button', { name: '筛选' });
    this.startDateInput = page.getByLabel('开始日期');
    this.endDateInput = page.getByLabel('结束日期');
    this.clearFilterBtn = page.getByRole('button', { name: '清除' });

    // 视图切换
    this.gridViewBtn = page.getByTitle('网格视图');
    this.listViewBtn = page.getByTitle('列表视图');

    // 排序
    this.sortByTimeBtn = page.getByRole('button', { name: '修改时间' });
    this.sortByNameBtn = page.getByRole('button', { name: '名称' });
    this.sortBySizeBtn = page.getByRole('button', { name: '大小' });

    // 字体列表
    this.fontCards = page.locator('[data-testid="font-card"]');
    this.fontTableRows = page.locator('table tbody tr');
    this.fontTableNameColumn = page.locator('table tbody tr td:first-child');
    this.fontCheckboxes = page.locator('input[type="checkbox"]');
    this.selectAllCheckbox = page.locator('table thead input[type="checkbox"]');

    // 字体预览
    this.fontPreviewModal = page.locator('[data-testid="font-preview"]');

    // 文件操作按钮
    this.downloadBtns = page.getByTitle('下载');
    this.deleteBtns = page.getByTitle('删除');

    // 批量操作栏
    this.batchActionsBar = page.getByText(/已选择 \d+ 个字体/);
    this.batchDeleteBtn = page.getByRole('button', { name: '批量删除' });
    this.batchCancelSelectionBtn = page.getByRole('button', { name: '取消选择' });

    // 上传模态框
    this.uploadModal = page.getByRole('dialog');
    this.uploadFileInput = page.locator('input[type="file"]').first();
    this.uploadDropZone = page.getByText(/点击或拖拽文件/);
    this.uploadTargetBothBtn = page.getByRole('button', { name: /同时上传/ });
    this.uploadTargetBackendBtn = page.getByRole('button', { name: /仅后端/ });
    this.uploadTargetFrontendBtn = page.getByRole('button', { name: /仅前端/ });
    this.uploadSubmitBtn = page.locator('[role="dialog"]').getByRole('button', { name: '上传' });
    this.uploadCancelBtn = page.locator('[role="dialog"]').getByRole('button', { name: '取消' });
    this.uploadRemoveFileBtn = page.getByText('移除文件');

    // 确认对话框
    this.confirmDialog = page.locator('[role="dialog"]').getByText(/确认要删除/);
    this.confirmDeleteBtn = page.getByRole('button', { name: /确认删除|确定/ });

    // 状态
    this.loadingSkeleton = page.locator('.skeleton-theme');
    this.emptyState = page.getByText(/暂无字体|没有找到|暂无数据/);
    this.noPermissionPage = page.getByText(/无访问权限/);

    // Toast
    this.toast = page.locator('.toast, [role="status"]');

    // 统计信息
    this.footerStats = page.getByText(/共 \d+ 个字体文件/);
  }

  /** 导航到字体库页面 */
  async goto() {
    await this.page.goto('/font-library');
    await this.waitForLoad();
  }

  /** 等待页面加载完成 */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /** 切换到后端标签 */
  async switchToBackend() {
    await this.backendTab.click();
    await this.waitForLoad();
  }

  /** 切换到前端标签 */
  async switchToFrontend() {
    await this.frontendTab.click();
    await this.waitForLoad();
  }

  /** 搜索字体 */
  async search(keyword: string) {
    await this.searchInput.fill(keyword);
  }

  /** 按格式筛选 */
  async filterByFormat(format: string) {
    await this.formatFilter.selectOption(format);
  }

  /** 展开筛选面板 */
  async toggleFilters() {
    await this.filterToggleBtn.click();
  }

  /** 切换到网格视图 */
  async switchToGridView() {
    await this.gridViewBtn.click();
  }

  /** 切换到列表视图 */
  async switchToListView() {
    await this.listViewBtn.click();
  }

  /** 打开上传模态框 */
  async openUploadModal() {
    await this.uploadFontBtn.click();
  }

  /** 上传字体文件 */
  async uploadFontFile(filePath: string) {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.uploadDropZone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }

  /** 按字段排序 */
  async sortBy(field: 'time' | 'name' | 'size') {
    if (field === 'time') await this.sortByTimeBtn.click();
    else if (field === 'name') await this.sortByNameBtn.click();
    else await this.sortBySizeBtn.click();
  }

  /** 勾选第 N 个字体（网格视图） */
  async selectFontAt(index: number) {
    await this.fontCards.nth(index).locator('input[type="checkbox"]').click();
  }

  /** 删除第 N 个字体 */
  async deleteFontAt(index: number) {
    await this.fontCards.nth(index).hover();
    await this.deleteBtns.nth(index).click();
  }

  /** 下载第 N 个字体 */
  async downloadFontAt(index: number) {
    await this.fontCards.nth(index).hover();
    await this.downloadBtns.nth(index).click();
  }

  /** 等待 Toast 消息 */
  async waitForToast(text?: string) {
    if (text) {
      await this.page.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 });
    } else {
      await this.toast.first().waitFor({ state: 'visible', timeout: 10000 });
    }
  }

  /** 获取字体数量 */
  async getFontCount(): Promise<number> {
    return this.fontTableRows.count();
  }

  /** 获取所有字体名称 */
  async getFontNames(): Promise<string[]> {
    return this.fontTableNameColumn.allTextContents();
  }

  /** 按名称下载字体 */
  async downloadFont(name: string) {
    await this.fontRow(name).locator('[title="下载"]').click();
  }

  /** 按名称删除字体 */
  async deleteFont(name: string) {
    await this.fontRow(name).locator('[title="删除"]').click();
  }

  /** 点击字体名称预览 */
  async previewFont(name: string) {
    await this.fontRow(name).locator('td:first-child').click();
  }

  /** 确认删除对话框 */
  async confirmDelete() {
    await this.confirmDeleteBtn.click();
  }

  // ── 内部辅助 ──

  private fontRow(name: string): Locator {
    return this.fontTableRows.filter({ hasText: name });
  }
}
