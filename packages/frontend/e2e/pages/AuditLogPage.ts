import type { Page, Locator } from '@playwright/test';

/**
 * 审计日志页面对象
 * 对应 src/pages/AuditLogPage.tsx
 */
export class AuditLogPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly statsCards: Locator;
  readonly filterSection: Locator;
  readonly userIdFilter: Locator;
  readonly actionFilter: Locator;
  readonly resourceTypeFilter: Locator;
  readonly resourceIdFilter: Locator;
  readonly startDateFilter: Locator;
  readonly endDateFilter: Locator;
  readonly statusFilter: Locator;
  readonly resetFilterButton: Locator;
  readonly refreshButton: Locator;
  readonly logTable: Locator;
  readonly logRows: Locator;
  readonly loadingText: Locator;
  readonly emptyText: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly pageInfo: Locator;
  readonly noPermissionHint: Locator;

  constructor(page: Page) {
    this.page = page;
    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: '审计日志' });
    // 统计卡片 — 总记录数/成功次数/失败次数/成功率
    this.statsCards = page.locator('.grid-cols-4 .bg-white');
    // 筛选条件区域
    this.filterSection = page.locator('.bg-white').filter({ hasText: '筛选条件' });
    // 用户 ID 筛选
    this.userIdFilter = page.getByLabel('用户 ID');
    // 操作类型筛选
    this.actionFilter = page.getByLabel('操作类型');
    // 资源类型筛选
    this.resourceTypeFilter = page.getByLabel('资源类型');
    // 资源 ID 筛选
    this.resourceIdFilter = page.getByLabel('资源 ID');
    // 开始日期筛选
    this.startDateFilter = page.getByLabel('开始日期');
    // 结束日期筛选
    this.endDateFilter = page.getByLabel('结束日期');
    // 状态筛选
    this.statusFilter = page.getByLabel('状态');
    // 重置筛选按钮
    this.resetFilterButton = page.getByRole('button', { name: '重置筛选' });
    // 刷新按钮
    this.refreshButton = page.getByRole('button', { name: '刷新' });
    // 日志表格
    this.logTable = page.locator('table.min-w-full');
    // 日志行
    this.logRows = page.locator('table.min-w-full tbody tr');
    // 加载中文本
    this.loadingText = page.getByText('加载中...');
    // 空数据文本
    this.emptyText = page.getByText('暂无数据');
    // 上一页按钮
    this.prevPageButton = page.getByRole('button', { name: '上一页' });
    // 下一页按钮
    this.nextPageButton = page.getByRole('button', { name: '下一页' });
    // 分页信息
    this.pageInfo = page.locator('.text-sm.text-gray-700');
    // 无权限提示
    this.noPermissionHint = page.getByText('您没有访问审计日志的权限');
  }

  async goto() {
    await this.page.goto('/audit-logs');
    await this.page.waitForLoadState('networkidle');
  }

  /** 按操作类型筛选 */
  async filterByAction(actionValue: string) {
    await this.actionFilter.selectOption(actionValue);
  }

  /** 按资源类型筛选 */
  async filterByResourceType(typeValue: string) {
    await this.resourceTypeFilter.selectOption(typeValue);
  }

  /** 获取日志行数 */
  async getLogRowCount(): Promise<number> {
    // 过滤掉"加载中..."行
    const rows = this.logRows;
    const count = await rows.count();
    return count;
  }

  /** 翻到上一页 */
  async goToPrevPage() {
    await this.prevPageButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /** 翻到下一页 */
  async goToNextPage() {
    await this.nextPageButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}
