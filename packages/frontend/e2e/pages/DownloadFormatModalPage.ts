import type { Page, Locator } from '@playwright/test';

/**
 * DownloadFormatModalPage — 下载格式选择弹窗页面对象
 *
 * 覆盖 DownloadFormatModal.tsx 组件。弹窗通过 Portal 渲染到 document.body。
 * 支持选择 DWG/DXF/MXWEB/PDF 格式，PDF 有额外参数（宽、高、颜色策略）。
 */
export class DownloadFormatModalPage {
  readonly page: Page;

  /** 弹窗容器 */
  readonly modal: Locator;

  readonly title: Locator;

  /** 文件名显示 */
  readonly fileNameDisplay: Locator;

  /** 格式选择 radio */
  readonly formatDwgRadio: Locator;
  readonly formatDxfRadio: Locator;
  readonly formatMxwebRadio: Locator;
  readonly formatPdfRadio: Locator;

  /** PDF 参数 */
  readonly pdfWidthInput: Locator;
  readonly pdfHeightInput: Locator;
  readonly pdfColorPolicySelect: Locator;

  /** 操作按钮 */
  readonly downloadButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // 弹窗通过 Portal 渲染，标题为 "选择下载格式"
    this.modal = page.locator('[role="dialog"]').filter({ has: page.getByText('选择下载格式') });
    this.title = page.getByText('选择下载格式');

    // 文件名显示
    this.fileNameDisplay = this.modal.locator('.font-mono');

    // 格式选择 radio — 通过 radio input 的 value 定位
    this.formatMxwebRadio = this.modal.locator('input[type="radio"][value="mxweb"]');
    this.formatDwgRadio = this.modal.locator('input[type="radio"][value="dwg"]');
    this.formatDxfRadio = this.modal.locator('input[type="radio"][value="dxf"]');
    this.formatPdfRadio = this.modal.locator('input[type="radio"][value="pdf"]');

    // PDF 参数（仅在 PDF 格式时可见）
    this.pdfWidthInput = this.modal.locator('input').filter({ has: this.page.locator('..') }).locator('input[placeholder="2000"]').first();
    this.pdfHeightInput = this.modal.locator('input[placeholder="2000"]').last();
    this.pdfColorPolicySelect = this.modal.locator('select');

    // 操作按钮
    this.downloadButton = this.modal.getByRole('button', { name: /^下载$/ });
    this.cancelButton = this.modal.getByRole('button', { name: '取消' });
  }

  /**
   * 等待弹窗出现
   */
  async waitForModal(timeout = 10000) {
    await this.modal.waitFor({ state: 'visible', timeout });
  }

  /**
   * 选择下载格式
   */
  async selectFormat(format: 'dwg' | 'dxf' | 'mxweb' | 'pdf') {
    switch (format) {
      case 'dwg':
        await this.formatDwgRadio.check();
        break;
      case 'dxf':
        await this.formatDxfRadio.check();
        break;
      case 'mxweb':
        await this.formatMxwebRadio.check();
        break;
      case 'pdf':
        await this.formatPdfRadio.check();
        break;
    }
  }

  /**
   * 填写 PDF 参数
   */
  async fillPdfOptions(options: { width?: string; height?: string; colorPolicy?: 'mono' | 'color' }) {
    if (options.width) {
      await this.pdfWidthInput.fill(options.width);
    }
    if (options.height) {
      await this.pdfHeightInput.fill(options.height);
    }
    if (options.colorPolicy) {
      await this.pdfColorPolicySelect.selectOption(options.colorPolicy);
    }
  }

  /**
   * 确认下载
   */
  async confirm() {
    await this.downloadButton.click();
  }

  /**
   * 取消关闭
   */
  async cancel() {
    await this.cancelButton.click();
  }

  /**
   * 按 Esc 键关闭
   */
  async pressEscape() {
    await this.page.keyboard.press('Escape');
  }
}
