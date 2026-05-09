import type { Page, Locator } from '@playwright/test';

/**
 * 运行时配置页面对象
 * 对应 src/pages/RuntimeConfigPage.tsx
 */
export class RuntimeConfigPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly statsBar: Locator;
  readonly configCards: Locator;
  readonly configItems: Locator;
  readonly searchInput: Locator;
  readonly loadingSpinner: Locator;
  readonly emptyState: Locator;
  readonly readOnlyBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    // 页面标题
    this.pageTitle = page.getByRole('heading', { name: '运行时配置' });
    // 统计栏 — 配置项/公开/待保存
    this.statsBar = page.locator('.stats-bar');
    // 配置分组卡片
    this.configCards = page.locator('.config-card');
    // 配置项
    this.configItems = page.locator('.config-item');
    // 搜索输入框 — RuntimeConfigPage 没有独立搜索，但预留
    this.searchInput = page.getByPlaceholder(/搜索配置|搜索/);
    // 加载中
    this.loadingSpinner = page.locator('.loading-spinner');
    // 空状态
    this.emptyState = page.locator('.empty-state');
    // 只读横幅
    this.readOnlyBanner = page.locator('.info-banner');
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
   * 查找包含指定 key 的配置项
   */
  getConfigItemByKey(key: string): Locator {
    return this.configItems.filter({ hasText: key });
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
    const item = this.getConfigItemByKey(key);
    const input = item.locator('input.config-input');
    await input.fill(value);
  }

  /**
   * 点击配置项的保存按钮
   * @param key 配置项的 key
   */
  async saveConfigItem(key: string) {
    const item = this.getConfigItemByKey(key);
    await item.locator('.save-btn').click();
  }

  /**
   * 点击配置项的重置按钮
   * @param key 配置项的 key
   */
  async resetConfigItem(key: string) {
    const item = this.getConfigItemByKey(key);
    await item.locator('.reset-btn').click();
  }

  /**
   * 切换 boolean 配置项
   * @param key 配置项的 key
   */
  async toggleConfigItem(key: string) {
    const item = this.getConfigItemByKey(key);
    await item.locator('.toggle-switch').click();
  }
}
