import type { Page, Locator } from '@playwright/test';

/**
 * 系统管理聚合页面对象
 *
 * 覆盖三个子页面：
 *  - 审计日志    /audit-logs     →  AuditLog section
 *  - 系统监控    /system-monitor →  SystemMonitor section
 *  - 运行时配置  /runtime-config →  RuntimeConfig section
 *
 * 使用方式：传入 page 实例，按需调用对应 section 方法。
 *   const adminPage = new SystemAdminPage(page);
 *   await adminPage.gotoAuditLogs();
 *   await adminPage.filterByAction('LOGIN');
 */
export class SystemAdminPage {
  readonly page: Page;

  // ================================================================
  //  AuditLog section
  // ================================================================

  readonly auditPageTitle: Locator;
  readonly auditStatsCards: Locator;
  readonly auditLogTable: Locator;
  readonly auditLogRows: Locator;
  readonly auditRefreshButton: Locator;
  readonly auditResetFilterButton: Locator;
  readonly auditNoPermission: Locator;
  readonly auditPrevPageButton: Locator;
  readonly auditNextPageButton: Locator;

  // AuditLog filters
  readonly auditActionFilter: Locator;
  readonly auditUserFilter: Locator;
  readonly auditStartDateFilter: Locator;
  readonly auditEndDateFilter: Locator;
  readonly auditResourceTypeFilter: Locator;
  readonly auditStatusFilter: Locator;

  // ================================================================
  //  SystemMonitor section
  // ================================================================

  readonly monitorPageTitle: Locator;
  readonly monitorStatusBadge: Locator;
  readonly monitorRefreshButton: Locator;
  readonly monitorAutoRefreshToggle: Locator;
  readonly monitorServiceCards: Locator;
  readonly monitorCacheSection: Locator;
  readonly monitorNoPermission: Locator;
  readonly monitorErrorBanner: Locator;

  // ================================================================
  //  RuntimeConfig section
  // ================================================================

  readonly configPageTitle: Locator;
  readonly configSearchInput: Locator;
  readonly configList: Locator;
  readonly configItems: Locator;
  readonly configSaveButton: Locator;
  readonly configNewButton: Locator;
  readonly configStatsBar: Locator;
  readonly configLoadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // --- AuditLog ---
    this.auditPageTitle = page.getByRole('heading', { name: /审计日志/ });
    this.auditStatsCards = page.locator('.grid-cols-4 .bg-white, [data-testid="audit-stats-card"]');
    this.auditLogTable = page.locator('table.min-w-full, [data-testid="audit-log-table"]');
    this.auditLogRows = page.locator('table.min-w-full tbody tr, [data-testid="audit-log-row"]');
    this.auditRefreshButton = page.getByRole('button', { name: /刷新/ });
    this.auditResetFilterButton = page.getByRole('button', { name: /重置筛选|重置/ });
    this.auditNoPermission = page.getByText(/没有访问审计日志的权限/);
    this.auditPrevPageButton = page.getByRole('button', { name: /上一页|‹/ });
    this.auditNextPageButton = page.getByRole('button', { name: /下一页|›/ });

    // AuditLog filters
    this.auditActionFilter = page.getByLabel(/操作类型/);
    this.auditUserFilter = page.getByLabel(/用户/);
    this.auditStartDateFilter = page.getByLabel(/开始日期/);
    this.auditEndDateFilter = page.getByLabel(/结束日期/);
    this.auditResourceTypeFilter = page.getByLabel(/资源类型/);
    this.auditStatusFilter = page.getByLabel(/状态/);

    // --- SystemMonitor ---
    this.monitorPageTitle = page.getByRole('heading', { name: /系统监控/ });
    this.monitorStatusBadge = page.locator('.status-badge, [data-testid="overall-status"]');
    this.monitorRefreshButton = page.getByRole('button', { name: /立即刷新|刷新/ });
    this.monitorAutoRefreshToggle = page.getByRole('switch', { name: /自动刷新/ })
      .or(page.getByLabel(/自动刷新/));
    this.monitorServiceCards = page.locator('.service-card, [data-testid="service-card"]');
    this.monitorCacheSection = page.locator('[data-testid="cache-info"], .cache-section');
    this.monitorNoPermission = page.getByText(/需要系统监控权限|访问受限/);
    this.monitorErrorBanner = page.locator('.error-banner');

