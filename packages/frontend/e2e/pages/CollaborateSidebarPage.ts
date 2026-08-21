import type { Page, Locator } from '@playwright/test';

/**
 * CollaborateSidebarPage — 实时协同侧栏页面对象
 *
 * 覆盖 SidebarContainer / CollaborateSidebar 的 React DOM 外壳：
 * - 侧栏触发条（data-tour="trigger-collaborate"）
 * - 协同面板（data-tour="collaborators-panel"，含「当前图纸」/「协同列表」子页）
 * - 创建协同（data-tour="create-collaborate-btn"）→ createWork
 * - 加入协同（data-tour="join-collaborate-btn"）→ joinWork
 * - 退出协同（「退出」按钮）→ exitWork
 * - 「协同中」实时徽标与在线人数（{n}在线）
 *
 * 关键架构事实：
 * - 协同会话由 mxcad cooperate SDK 管理（WebSocket 经后端 /api/cooperate
 *   代理到私有化协同服务），本页对象只驱动 React UI 与断言 UI 状态；
 *   createWork 成功后 SDK 自动加入会话（无需再调 joinWork）
 * - 协同 tab 仅在运行时配置 collaborationEnabled=true 时可用
 */
export class CollaborateSidebarPage {
  readonly page: Page;

  // ─── 侧栏触发条 ────────────────────────────────────────

  /** 协同 tab 触发按钮（SidebarTrigger） */
  readonly triggerTab: Locator;

  // ─── 协同面板 ──────────────────────────────────────────

  /** 协同面板容器 */
  readonly panel: Locator;

  /** 「当前图纸」子页签 */
  readonly subTabCurrent: Locator;

  /** 「协同列表」子页签 */
  readonly subTabList: Locator;

  // ─── 当前图纸面板（CurrentFilePanel） ──────────────────

  /** 创建协同按钮（data-tour="create-collaborate-btn"） */
  readonly createWorkButton: Locator;

  /** 「协同中」实时徽标 */
  readonly liveBadge: Locator;

  /** 在线人数文本（如 "2在线"） */
  readonly onlineCount: Locator;

  // ─── 协同卡片（CollabWorkCard） ────────────────────────

  /** 协同会话卡片（含 "N在线" 文本的卡片） */
  readonly workCard: Locator;

  /** 加入协同按钮（data-tour="join-collaborate-btn"） */
  readonly joinWorkButton: Locator;

  /** 退出协同按钮（当前已加入会话的卡片内） */
  readonly exitButton: Locator;

  // ─── Toast / 通知 ──────────────────────────────────────

  /** Toast 通知 */
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;

    // ─── 侧栏触发条 ──
    this.triggerTab = page.locator('[data-tour="trigger-collaborate"]');

    // ─── 协同面板 ──
    this.panel = page.locator('[data-tour="collaborators-panel"]');
    this.subTabCurrent = this.panel.getByRole('button', { name: '当前图纸' });
    this.subTabList = this.panel.getByRole('button', { name: '协同列表' });

    // ─── 当前图纸面板 ──
    this.createWorkButton = page.locator(
      '[data-tour="create-collaborate-btn"]'
    );
    this.liveBadge = this.panel.getByText('协同中');
    this.onlineCount = this.panel.locator(
      'div',
      { hasText: /\d+\s*在线/ }
    ).first();

    // ─── 协同卡片 ──
    // workCard 类经 CSS Modules 编译带 hash，用「在线」文本兜底定位卡片容器
    this.workCard = this.panel
      .locator('div')
      .filter({ hasText: /在线/ })
      .filter({ has: this.panel.getByRole('button', { name: /加入|退出|分享/ }) })
      .first();
    this.joinWorkButton = page.locator('[data-tour="join-collaborate-btn"]');
    this.exitButton = this.panel.getByRole('button', { name: '退出' });

    // ─── Toast / 通知 ──
    this.toast = page.locator(
      '[role="status"], [role="alert"], .v-snack__content, [class*="toast"], [class*="notification"]'
    );
  }

  // ─── 导航 ──────────────────────────────────────────────

  /**
   * 打开协同 tab（点击侧栏触发条）
   */
  async openTab() {
    await this.triggerTab.click();
    await this.waitForPanel();
  }

  /**
   * 切换到「当前图纸」子页
   */
  async showCurrentFile() {
    await this.subTabCurrent.click();
  }

  /**
   * 切换到「协同列表」子页
   */
  async showWorkList() {
    await this.subTabList.click();
  }

  // ─── 等待方法 ──────────────────────────────────────────

  /** 等待协同面板可见 */
  async waitForPanel(timeout = 10000) {
    await this.panel.waitFor({ state: 'visible', timeout });
  }

  /** 等待「协同中」徽标出现（会话已建立/已加入） */
  async waitForLiveBadge(timeout = 20000) {
    await this.liveBadge.waitFor({ state: 'visible', timeout });
  }

  /** 等待「协同中」徽标消失（会话已退出） */
  async waitForLiveBadgeGone(timeout = 15000) {
    await this.liveBadge.waitFor({ state: 'hidden', timeout });
  }

  /** 等待协同会话卡片出现 */
  async waitForWorkCard(timeout = 30000) {
    await this.workCard.waitFor({ state: 'visible', timeout });
  }

  // ─── 协同操作 ──────────────────────────────────────────

  /**
   * 创建协同会话（createWork）
   * SDK 成功后自动加入会话，UI 出现「协同中」徽标
   */
  async createWork(timeout = 30000) {
    await this.createWorkButton.click();
    await this.waitForLiveBadge(timeout);
  }

  /**
   * 加入第一个可见的协同会话（joinWork）
   */
  async joinFirstWork(timeout = 30000) {
    await this.waitForWorkCard(15000);
    await this.joinWorkButton.first().click();
    await this.waitForLiveBadge(timeout);
  }

  /**
   * 退出当前协同会话（exitWork）
   * 成功后 Toast "已退出协同" 且「协同中」徽标消失
   */
  async exitWork(timeout = 20000) {
    await this.exitButton.first().click();
    await this.waitForLiveBadgeGone(timeout);
  }

  // ─── 状态检查 ──────────────────────────────────────────

  /**
   * 读取当前在线人数（"N在线" 文本中的 N）
   */
  async getOnlineCount(): Promise<number | null> {
    const text = await this.onlineCount
      .textContent()
      .catch(() => null);
    if (text === null) return null;
    const match = text.match(/(\d+)\s*在线/);
    return match ? Number(match[1]) : null;
  }

  /** 是否处于协同会话中（「协同中」徽标可见） */
  async isInCollaboration(): Promise<boolean> {
    return this.liveBadge
      .isVisible()
      .catch(() => false);
  }

  /** 获取当前 Toast 消息文本 */
  async getToast(): Promise<string | null> {
    return this.toast.first().textContent().catch(() => null);
  }
}
