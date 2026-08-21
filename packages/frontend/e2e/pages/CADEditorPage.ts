import type { Page, Locator } from '@playwright/test';

/**
 * CADEditorPage — CAD 编辑器页面对象
 *
 * 覆盖 CADEditorDirect.tsx 的 React DOM 外壳（加载状态、错误状态、容器），
 * 以及 mxcad-app Vue 应用的 CAD 工具栏和所有模态框（SaveAs / Export / ExternalRef）。
 *
 * 关键架构事实：
 * - CAD canvas 由 mxcadManager 在 document.body 级创建，不在 React DOM 内
 * - 编辑器容器是一个 `fixed inset-0` 的 div，通过 visibility + z-index 控制显示/隐藏
 * - CAD 工具栏属于 mxcad-app 的 Vue 3 + Vuetify 应用，不在 React 渲染树内，
 *   因此工具栏按钮使用 CSS 选择器作为后备定位策略
 * - 加载状态和错误状态在容器内部由 React 渲染
 * - 所有模态框（SaveAs、Export、ExternalRef）通过 Portal 渲染到 document.body
 */
export class CADEditorPage {
  readonly page: Page;

  // ─── 编辑器容器 ───────────────────────────────────────

  /** CAD 编辑器覆盖层容器（fixed inset-0，由 React 渲染） */
  readonly container: Locator;

  // ─── 加载状态 ─────────────────────────────────────────

  /** 加载 Spinner（animate-spin 圆环） */
  readonly loadingSpinner: Locator;

  /** 加载文本 */
  readonly loadingText: Locator;

  // ─── 错误状态 ─────────────────────────────────────────

  /** 错误信息文本 */
  readonly errorMessage: Locator;

  /** 错误恢复按钮（"刷新页面" 或 "返回项目列表"） */
  readonly retryButton: Locator;

  // ─── CAD 工具栏（mxcad-app Vue 应用，使用 CSS 后备） ──

  /** 保存按钮 */
  readonly saveButton: Locator;

  /** 另存为按钮 */
  readonly saveAsButton: Locator;

  /** 导出按钮 */
  readonly exportButton: Locator;

  /** 撤销按钮 */
  readonly undoButton: Locator;

  /** 重做按钮 */
  readonly redoButton: Locator;

  // ─── 另存为弹窗 ───────────────────────────────────────

  /** 另存为弹窗容器（标题 "另存为"） */
  readonly saveAsModal: Locator;

  /** 另存为弹窗中的搜索输入 */
  readonly saveAsSearchInput: Locator;

  /** 另存为目标类型标签（私人空间/项目/资源库） */
  readonly saveAsTargetTypeTabs: Locator;

  /** 另存为目标文件列表 */
  readonly saveAsTargetList: Locator;

  /** 另存为确认保存按钮 */
  readonly saveAsConfirmButton: Locator;

  /** 另存为取消按钮 */
  readonly saveAsCancelButton: Locator;

  /** 另存为关闭按钮（X） */
  readonly saveAsCloseButton: Locator;

  // ─── 导出弹窗（下载格式选择） ──────────────────────────

  /** 导出弹窗容器（标题 "选择下载格式"） */
  readonly exportModal: Locator;

  /** 导出格式选择 radio */
  readonly exportFormatSelect: Locator;

  /** 导出确认按钮 */
  readonly exportConfirmButton: Locator;

  /** 导出取消按钮 */
  readonly exportCancelButton: Locator;

  // ─── 外部参照弹窗 ─────────────────────────────────────

  /** 外部参照弹窗容器（标题 "管理外部参照文件"） */
  readonly externalRefModal: Locator;

  /** 缺失的外部参照文件列表 */
  readonly missingRefsList: Locator;

  /** 上传替换文件按钮 */
  readonly uploadReplacementButton: Locator;

  /** 外部参照弹窗关闭按钮 */
  readonly externalRefCloseButton: Locator;

  // ─── 未保存变更对话框 ─────────────────────────────────

  /** 未保存变更对话框容器 */
  readonly unsavedDialog: Locator;

  /** 未保存变更确认按钮 */
  readonly unsavedConfirmButton: Locator;

  /** 未保存变更取消按钮 */
  readonly unsavedCancelButton: Locator;

  /** 未保存变更消息文本 */
  readonly unsavedMessageText: Locator;

  // ─── Toast / 通知 ─────────────────────────────────────

  /** Toast 通知 */
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // ─── 编辑器容器 ──
    // CADEditorDirect 渲染一个 fixed inset-0 的 div，通过 visibility 控制显示
    // 内部包含 loading / error / 透明内容区域
    this.container = page.locator('.fixed.inset-0').filter({
      has: page.locator('.animate-spin').or(page.getByText(/正在加载|加载CAD|加载图纸/)),
    }).first();

