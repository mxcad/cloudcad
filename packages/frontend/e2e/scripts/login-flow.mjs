/**
 * 结晶产物：登录流程 E2E（探路→脚本 的落地形态）。
 *
 * 由 agent-browser 探路验证过的流程固化而来，编码了探路学到的等待策略：
 *   1. goto 用 domcontentloaded（不 gate 在 load/networkidle——本仓库 CAD 编辑器 +
 *      协同 WebSocket 让网络永不 idle，networkidle 会空等 20s+）。
 *   2. 等登录表单用「等具体输入框可见」+ 30s 预算（Vite dev 冷渲染慢，IAB 的 3s 封顶不够）。
 *   3. 登录跳转用 waitForURL 离开 /login（60s 预算，覆盖 CAD 引擎加载），不用 networkidle。
 *
 * 前置：前端 dev(8000) + 后端(3001) 已在运行；测试账号由
 *   packages/backend/scripts/ensure-e2e-accounts.ts 幂等创建。
 *
 * 运行（在 packages/frontend 下）：
 *   node e2e/scripts/login-flow.mjs
 * 可覆盖：E2E_BASE_URL / E2E_ACCOUNT / E2E_PASSWORD / E2E_HEADFUL
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8000';
const ACCOUNT = process.env.E2E_ACCOUNT || 'e2e-user-a@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'E2eUser!2026';
const HEADLESS = (process.env.E2E_HEADFUL || '') !== '1';

const t = (label) => (ms) => console.log(`  ${label.padEnd(22)} ${String(ms).padStart(6)} ms`);
const now = () => Date.now();

let browser;
const total0 = now();
try {
  const launchMs0 = now();
  browser = await chromium.launch({ headless: HEADLESS });
  console.log(t('launch chromium')(now() - launchMs0));

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1) 打开登录页（domcontentloaded，不 gate 在 load）
  const nav0 = now();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(t('goto /login')(now() - nav0));

  // 2) 等登录表单渲染（Vite dev 冷渲染慢，给 30s 预算）
  const form0 = now();
  const accountInput = page.getByRole('textbox', { name: '邮箱或用户名' });
  await accountInput.waitFor({ state: 'visible', timeout: 30000 });
  console.log(t('wait login form')(now() - form0));

  // 3) 填账号 + 密码
  const fill0 = now();
  await accountInput.fill(ACCOUNT);
  await page.getByRole('textbox', { name: '密码' }).fill(PASSWORD);
  console.log(t('fill account+password')(now() - fill0));

  // 4) 点击登录
  const click0 = now();
  await page.getByRole('button', { name: '立即登录' }).click();
  console.log(t('click login')(now() - click0));

  // 5) 等离开 /login（登录成功跳转；60s 预算覆盖 CAD 引擎加载，绝不用 networkidle）
  const redirect0 = now();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 });
  const landedUrl = page.url();
  console.log(t('wait redirect off /login')(now() - redirect0));
  console.log(`  landed url               ${landedUrl}`);

  // 6) 断言：已离开登录页 = 登录成功
  if (landedUrl.endsWith('/login')) {
    throw new Error('登录后仍停留在 /login，登录未成功');
  }

  // 7) 截图留证
  const shotPath = 'e2e/scripts/login-flow-result.png';
  await page.screenshot({ path: shotPath });
  console.log(`  screenshot             ${shotPath}`);

  console.log(`\n✅ PASS  登录流程通过（${ACCOUNT} → ${landedUrl}）`);
  console.log(`   总耗时 ${now() - total0} ms（含 chromium 启动）`);
  await context.close();
  process.exitCode = 0;
} catch (e) {
  console.error(`\n❌ FAIL  ${e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
