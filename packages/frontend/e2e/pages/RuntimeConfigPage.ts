import type { Page, Locator } from '@playwright/test';

/**
 * 运行时配置页面对象
 * 对应 src/pages/RuntimeConfigPage/
 *
 * 选择器一律走 data-testid：CSS Module 类名是哈希的，class 选择器不可靠。
 * 行级控件用 [data-testid="rc-item"][data-key="…"] 精确定位。
 */
export class RuntimeConfigPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly statsBar: Locator;
  readonly configCards: Locator;
  readonly configItems: Locator;
  readonly searchInput: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;
  readonly readOnlyBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: '运行时配置' });
    // 统计栏 — 配置项/已修改/待保存/环境变量
    this.statsBar = page.getByTestId('rc-stats');
    // 配置分组卡片（带 data-category）
    this.configCards = page.getByTestId('rc-card');
    // 配置项（带 data-key）
    this.configItems = page.getByTestId('rc-item');
    // 关键词搜索（键名 / 说明 / 分类）
    this.searchInput = page.getByTestId('rc-search');
    // 加载中
    this.loadingState = page.getByTestId('rc-loading');
    // 空状态（搜索无结果 / 后端无配置）
    this.emptyState = page.getByTestId('rc-empty-state');
    // 只读横幅
    this.readOnlyBanner = page.getByTestId('rc-readonly-banner');
  }

  async goto() {
    await this.page.goto('/runtime-config');
    await this.page.waitForLoadState('networkidle');
  }

  /** 获取配置分组卡片数量 */
  async getConfigCardCount(): Promise<number> {
    return this.configCards.count();
  }

  /** 获取配置项数量 */
  async getConfigItemCount(): Promise<number> {
    return this.configItems.count();
  }

  /**
   * 按 key 定位单个配置项行
   */
  getConfigItemByKey(key: string): Locator {
    return this.page.locator(`[data-testid="rc-item"][data-key="${key}"]`);
  }

  /**
   * 查找指定分组的卡片
   */
  getConfigCardByTitle(title: string): Locator {
    return this.configCards.filter({ hasText: title });
  }

  /**
   * 修改配置项值
   * @param key 配置项的 key
   * @param value 新值
   */
  async editConfigValue(key: string, value: string) {
    const input = this.getConfigItemByKey(key).locator(
      '[data-testid="rc-input"] input, [data-testid="rc-input"] textarea'
    );
    await input.fill(value);
  }

  /**
   * 点击配置项的保存按钮
   * @param key 配置项的 key
   */
  async saveConfigItem(key: string) {
    await this.getConfigItemByKey(key)
      .locator('[data-testid="rc-save"]')
      .click();
  }

  /**
   * 点击配置项的恢复默认按钮
   * @param key 配置项的 key
   */
  async resetConfigItem(key: string) {
    await this.getConfigItemByKey(key)
      .locator('[data-testid="rc-reset"]')
      .click();
  }

  /**
   * 切换 boolean 配置项的开关
   * @param key 配置项的 key
   */
  async toggleConfigItem(key: string) {
    await this.getConfigItemByKey(key)
      .locator('[data-testid="rc-input"] input[type="checkbox"]')
      .click();
  }
}