    // ─── 加载状态 ──
    this.loadingSpinner = page.locator('.animate-spin.rounded-full');
    this.loadingText = page.getByText(/正在加载\s*(CAD\s*编辑器|图纸)\.\.\./);

    // ─── 错误状态 ──
    this.errorMessage = page.getByText(
      /CAD编辑器初始化失败|文件不存在|文件已被删除|文件尚未转换完成|请登录后访问此文件|无法构造文件访问URL|获取文件信息失败/
    );
    this.retryButton = page.getByRole('button', {
      name: /刷新页面|返回项目列表/,
    });

    // ─── CAD 工具栏 ──
    // mxcad-app 的 Vue 应用在 document.body 创建工具栏，不在 React DOM 内。
    // 按钮没有 data-testid 或 aria-label，使用 CSS 选择器作为后备。
    this.saveButton = page.locator(
      'button[title="保存"], .v-btn__content:has-text("保存"), [class*="toolbar"] button:has(.mdi-content-save)'
    ).first();
    this.saveAsButton = page.locator(
      'button[title="另存为"], .v-btn__content:has-text("另存为"), [class*="toolbar"] button:has(.mdi-content-save-move)'
    ).first();
    this.exportButton = page.locator(
      'button[title="导出"], .v-btn__content:has-text("导出"), [class*="toolbar"] button:has(.mdi-export)'
    ).first();
    this.undoButton = page.locator(
      'button[title="撤销"], .v-btn__content:has-text("撤销"), [class*="toolbar"] button:has(.mdi-undo)'
    ).first();
    this.redoButton = page.locator(
      'button[title="重做"], .v-btn__content:has-text("重做"), [class*="toolbar"] button:has(.mdi-redo)'
    ).first();

