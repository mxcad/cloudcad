import type { Page, Locator } from '@playwright/test';

/**
 * CADEditorPage — CAD 编辑器页面对象
 *
 * 覆盖 CADEditorDirect.tsx 的 React DOM 外壳（工具栏按钮、模态框、容器），
 * 不涉及 Canvas/WebGL 交互。
 * #mx-cad-container 由 mxcad-app 在 document.body 级创建。
 */
export class CADEditorPage {
  readonly page: Page;

  /** CAD 编辑器容器（body 级别，由 mxcad-app 创建） */
  readonly cadContainer: Locator;

  /** 加载 Spinner */
  readonly loadingSpinner: Locator;

  /** 错误提示文本 */
  readonly errorMessage: Locator;

  /** 错误恢复按钮（"刷新页面" 或 "返回项目列表"） */
  readonly errorRecoveryButton: Locator;

  /** 登录提示弹窗 */
  readonly loginPrompt: Locator;

  readonly loginPromptTitle: Locator;
  readonly loginPromptLoginButton: Locator;
  readonly loginPromptCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // CAD 容器在 document.body 级别
    this.cadContainer = page.locator('#mx-cad-container');

    // 加载状态
    this.loadingSpinner = page.locator('.animate-spin.rounded-full');

    // 错误状态
    this.errorMessage = page.getByText(/CAD编辑器初始化失败|文件不存在|文件已被删除|文件尚未转换完成|请登录后访问此文件|无法构造文件访问URL/);
    this.errorRecoveryButton = page.getByRole('button', { name: /刷新页面|返回项目列表/ });

    // 登录提示弹窗（LoginPrompt 组件，通过 Portal 渲染到 body）
    this.loginPrompt = page.locator('[role="dialog"]').filter({ has: page.getByText('需要登录') });
    this.loginPromptTitle = page.getByText('需要登录');
    this.loginPromptLoginButton = page.getByRole('button', { name: '立即登录' });
    this.loginPromptCloseButton = page.getByRole('button', { name: '稍后再说' });
  }

  /**
   * 导航到 CAD 编辑器（打开指定文件）
   */
  async goto(fileId: string) {
    await this.page.goto(`/cad-editor/${fileId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 导航到 CAD 编辑器主页（空白编辑器）
   */
  async gotoHome() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 导航到带 URL 参数的 CAD 编辑器
   */
  async gotoWithParams(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params);
    await this.page.goto(`/?${searchParams.toString()}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 等待 CAD 容器渲染完成（mxcad-app 在 body 级创建）
   */
  async waitForCADContainer(timeout = 30000) {
    await this.cadContainer.waitFor({ state: 'attached', timeout });
  }

  /**
   * 等待加载完成（Spinner 消失）
   */
  async waitForLoadComplete(timeout = 60000) {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout }).catch(() => {
      // 可能已经加载完成
    });
  }

  /**
   * 点击错误恢复按钮（"刷新页面" / "返回项目列表"）
   */
  async clickErrorRecovery() {
    await this.errorRecoveryButton.click();
  }
}
