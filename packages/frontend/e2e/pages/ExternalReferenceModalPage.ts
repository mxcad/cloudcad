import type { Page, Locator } from '@playwright/test';

/**
 * ExternalReferenceModalPage — 外部参照弹窗页面对象
 *
 * 覆盖 ExternalReferenceModal.tsx 组件。弹窗通过 Portal 渲染到 document.body。
 * 使用 data-testid 属性定位状态图标和改进的语义选择器。
 */
export class ExternalReferenceModalPage {
  readonly page: Page;

  /** 弹窗容器 */
  readonly modal: Locator;

  readonly title: Locator;

  /** 提示信息区域 */
  readonly infoMessage: Locator;

  /** 文件列表表格 */
  readonly fileTable: Locator;
  readonly fileRows: Locator;

  /** 状态图标（通过 data-testid） */
  readonly successIcons: Locator;
  readonly failIcons: Locator;
  readonly loadingIcons: Locator;

  /** 操作按钮 */
  readonly uploadButton: Locator;
  readonly completeButton: Locator;
  readonly cancelButton: Locator;

  /** 全部成功消息 */
  readonly allSuccessMessage: Locator;

  /** 部分失败消息 */
  readonly partialFailMessage: Locator;

  /** 上传进度条 */
  readonly progressBar: Locator;

  constructor(page: Page) {
    this.page = page;

    // 弹窗通过 Portal 渲染，标题为 "管理外部参照文件"
    this.modal = page.locator('[role="dialog"]').filter({ has: page.getByText('管理外部参照文件') });
    this.title = page.getByText('管理外部参照文件');

    // 提示信息区域
    this.infoMessage = this.modal.locator('.rounded-lg.p-3').first();

    // 文件列表（通过 data-tour 属性）
    this.fileTable = this.modal.locator('[data-tour="xref-list"]');
    this.fileRows = this.fileTable.locator('tbody tr');

    // 状态图标（通过 data-testid）
    this.successIcons = this.modal.locator('[data-testid="icon-check-circle"]');
    this.failIcons = this.modal.locator('[data-testid="icon-x-circle"]');
    this.loadingIcons = this.modal.locator('[data-testid="icon-loader"]');

    // 操作按钮（通过 data-tour 属性定位 footer 区域）
    const footer = this.modal.locator('[data-tour="xref-actions"]');
    this.uploadButton = footer.getByRole('button', { name: /选择并上传|上传中/ });
    this.completeButton = footer.getByRole('button', { name: /完成|关闭/ });
    this.cancelButton = footer.getByRole('button', { name: '取消' });

    // 全部成功消息
    this.allSuccessMessage = this.modal.getByText('所有外部参照文件上传成功');

    // 部分失败消息
    this.partialFailMessage = this.modal.getByText('部分文件上传失败');

    // 上传进度条
    this.progressBar = this.modal.locator('.h-2.rounded-full');
  }

  /**
   * 等待弹窗出现
   */
  async waitForModal(timeout = 10000) {
    await this.modal.waitFor({ state: 'visible', timeout });
  }

  /**
   * 检查弹窗是否显示
   */
  async isOpen() {
    return this.modal.isVisible();
  }

  /**
   * 点击"选择并上传"按钮
   */
  async clickUpload() {
    await this.uploadButton.click();
  }

  /**
   * 点击"完成"按钮
   */
  async clickComplete() {
    await this.completeButton.click();
  }

  /**
   * 点击"取消"按钮关闭弹窗
   */
  async clickCancel() {
    await this.cancelButton.click();
  }

  /**
   * 获取文件行数
   */
  async getFileCount() {
    return this.fileRows.count();
  }

  /**
   * 选择文件并上传（触发 filechooser 事件）
   */
  async selectAndUpload(filePath: string) {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.clickUpload();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }
}
