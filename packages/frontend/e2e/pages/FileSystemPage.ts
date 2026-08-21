import type { Page, Locator } from '@playwright/test';

/**
 * 图纸组织域 — FileSystemManager Page Object
 *
 * 覆盖：项目文件管理 / 私人空间 / 回收站 / 项目设置 / 版本历史 / 配额
 */
export class FileSystemPage {
  readonly page: Page;

  // --- 头部导航 ---
  readonly header: Locator;
  readonly searchInput: Locator;
  readonly gridViewBtn: Locator;
  readonly listViewBtn: Locator;
  readonly multiSelectBtn: Locator;
  readonly selectAllCheckbox: Locator;
  readonly newFolderBtn: Locator;
  readonly createProjectBtn: Locator;
  readonly uploadBtn: Locator;
  readonly refreshBtn: Locator;
  readonly trashViewBtn: Locator;
  readonly breadcrumbs: Locator;

  // --- 内容区域 ---
  readonly fileListContainer: Locator;
  readonly fileItems: Locator;
  readonly emptyState: Locator;
  readonly loadingSpinner: Locator;
  readonly errorMessage: Locator;

  // --- 文件操作（右键菜单 / 工具栏） ---
  readonly contextMenu: Locator;
  readonly renameMenuItem: Locator;
  readonly deleteMenuItem: Locator;
  readonly moveMenuItem: Locator;
  readonly copyMenuItem: Locator;
  readonly downloadMenuItem: Locator;
  readonly versionHistoryMenuItem: Locator;
  readonly openMenuItem: Locator;

  // --- 批量操作栏 ---
  readonly batchActionsBar: Locator;
  readonly batchMoveBtn: Locator;
  readonly batchCopyBtn: Locator;
  readonly batchDeleteBtn: Locator;
  readonly batchClearBtn: Locator;
  readonly batchRestoreBtn: Locator;
  readonly batchPermanentDeleteBtn: Locator;

  // --- 项目设置 ---
  readonly projectSettingsBtn: Locator;

  // --- 模态框 ---
  readonly modal: Locator;
  readonly modalTitle: Locator;
  readonly modalConfirmBtn: Locator;
  readonly modalCancelBtn: Locator;
  readonly modalInput: Locator;

  // --- 配额 ---
  readonly quotaBar: Locator;
  readonly quotaText: Locator;

  // --- Toast ---
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // 头部
    this.header = page.locator('.max-w-7xl.mx-auto.space-y-6');
    this.searchInput = page.getByPlaceholder(/搜索/);
    this.gridViewBtn = page.getByTitle('网格视图');
    this.listViewBtn = page.getByTitle('列表视图');
    this.multiSelectBtn = page.getByTitle('多选模式');
    this.selectAllCheckbox = page.locator('input[type="checkbox"]').first();
    this.newFolderBtn = page.getByRole('button', { name: /新建文件夹/ });
    this.createProjectBtn = page.getByRole('button', { name: /创建项目/ });
    this.uploadBtn = page.getByRole('button', { name: /上传/ });
    this.refreshBtn = page.getByTitle('刷新');
    this.trashViewBtn = page.getByText(/回收站/);
    this.breadcrumbs = page.locator('[data-testid="breadcrumb"]');

    // 内容
    this.fileListContainer = page.locator('.rounded-2xl');
    this.fileItems = page.locator('[data-testid="file-item"]');
    this.emptyState = page.getByText(/暂无|没有文件|文件夹是空的/);
    this.loadingSpinner = page.locator('.animate-spin');
    this.errorMessage = page.locator('[role="alert"]');

    // 文件操作
    this.contextMenu = page.locator('[role="menu"]');
    this.renameMenuItem = page.getByRole('menuitem', { name: /重命名/ });
    this.deleteMenuItem = page.getByRole('menuitem', { name: /删除/ });
    this.moveMenuItem = page.getByRole('menuitem', { name: /移动/ });
    this.copyMenuItem = page.getByRole('menuitem', { name: /复制/ });
    this.downloadMenuItem = page.getByRole('menuitem', { name: /下载/ });
    this.versionHistoryMenuItem = page.getByRole('menuitem', { name: /版本历史/ });
    this.openMenuItem = page.getByRole('menuitem', { name: /打开/ });

