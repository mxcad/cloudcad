# 把流程结晶成 Playwright 脚本

探路（agent-browser）验证流程能走通后，结晶成 Playwright 脚本反复跑。本仓库已有脚手架：

- `packages/frontend/playwright.config.ts` — chromium project，默认 `VITE_MSW=true`（MSW mock；测真实后端时置 false）
- `packages/frontend/e2e/fixtures/multi-role.fixture.ts` — 按角色 storageState 登录
- `packages/frontend/e2e/fixtures/collab.fixture.ts` — userAPage / userBPage 双用户协同
- `packages/frontend/e2e/pages/` — 20 个 page object
- `packages/frontend/e2e/spec/` — 8 个 spec

## 一次性脚本范式（login-flow.mjs）

独立脚本（不进 jest / vitest，直接 `node` 跑），适合「快速验证某流程」：

```js
import { chromium } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8000';
const ACCOUNT = process.env.E2E_ACCOUNT || 'e2e-user-a@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'E2eUser!2026';

const browser = await chromium.launch();
const page = await browser.newPage();
const t0 = Date.now();

// 导航用 domcontentloaded（不是 load/networkidle）
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

// 等元素可见，给足 Vite dev 冷加载预算（30s）
const accountInput = page.getByRole('textbox', { name: '邮箱或用户名' });
await accountInput.waitFor({ state: 'visible', timeout: 30000 });
await accountInput.fill(ACCOUNT);
await page.getByRole('textbox', { name: '密码' }).fill(PASSWORD);
await page.getByRole('button', { name: '立即登录' }).click();

// 等跳转，不等 networkidle（60s 预算）
await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 });

await page.screenshot({ path: 'e2e/scripts/login-flow-result.png' });
console.log(`登录完成，总耗时 ${Date.now() - t0}ms`);
await browser.close();
```

跑：`cd packages/frontend && node e2e/scripts/login-flow.mjs`（可配 `E2E_BASE_URL` / `E2E_ACCOUNT` / `E2E_PASSWORD` / `E2E_HEADFUL`）。

## 结晶时的等待策略（务必编码进去）

- 导航 `waitUntil: 'domcontentloaded'`。
- 元素等待给 30s（Vite dev 冷加载），CAD 编辑器相关给 60s。
- **绝不 `waitForLoadState('networkidle')`**。
- 跳转用 `waitForURL`，不用 `waitForLoadState`。

## 结晶检查清单

- [ ] 选择器用 `getByRole` / `getByLabel`（语义化），少用易变的 CSS 类
- [ ] 等待策略按上节编码（无 networkidle）
- [ ] 登录态：一次性脚本可每次登录；高频回归用 storageState 复用
- [ ] 慢步骤（装浏览器）不放进脚本，脚本只假设环境已就绪
- [ ] 打印分步耗时，方便定位哪一步慢
