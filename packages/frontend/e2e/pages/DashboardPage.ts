import type { Page, Locator } from '@playwright/test';

/**
 * 仪表盘页面对象
 * 对应 src/pages/Dashboard.tsx
 */
export class DashboardPage {
  readonly page: Page;
  readonly greeting: Locator;
  readonly newProjectButton: Locator;
  readonly uploadButton: Locator;
  readonly statCards: Locator;
  readonly recentFilesSection: Locator;
  readonly recentProjectsSection: Locator;
  readonly projectCards: Locator;
  readonly createProjectModal: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // 问候语 h1 包含 "早上好/下午好/晚上好，用户名"
    this.greeting = page.locator('h1').first();
    // 新建项目按钮
    this.newProjectButton = page.getByRole('button', { name: '新建项目' });
    // 上传图纸按钮
    this.uploadButton = page.getByRole('button', { name: '上传图纸' });
    // 统计卡片区域
    this.statCards = page.locator('[class*="grid-cols-2"]').first();
    // 最近文件区域
    this.recentFilesSection = page.getByText('最近文件');
    // 最近项目区域
    this.recentProjectsSection = page.getByText('最近项目');
    // 项目卡片
    this.projectCards = page.getByText('查看全部');
    // 创建项目弹窗
    this.createProjectModal = page.getByRole('dialog');
    // 搜索输入框 - 仪表盘可能没有独立搜索框，用 FileItem 查找
    this.searchInput = page.getByPlaceholder(/搜索/);
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  /**
   * 点击统计卡片跳转到对应页面
   */
  async clickStatCard(title: string) {
    await this.page.getByText(title).first().click();
  }

  /**
   * 点击新建项目按钮打开弹窗
   */
  async openCreateProjectModal() {
    await this.newProjectButton.first().click();
  }

  /**
   * 关闭创建项目弹窗
   */
  async closeCreateProjectModal() {
    await this.page.keyboard.press('Escape');
  }

  /** 获取项目卡片数 */
  async getProjectCount(): Promise<number> {
    return this.projectCards.count();
  }
}