    // 批量操作栏
    this.batchActionsBar = page.getByText(/已选中 \d+ 项/);
    this.batchMoveBtn = page.getByRole('button', { name: '移动' });
    this.batchCopyBtn = page.getByRole('button', { name: '复制' });
    this.batchDeleteBtn = page.getByRole('button', { name: '删除' });
    this.batchClearBtn = page.getByRole('button', { name: '取消' });
    this.batchRestoreBtn = page.getByRole('button', { name: '恢复' });
    this.batchPermanentDeleteBtn = page.getByRole('button', { name: '彻底删除' });

    // 项目设置
    this.projectSettingsBtn = page.getByRole('button', { name: /项目设置/ });

    // 模态框
    this.modal = page.locator('[role="dialog"]');
    this.modalTitle = page.locator('[role="dialog"] h2');
    this.modalConfirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /确认|确定|创建/ });
    this.modalCancelBtn = page.locator('[role="dialog"]').getByRole('button', { name: /取消/ });
    this.modalInput = page.locator('[role="dialog"] input').first();

    // 配额
    this.quotaBar = page.locator('[role="progressbar"]');
    this.quotaText = page.getByText(/已使用|配额/);

    // Toast
    this.toast = page.locator('.toast, [role="status"]');
  }

  /** 导航到项目文件管理页 */
  async gotoProjectFiles(projectId: string) {
    await this.page.goto(`/projects/${projectId}/files`);
    await this.waitForLoad();
  }

  /** 导航到私人空间 */
  async gotoPersonalSpace() {
    await this.page.goto('/personal-space');
    await this.waitForLoad();
  }

  /** 导航到仪表盘 */
  async gotoDashboard() {
    await this.page.goto('/dashboard');
    await this.waitForLoad();
  }

  /** 等待页面加载完成 */
  async waitForLoad() {
    // 等待 loading 消失或文件列表出现
    await this.page.waitForLoadState('networkidle');
  }

  /** 搜索文件 */
  async search(keyword: string) {
    await this.searchInput.fill(keyword);
    await this.page.keyboard.press('Enter');
  }

  /** 切换到网格视图 */
  async switchToGridView() {
    await this.gridViewBtn.click();
  }

  /** 切换到列表视图 */
  async switchToListView() {
    await this.listViewBtn.click();
  }

  /** 进入多选模式 */
  async enterMultiSelectMode() {
    await this.multiSelectBtn.click();
  }

  /** 勾选第 N 个文件 */
  async selectFileAt(index: number) {
    await this.fileItems.nth(index).locator('input[type="checkbox"]').click();
  }

  /** 右键点击第 N 个文件 */
  async rightClickFileAt(index: number) {
    await this.fileItems.nth(index).click({ button: 'right' });
  }

  /** 点击"新建文件夹"按钮 */
  async clickNewFolder() {
    await this.newFolderBtn.click();
  }

  /** 在模态框中输入名称并确认 */
  async fillModalInputAndConfirm(name: string) {
    await this.modalInput.fill(name);
    await this.modalConfirmBtn.click();
  }

  /** 关闭模态框 */
  async closeModal() {
    await this.modalCancelBtn.click();
  }

  /** 等待 Toast 消息出现 */
  async waitForToast(text?: string) {
    if (text) {
      await this.page.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 });
    } else {
      await this.toast.first().waitFor({ state: 'visible', timeout: 10000 });
    }
  }

  /** 进入回收站视图 */
  async gotoTrashView() {
    await this.trashViewBtn.first().click();
  }

  /** 拖拽文件到目标 */
  async dragFileToFolder(fileIndex: number, folderIndex: number) {
    const source = this.fileItems.nth(fileIndex);
    const target = this.fileItems.nth(folderIndex);
    await source.dragTo(target);
  }
}
