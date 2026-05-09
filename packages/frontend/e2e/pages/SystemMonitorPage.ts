import type { Page, Locator } from '@playwright/test';

/**
 * 系统监控页面对象
 * 对应 src/pages/SystemMonitorPage.tsx
 */
export class SystemMonitorPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly statusBadge: Locator;
  readonly refreshButton: Locator;
  readonly coreServicesSection: Locator;
  readonly serviceCards: Locator;
  readonly databaseServiceCard: Locator;
  readonly storageServiceCard: Locator;
  readonly appServiceCard: Locator;
  readonly systemInfoSection: Locator;
  readonly infoCards: Locator;
  readonly storageCleanupSection: Locator;
  readonly cleanupButton: Locator;
  readonly cleanupStats: Locator;
  readonly errorBanner: Locator;
  readonly noPermissionHint: Locator;

  constructor(page: Page) {
    this.page = page;
    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: '系统监控' });
    // 系统状态徽章
    this.statusBadge = page.locator('.status-badge');
    // 刷新按钮
    this.refreshButton = page.getByText('立即刷新');
    // 核心服务区域
    this.coreServicesSection = page.getByRole('heading', { name: '核心服务' });
    // 所有服务卡片
    this.serviceCards = page.locator('.service-card');
    // 数据库服务卡片
    this.databaseServiceCard = page.locator('.service-card').filter({ hasText: 'PostgreSQL 数据库' });
    // 存储服务卡片
    this.storageServiceCard = page.locator('.service-card').filter({ hasText: '文件存储' });
    // 应用服务卡片
    this.appServiceCard = page.locator('.service-card').filter({ hasText: '应用服务' });
    // 系统信息区域
    this.systemInfoSection = page.getByRole('heading', { name: '系统信息' });
    // 信息卡片
    this.infoCards = page.locator('.info-card');
    // 存储清理区域
    this.storageCleanupSection = page.getByRole('heading', { name: '存储清理' });
    // 清理按钮
    this.cleanupButton = page.getByText('立即清理存储');
    // 清理统计
    this.cleanupStats = page.locator('.cleanup-stat-card');
    // 错误横幅
    this.errorBanner = page.locator('.error-banner');
    // 无权限提示
    this.noPermissionHint = page.getByText('您需要系统监控权限才能访问此页面');
  }

  async goto() {
    await this.page.goto('/system-monitor');
    await this.page.waitForLoadState('networkidle');
  }

  /** 获取系统状态文本 */
  async getOverallStatus(): Promise<string | null> {
    return this.statusBadge.locator('.status-label').textContent();
  }

  /** 获取服务卡片状态 */
  async getServiceStatus(card: Locator): Promise<string | null> {
    return card.locator('.service-status-badge').textContent();
  }

  /** 点击刷新按钮 */
  async clickRefresh() {
    await this.refreshButton.click();
  }

  /** 执行存储清理 */
  async clickCleanup() {
    await this.cleanupButton.click();
  }
}
