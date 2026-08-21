import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * 协同编辑双用户 fixture（issue #294）
 *
 * 为协同场景提供两个独立的浏览器上下文（两个真实用户），各自加载
 * 不同的登录态 storageState，可同时在线打开同一张图纸。
 *
 * 登录态文件（真实环境运行前需预登录生成）：
 *   - 用户 A（协同发起方）：e2e/.auth/user.json
 *   - 用户 B（协同加入方）：e2e/.auth/collab-user-b.json
 *
 * 与 multi-role.fixture 的 adminPage/userPage 模式一致；
 * 与 auth.fixture 不同，本 fixture 不清理 localStorage——
 * 协同场景需要保留登录态（localStorage 中的 accessToken/user）。
 *
 * 用法：
 * ```ts
 * import { test, expect } from '../fixtures/collab.fixture';
 *
 * test('双用户打开同一图纸', async ({ userAPage, userBPage }) => {
 *   await userAPage.goto('/cad-editor/xxx');
 *   await userBPage.goto('/cad-editor/xxx');
 * });
 * ```
 */
export interface CollabFixtures {
  /** 用户 A 页面（协同发起方），独立浏览器上下文 */
  userAPage: import('@playwright/test').Page;
  /** 用户 B 页面（协同加入方），独立浏览器上下文 */
  userBPage: import('@playwright/test').Page;
}

/**
 * storageState 文件不存在时返回 undefined（不加载登录态），
 * 避免在「前置条件探测失败 → 整体 skip」之前因缺文件而崩溃。
 */
function loadState(name: string): string | undefined {
  const file = path.resolve(process.cwd(), 'e2e', '.auth', name);
  return fs.existsSync(file) ? `e2e/.auth/${name}` : undefined;
}

export const test = base.extend<CollabFixtures>({
  userAPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: loadState('user.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  userBPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: loadState('collab-user-b.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