    // ─── 另存为弹窗 ──
    // 通过 Portal 渲染，标题 "另存为"
    this.saveAsModal = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByText('另存为') });
    this.saveAsSearchInput = this.saveAsModal.locator(
      'input[type="text"], input[placeholder*="搜索"], input[placeholder*="查找"]'
    ).first();
    this.saveAsTargetTypeTabs = this.saveAsModal.locator(
      'button', { hasText: /私人空间|我的图纸|项目|资源库/ }
    );
    this.saveAsTargetList = this.saveAsModal.locator(
      '[class*="list"] li, [class*="list"] tr, [class*="tree"] [role="treeitem"]'
    );
    this.saveAsConfirmButton = this.saveAsModal.getByRole('button', {
      name: /^(保存|确认)$/,
    });
    this.saveAsCancelButton = this.saveAsModal.getByRole('button', {
      name: '取消',
    });
    this.saveAsCloseButton = this.saveAsModal.locator(
      'button[aria-label="Close"], button[aria-label="关闭"], [class*="close"]'
    ).first();

    // ─── 导出弹窗 ──
    // 通过 Portal 渲染，标题 "选择下载格式"
    this.exportModal = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByText('选择下载格式') });
    this.exportFormatSelect = this.exportModal.locator(
      'input[type="radio"]'
    );
    this.exportConfirmButton = this.exportModal.getByRole('button', {
      name: /^下载$/,
    });
    this.exportCancelButton = this.exportModal.getByRole('button', {
      name: '取消',
    });

    // ─── 外部参照弹窗 ──
    // 通过 Portal 渲染，标题 "管理外部参照文件"
    this.externalRefModal = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByText('管理外部参照文件') });
    this.missingRefsList = this.externalRefModal.locator(
      '[data-tour="xref-list"] tbody tr, [class*="file-list"] li'
    );
    this.uploadReplacementButton = this.externalRefModal
      .locator('[data-tour="xref-actions"]')
      .getByRole('button', { name: /选择并上传|上传中/ });
    this.externalRefCloseButton = this.externalRefModal
      .locator('[data-tour="xref-actions"]')
      .getByRole('button', { name: /完成|关闭|取消/ })
      .last();

    // ─── 未保存变更对话框 ──
    // mxcad-app 可能通过 Vuetify 的 v-dialog 弹出
    this.unsavedDialog = page.locator(
      '[role="dialog"] .v-card__title:has-text("未保存"), [role="dialog"]:has-text("未保存的更改"), [role="alertdialog"]'
    );
    this.unsavedConfirmButton = this.unsavedDialog
      .getByRole('button', { name: /确认|保存并离开|是/ })
      .first();
    this.unsavedCancelButton = this.unsavedDialog
      .getByRole('button', { name: /取消|不保存|否/ })
      .first();
    this.unsavedMessageText = this.unsavedDialog.locator(
      '.v-card__text, [class*="message"], [class*="content"]'
    ).first();

    // ─── Toast / 通知 ──
    this.toast = page.locator(
      '[role="status"], [role="alert"], .v-snack__content, [class*="toast"], [class*="notification"]'
    );
  }

  // ─── 导航 ──────────────────────────────────────────────

  /**
   * 导航到 CAD 编辑器（打开指定文件）
   */
  async goto(fileId: string) {
    await this.page.goto(`/cad-editor/${fileId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 导航到带资源库参数的 CAD 编辑器
   * @param fileId - 文件节点 ID
   * @param libraryType - 资源库类型：'drawing' | 'block'
   */
  async gotoWithLibrary(fileId: string, libraryType: 'drawing' | 'block') {
    await this.page.goto(`/cad-editor/${fileId}?library=${libraryType}`);
    await this.page.waitForLoadState('networkidle');
  }

  // ─── 等待方法 ──────────────────────────────────────────

  /**
   * 等待 CAD 编辑器引擎加载完成（spinner 消失，不再显示加载文本）
   * @param timeout - 超时时间（毫秒），默认 60000
   */
  async waitForEditorLoad(timeout = 60000) {
    // 等待加载文本和 spinner 都消失
    await this.loadingText.waitFor({ state: 'hidden', timeout }).catch(() => {
      // 可能已经加载完成
    });
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout }).catch(() => {
      // 可能已经加载完成
    });
  }

  /**
   * 等待图纸内容加载完成（由 mxcad-app 派发 ready 事件或 canvas 可见）
   * @param timeout - 超时时间（毫秒），默认 30000
   */
  async waitForDrawingLoad(timeout = 30000) {
    // canvas 是由 mxcad-app 在 body 级创建的
    // 等待 WebGL canvas 元素出现
    await this.page.locator('canvas').first().waitFor({
      state: 'attached',
      timeout,
    }).catch(() => {
      // canvas 可能已存在
    });
    // 额外等待 mxcad-app ready 自定义事件
    await this.page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if ((window as unknown as Record<string, unknown>).__mxcadReady) {
          resolve();
          return;
        }
        const handler = () => {
          window.removeEventListener('mxcad-ready', handler);
          resolve();
        };
        window.addEventListener('mxcad-ready', handler);
        // 超时兜底
        setTimeout(resolve, timeout - 2000);
      });
    }).catch(() => {
      // 事件可能不触发，canvas 已存在就认为加载完成
    });
  }

  /**
   * 等待 CAD 工具栏出现（Vuetify v-app-bar 或 .mx-cad-toolbar）
   * @param timeout - 超时时间（毫秒），默认 15000
   */
  async waitForToolbar(timeout = 15000) {
    await this.page.locator(
      '.v-app-bar, .v-toolbar, [class*="mx-cad-toolbar"], [class*="mxcad-toolbar"]'
    ).first().waitFor({ state: 'visible', timeout }).catch(() => {
      // toolbar 可能已渲染或以其他结构存在
    });
  }

  // ─── 状态检查 ──────────────────────────────────────────

  /** 返回编辑器是否已完成加载（spinner 不可见 + 无错误） */
  async isEditorLoaded(): Promise<boolean> {
    const spinnerVisible = await this.loadingSpinner.isVisible().catch(() => false);
    const errorVisible = await this.errorMessage.isVisible().catch(() => false);
    return !spinnerVisible && !errorVisible;
  }

  /** 获取编辑器覆盖层容器 Locator */
  getEditorContainer(): Locator {
    return this.container;
  }

  /** 获取当前加载状态：spinner 可见性 + 加载文本内容 */
  async getLoadingState(): Promise<{
    isLoading: boolean;
    text: string | null;
  }> {
    const isLoading = await this.loadingSpinner.isVisible().catch(() => false);
    const text = isLoading
      ? await this.loadingText.textContent().catch(() => null)
      : null;
    return { isLoading, text };
  }

  /** 获取当前错误状态：错误文本 + 是否可见 */
  async getErrorState(): Promise<{
    hasError: boolean;
    message: string | null;
  }> {
    const hasError = await this.errorMessage.isVisible().catch(() => false);
    const message = hasError
      ? await this.errorMessage.textContent().catch(() => null)
      : null;
    return { hasError, message };
  }

  /** 获取当前 Toast 消息文本 */
  async getToast(): Promise<string | null> {
    return this.toast.first().textContent().catch(() => null);
  }

  // ─── CAD 工具栏操作 ────────────────────────────────────

  /** 点击保存按钮（触发 mxcad-save） */
  async clickSave() {
    await this.saveButton.click();
  }

  /** 点击另存为按钮 */
  async clickSaveAs() {
    await this.saveAsButton.click();
  }

  /** 点击导出按钮 */
  async clickExport() {
    await this.exportButton.click();
  }

  /** 点击撤销按钮 */
  async clickUndo() {
    await this.undoButton.click();
  }

  /** 点击重做按钮 */
  async clickRedo() {
    await this.redoButton.click();
  }

  /** 获取保存按钮 Locator */
  getSaveButton(): Locator {
    return this.saveButton;
  }

  /** 检查保存按钮是否可用（未 disabled） */
  async isSaveEnabled(): Promise<boolean> {
    const disabled = await this.saveButton.getAttribute('disabled').catch(() => null);
    if (disabled !== null) return false;
    // Vuetify 按钮可能使用 aria-disabled 或 class
    const ariaDisabled = await this.saveButton.getAttribute('aria-disabled').catch(() => null);
    if (ariaDisabled === 'true') return false;
    const hasDisabledClass = await this.saveButton.evaluate((el) =>
      el.classList.contains('v-btn--disabled') || el.classList.contains('disabled')
    ).catch(() => false);
    return !hasDisabledClass;
  }

  // ─── 另存为弹窗操作 ────────────────────────────────────

  /** 等待另存为弹窗出现 */
  async waitForSaveAsModal(timeout = 10000) {
    await this.saveAsModal.waitFor({ state: 'visible', timeout });
  }

  /**
   * 在另存为弹窗中填写目标位置
   * @param searchText - 搜索/筛选文本
   */
  async fillSaveAsTarget(searchText: string) {
    await this.saveAsSearchInput.fill(searchText);
  }

  /**
   * 选择另存为目标类型
   * @param type - 'personal' (私人空间) | 'project' (项目) | 'library' (资源库)
   */
  async selectSaveAsType(type: 'personal' | 'project' | 'library') {
    const tabTexts: Record<string, string> = {
      personal: /私人空间|我的图纸/,
      project: /项目|项目文件夹/,
      library: /资源库|公开资源库/,
    };
    await this.saveAsModal
      .getByRole('button', { name: tabTexts[type] })
      .click();
  }

  /** 确认另存为 */
  async confirmSaveAs() {
    await this.saveAsConfirmButton.click();
  }

  /** 取消另存为 */
  async cancelSaveAs() {
    await this.saveAsCancelButton.click();
  }

  /** 关闭另存为弹窗（点击 X 或遮罩） */
  async closeSaveAsModal() {
    if (await this.saveAsCloseButton.isVisible().catch(() => false)) {
      await this.saveAsCloseButton.click();
    } else {
      // 尝试点击 overlay 关闭
      await this.page.keyboard.press('Escape');
    }
  }

  // ─── 导出弹窗操作 ──────────────────────────────────────

  /** 等待导出弹窗出现 */
  async waitForExportModal(timeout = 10000) {
    await this.exportModal.waitFor({ state: 'visible', timeout });
  }

  /**
   * 选择导出格式
   * @param format - 'dwg' | 'dxf' | 'mxweb' | 'pdf'
   */
  async selectExportFormat(format: 'dwg' | 'dxf' | 'mxweb' | 'pdf') {
    await this.exportModal
      .locator(`input[type="radio"][value="${format}"]`)
      .check();
  }

  /** 确认导出 */
  async confirmExport() {
    await this.exportConfirmButton.click();
  }

  /** 取消导出 */
  async cancelExport() {
    await this.exportCancelButton.click();
  }

  // ─── 外部参照弹窗操作 ──────────────────────────────────

  /** 等待外部参照弹窗出现 */
  async waitForExternalRefModal(timeout = 10000) {
    await this.externalRefModal.waitFor({ state: 'visible', timeout });
  }

  /** 点击"选择并上传"上传替换文件 */
  async uploadReplacement() {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.uploadReplacementButton.click();
    const fileChooser = await fileChooserPromise;
    return fileChooser;
  }

  /** 关闭外部参照弹窗 */
  async closeExternalRefModal() {
    await this.externalRefCloseButton.click();
  }

  // ─── 未保存变更对话框操作 ───────────────────────────────

  /** 等待未保存变更对话框出现 */
  async waitForUnsavedDialog(timeout = 10000) {
    await this.unsavedDialog.waitFor({ state: 'visible', timeout });
  }

  /** 确认关闭（放弃未保存变更） */
  async confirmClose() {
    await this.unsavedConfirmButton.click();
  }

  /** 取消关闭（保留在编辑器） */
  async cancelClose() {
    await this.unsavedCancelButton.click();
  }

  // ─── 键盘操作 ──────────────────────────────────────────

  /** 按下 Escape 键 */
  async pressEscape() {
    await this.page.keyboard.press('Escape');
  }
}
