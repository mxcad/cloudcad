import type { Page, Locator } from '@playwright/test';

/**
 * SaveAsModalPage — 另存为弹窗页面对象
 *
 * 覆盖 SaveAsModal.tsx 组件。弹窗通过 Portal 渲染到 document.body。
 */
export class SaveAsModalPage {
  readonly page: Page;

  /** 弹窗容器 */
  readonly modal: Locator;

  readonly title: Locator;

  /** 文件名字段 */
  readonly fileNameInput: Locator;

  /** 目标类型按钮 */
  readonly targetPersonalButton: Locator;
  readonly targetProjectButton: Locator;
  readonly targetLibraryButton: Locator;

  /** 项目选择下拉 */
  readonly projectSelect: Locator;

  /** 资源库类型下拉 */
  readonly librarySelect: Locator;

  /** 文件夹选择按钮 */
  readonly folderPickerButton: Locator;

  /** 保存格式按钮 */
  readonly formatDwgButton: Locator;
  readonly formatDxfButton: Locator;

  /** 操作按钮 */
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  /** 错误消息 */
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // 弹窗通过 Portal 渲染，标题为 "另存为"
    this.modal = page.locator('[role="dialog"]').filter({ has: page.getByText('另存为') });
    this.title = page.getByText('另存为');

    // 文件名字段
    this.fileNameInput = this.modal.locator('input[type="text"]').first();

    // 目标类型按钮
    this.targetPersonalButton = this.modal.getByRole('button', { name: '我的图纸' });
    this.targetProjectButton = this.modal.getByRole('button', { name: '项目文件夹' });
    this.targetLibraryButton = this.modal.getByRole('button', { name: '公开资源库' });

    // 项目选择下拉
    this.projectSelect = this.modal.locator('select').first();

    // 资源库类型下拉
    this.librarySelect = this.modal.locator('select').last();

    // 文件夹选择按钮
    this.folderPickerButton = this.modal.getByRole('button', { name: /点击选择文件夹|选择文件夹/ });

    // 保存格式按钮
    this.formatDwgButton = this.modal.getByRole('button', { name: 'DWG' });
    this.formatDxfButton = this.modal.getByRole('button', { name: 'DXF' });

    // 操作按钮
    this.saveButton = this.modal.getByRole('button', { name: /^保存$/ });
    this.cancelButton = this.modal.getByRole('button', { name: '取消' });

    // 错误消息（SaveAsModal 内 .bg-red-50 容器）
    this.errorMessage = this.modal.locator('.bg-red-50, .text-red-600');
  }

  /**
   * 填写文件名
   */
  async fillFileName(name: string) {
    await this.fileNameInput.fill(name);
  }

  /**
   * 选择目标类型
   */
  async selectTargetType(type: 'personal' | 'project' | 'library') {
    switch (type) {
      case 'personal':
        await this.targetPersonalButton.click();
        break;
      case 'project':
        await this.targetProjectButton.click();
        break;
      case 'library':
        await this.targetLibraryButton.click();
        break;
    }
  }

  /**
   * 选择项目（通过 value）
   */
  async selectProject(projectId: string) {
    await this.projectSelect.selectOption(projectId);
  }

  /**
   * 选择资源库类型
   */
  async selectLibraryType(type: 'drawing' | 'block') {
    await this.librarySelect.selectOption(type);
  }

  /**
   * 选择保存格式
   */
  async selectFormat(format: 'dwg' | 'dxf') {
    if (format === 'dwg') {
      await this.formatDwgButton.click();
    } else {
      await this.formatDxfButton.click();
    }
  }

  /**
   * 提交保存
   */
  async submit() {
    await this.saveButton.click();
  }

  /**
   * 取消关闭
   */
  async cancel() {
    await this.cancelButton.click();
  }

  /**
   * 点击遮罩关闭
   */
  async clickOverlay() {
    // Modal 遮罩是 dialog 之外的覆盖层
    const overlay = this.page.locator('[role="dialog"] ~ .fixed.inset-0').first();
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click();
    }
  }
}