    // --- RuntimeConfig ---
    this.configPageTitle = page.getByRole('heading', { name: /运行时配置/ });
    this.configSearchInput = page.getByPlaceholder(/搜索配置|搜索/);
    this.configList = page.locator('.config-card, [data-testid="config-list"]');
    this.configItems = page.locator('.config-item, [data-testid="config-item"]');
    this.configSaveButton = page.getByRole('button', { name: /保存所有|全部保存|保存/ });
    this.configNewButton = page.getByRole('button', { name: /新建配置|添加配置|新增/ });
    this.configStatsBar = page.locator('.stats-bar, [data-testid="config-stats"]');
    this.configLoadingSpinner = page.locator('.loading-spinner, [data-testid="loading"]');
  }

  // ================================================================
  //  AuditLog 方法
  // ================================================================

  /** 导航到审计日志页 */
  async gotoAuditLogs() {
    await this.page.goto('/audit-logs');
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.auditLogTable.waitFor({ state: 'visible', timeout: 15000 }),
      this.auditNoPermission.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});
  }

  /** 按操作类型筛选 */
  async filterByAction(action: string) {
    await this.auditActionFilter.selectOption(action);
    await this.page.waitForLoadState('networkidle');
  }

  /** 按用户筛选 — 填充用户筛选输入框 */
  async filterByUser(user: string) {
    await this.auditUserFilter.fill(user);
    await this.page.waitForLoadState('networkidle');
  }

  /** 按日期范围筛选 — 需两个日期（YYYY-MM-DD） */
  async filterByDateRange(startDate: string, endDate: string) {
    await this.auditStartDateFilter.fill(startDate);
    await this.auditEndDateFilter.fill(endDate);
    await this.page.waitForLoadState('networkidle');
  }

  /** 点击刷新按钮 */
  async refresh() {
    await this.auditRefreshButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 重置所有筛选条件 */
  async resetFilters() {
    await this.auditResetFilterButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 获取日志行数 */
  async getLogCount(): Promise<number> {
    return this.auditLogRows.count();
  }

  /** 获取统计卡片信息 */
  async getStatsCards(): Promise<{ total: string; success: string; failed: string; rate: string } | null> {
    const count = await this.auditStatsCards.count();
    if (count === 0) return null;
    const texts = await this.auditStatsCards.allTextContents();
    return {
      total: texts[0] ?? '',
      success: texts[1] ?? '',
      failed: texts[2] ?? '',
      rate: texts[3] ?? '',
    };
  }

  // ================================================================
  //  SystemMonitor 方法
  // ================================================================

  /** 导航到系统监控页 */
  async gotoSystemMonitor() {
    await this.page.goto('/system-monitor');
    await this.page.waitForLoadState('networkidle');
    await Promise.race([
      this.monitorServiceCards.first().waitFor({ state: 'visible', timeout: 15000 }),
      this.monitorNoPermission.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});
  }

  /**
   * 获取指定服务的健康状态
   * @param service 服务名称关键字，如 'database', 'redis', 'storage', 'app'
   */
  async getHealthStatus(service: string): Promise<string | null> {
    const card = this.monitorServiceCards.filter({ hasText: new RegExp(service, 'i') });
    const badge = card.locator('.service-status-badge, [data-testid="service-status"], .status-label');
    if (!(await badge.isVisible({ timeout: 3000 }).catch(() => false))) return null;
    return badge.textContent();
  }

  /** 手动刷新系统监控 */
  async refreshMonitor() {
    await this.monitorRefreshButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 切换自动刷新开关 */
  async toggleAutoRefresh() {
    await this.monitorAutoRefreshToggle.click();
  }

  /** 获取缓存信息文本 */
  async getCacheInfo(): Promise<string | null> {
    if (!(await this.monitorCacheSection.isVisible({ timeout: 3000 }).catch(() => false))) return null;
    return this.monitorCacheSection.textContent();
  }

  // ================================================================
  //  RuntimeConfig 方法
  // ================================================================

  /** 导航到运行时配置页 */
  async gotoRuntimeConfig() {
    await this.page.goto('/runtime-config');
    await this.page.waitForLoadState('networkidle');
    await this.configPageTitle.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** 搜索配置（按 key 关键词过滤） */
  async searchConfig(query: string) {
    if (await this.configSearchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.configSearchInput.fill(query);
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * 编辑指定配置项的值
   * @param key 配置 key（用于定位配置项）
   * @param value 新值
   */
  async editConfig(key: string, value: string) {
    const item = this.configItems.filter({ hasText: key });
    const input = item.locator('input.config-input, input:not([type="checkbox"])');
    await input.fill(value);
  }

  /** 保存所有待保存的配置 */
  async saveConfig() {
    await this.configSaveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 获取配置项数量 */
  async getConfigList(): Promise<number> {
    return this.configItems.count();
  }

  /** 获取新建配置按钮（用于检查可见性） */
  getNewConfigButton(): Locator {
    return this.configNewButton;
  }
}
