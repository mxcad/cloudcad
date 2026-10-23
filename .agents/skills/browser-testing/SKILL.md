---
name: browser-testing
description: 用浏览器实测 CloudCAD 前端功能（登录、CAD 编辑器、协同、多角色）的最快方法——工具选型（agent-browser 探路 / Playwright 脚本结晶 / 避开 control-browser 的 IAB 上限）、探路→结晶工作流、卡点解决（建测试账号、装 chromium、起服务）、等待策略（本仓库禁用 networkidle）、多浏览器多角色。凡是「用浏览器测一下前端」「验证页面/交互/登录」「多角色协同操作」「把这个测试流程固化成脚本」「为什么浏览器测试这么慢/卡住/白屏」都用它。
---

# 浏览器测试（CloudCAD 前端）

本技能沉淀了在本仓库实测前端功能时踩过的坑与最快路径。核心思想：**探路（agent-browser 交互）→ 结晶（Playwright 脚本）→ 复用（直接跑脚本）**。每次探路学到的卡点解法都要固化成脚本，下次不再卡。

## 一、工具选型（先选对工具再动手）

| 场景 | 工具 | 为什么 |
|---|---|---|
| 探路：新流程、一次性验证、需要看页面/点按钮/看 console | **agent-browser** | 自带 Chromium（CDP 驱动），无 IAB 的 10s 导航 / 3s 定位上限，`open` 实测 ~0.8s，能扛住 Vite dev 冷加载 + CAD 预载 |
| 结晶：稳定流程要反复跑（回归、CI） | **Playwright 脚本** | 确定性、可并行、最快；本仓库已有 `packages/frontend/e2e/`（fixtures + 20 个 page object + 8 个 spec） |
| ❌ 本仓库重型前端（Vite dev + CAD 编辑器） | 避免 control-browser（应用内 IAB） | IAB 有 10s 导航预算 + 3s 定位上限，Vite dev 冷模块图（CAD ≥400 模块 / ~10MB / 串行 ~8s）会超时卡死、白屏 |

**默认探路用 agent-browser。** 只有当流程已验证稳定、需要反复跑时才结晶成 Playwright 脚本。

**先确定测哪个前端**（本仓库有两个前端，测试形态不同）：

| 前端 | 包 | 端口 | 浏览器形态 |
|---|---|---|---|
| PC 端 | `packages/frontend`（React 19 + Vite） | 8000 | 桌面浏览器（agent-browser 默认宽视口） |
| 移动端 | `packages/frontend_mobile`（Vue 3 + Vant） | 7001 | **模拟手机**：`agent-browser set device "iPhone 14"`（移动视口 + 手机 UA + touch） |

- 测 **PC 前端**：agent-browser 默认桌面模式即可。
- 测 **移动端**：先 `agent-browser set device "iPhone 14"`（或 `"Pixel 7"`）切到手机形态，再 `open` 7001；Playwright 结晶则用 `devices['iPhone 13']` preset。

## 二、探路 → 结晶工作流

1. **探路**：用 agent-browser 走一遍流程，`snapshot -i` 拿 ref，逐步操作，观察页面 / console。目的：确认流程能走通、记下关键选择器与等待点。
2. **卡点解决**：每遇到一个卡点（没账号、没装 chromium、服务没起、加载卡住），解决它并**把解法固化**（脚本 / 命令），登记到本技能「卡点速查表」。
3. **结晶**：流程走通后，把它写成 Playwright 脚本（范式见 `references/playwright.md` 的 `login-flow.mjs`）。脚本要**编码探路学到的等待策略**（见下节），下次直接跑。
4. **复用**：以后测同一流程直接跑脚本，不再探路。脚本挂了再探路修脚本。

## 三、等待策略（本仓库铁律）

- **禁用 `networkidle`**：CAD 编辑器 + 协同 WebSocket 让网络永远活跃，`wait --load networkidle` 实测空等 28s。用 `waitForURL` / `waitForSelector` / `domcontentloaded`。
- **Vite dev 冷加载给足预算**：CAD 模块图 ≥400 模块 / ~10MB / 串行 ~8s。页面渲染等 30s、CAD 编辑器加载等 60s。生产构建快得多，但探路走的是 dev。
- **导航用 `domcontentloaded`**（不是 `load` / `networkidle`）：HTML shell 很快，模块执行才慢。
- **纯 `fetch` 只拿 HTML shell**（不执行模块），适合快速探活，不代表页面真正可用。

## 四、多浏览器 / 多角色

- agent-browser 用 `--session <name>` 开独立浏览器实例（各自独立 ref 空间与登录态）。
- **每个 session 操作前必须先 `snapshot`**：ref（@eN）是按 session、按 snapshot 分配的——只 `open` 不 `snapshot` 就 `fill @eN` 会报 `Unknown ref`（实测 user session 因此登录失败、停在 /login）。
- **跨 session 不能复用 ref**：admin session 的 @e14 在 user session 不存在。
- 登录态用 `state save <file>` 存、`--state <file>` 载入，避免每次重登。
- Playwright 侧：`e2e/fixtures/multi-role.fixture.ts`（按角色 storageState）、`e2e/fixtures/collab.fixture.ts`（userAPage / userBPage 双用户协同）。

## 五、卡点速查表

| 卡点 | 解法 | 结晶 |
|---|---|---|
| 没有测试账号 | 幂等建号（复用后端真实加密 / PII 路径） | `cd packages/backend && node --import tsx scripts/ensure-e2e-accounts.ts` |
| Playwright 报 `Executable doesn't exist ... chromium` | 装浏览器（**后台跑**，前台继续测） | `cd packages/frontend && npx playwright install chromium` |
| 前端 8000 没起 / 白屏 | 起 dev server | `cd packages/frontend && pnpm dev` |
| 后端 3001 没起 | 起后端 | `cd packages/backend && node dist/main`（或 `pnpm dev`） |
| 测 CAD 文件转换 / 协同才需要 3100 | 登录 / 普通页面**不需要**转换服务 | 按需起 conversion-service |
| agent-browser `Unknown ref: eN` | 该 session 没 snapshot 就用了 ref | 先 `snapshot -i` 再操作 |
| onboarding 引导弹窗挡住操作 | 首次登录某角色常弹引导，先点「稍后再说」关掉再继续 | 见 PC 创建项目流程 |
| Playwright 报 `Executable doesn't exist ...chromium_headless_shell` | `install chromium` 只装有头版，headless 要**单独装**（后台跑） | `cd packages/frontend && npx playwright install chromium-headless-shell` |

**慢卡点（装浏览器、起服务）用后台跑**，前台继续探路，别干等。

## 六、已结晶脚本清单（自动优化的产物区）

探路结晶出的脚本登记在这里。下次探路前先查这张表——流程已结晶就直接跑脚本，别再探路。

| 脚本 | 覆盖流程 | 用途 | 何时结晶 |
|---|---|---|---|
| `packages/backend/scripts/ensure-e2e-accounts.ts` | 建测试账号 | 卡点「没账号」的解法，幂等 | 2026-10-23 |
| `packages/frontend/e2e/scripts/login-flow.mjs` | 登录→进首页 | 一次性登录流程验证 | 2026-10-23（待 chromium 装完跑通确认） |

## 七、已知测试账号（ensure-e2e-accounts.ts 建的）

| 账号 | 密码 | 角色 |
|---|---|---|
| e2e-admin@example.com | E2eAdmin!2026 | ADMIN |
| e2e-user-a@example.com | E2eUser!2026 | USER |
| e2e-user-b@example.com | E2eUser!2026 | USER |

登录走 `POST /api/v1/auth/login`（account = 邮箱 / 用户名 / 手机号）。门禁：`status=ACTIVE` 且（`mailEnabled && requireEmailVerification` 时须 `emailVerified`）。

## 八、参考文档（按需读）

- `references/agent-browser.md` — agent-browser 完整命令 + 坑（session / ref / state / 等待）
- `references/playwright.md` — 把流程结晶成 Playwright 脚本的范式（config / fixtures / 等待策略 / login-flow 模板）
- `references/environment.md` — 服务环境搭建 + 测试账号 + 卡点解法细节

## 九、自动优化协议（主动沉淀，不等提醒）

本技能靠**主动沉淀**进化——**只要观察到值得记录的经验，当场就写进技能，不等用户提醒**。两层触发：
- **即时（主路径）**：测试 / 探路过程中，任何时候发现新卡点解法、新等待策略、新工具坑、被推翻的旧结论、端口 / 脚本 / 工具 / 设备形态变化，**当场**用 Edit/Write 写进本目录对应章节（技能在 `.agents/skills/browser-testing/` 可写）。判断标准一句话：这条经验下次还会用到吗？会 → 记。
- **定时（兜底）**：每周一定时任务复核——验证结晶脚本还能跑通、清理过时结论、补漏。

1. **新卡点解法** → 补进「五、卡点速查表」（已有同类则更新，不重复登记）。
2. **新结晶脚本** → 登记进「六、已结晶脚本清单」（脚本路径 + 覆盖流程 + 日期）。
3. **新等待策略 / 工具坑** → 补进「三、等待策略」/「四、多角色」或对应 `references/`。
4. **被推翻的旧结论** → 删除或标注「已推翻（日期 + 原因）」，别留误导。

**防污染规则**（保证技能越用越准、而不是越用越脏）：
- 只写**可复现事实**：确切命令、脚本路径、实测数字（如「空等 28s」）；不写一次性对话细节、不写当时的猜测。
- 写之前先 `grep` 本目录，确认没重复条目再写。
- `SKILL.md` 保持精简（选型 / 工作流 / 速查表），长细节进 `references/`。
- 回写**幂等**：同样的卡点 / 脚本不重复登记。
- 不确定的结论标「待验证」，跑通后再去掉标记。

这样技能随每次使用自动进化：探路是暂时的，结晶与卡点解法是永久沉淀，技能记录「哪些已结晶、哪些坑已踩平」。

## 十、执行纪律（timeout + 后台，别干等）

浏览器测试命令**必须**带时间限制，绝不无限等：
- **每个 Bash 调用都设 `timeout`**（agent-browser 的 open/snapshot/click 给 15-30s；完整多步流程给 60-120s）。agent-browser 的 open/snapshot 在 Vite dev 冷加载下可能卡住，无 timeout 会一直挂着拖死整条命令。
- **超过 ~10s 的操作放后台**（`run_in_background: true`）：装浏览器（`playwright install`）、起 dev server、完整多步流程。前台继续做别的，别干等。
- **串行操作（open→snapshot→click）拆成多个带 timeout 的短命令**，每步各自设限，避免某一步卡住把后面全拖死；不要拼成一条无 timeout 的长命令。
- 命令超时后：先探活（服务是否还活着 / 页面是否已渲染），再决定重试或转后台，不要盲目重发同一条长命令。

## 十一、认证 / 验证码分支测试（纯 API，不走浏览器）

要穷举认证模块（登录 / 注册 / 验证码 / 邮箱拦截 / 手机登录）的**全部分支**时，别用浏览器点页面——**curl 直接打后端 API** 最快最全（浏览器只适合验证 UI 渲染，不适合穷举后端分支）。核心手法（细节见 `references/environment.md`）：

- **mock 短信验证码从 Redis 拿**：`redis-cli -p 6380 -a wdx123456 GET sms_verification:code:+86<手机号>`（mock provider 不打可访问日志，码只存 Redis，`+86` 前缀）。
- **穷举验证分支**：用 Redis `SET`/`DEL` 控制 `code` + `verify_attempts:+86<phone>:<UTC日期>` 两个 key，再 `POST /auth/verify-sms-code` 触发——正确 / 错误递减(4→0) / 第6次 exhausted / 无码过期 全覆盖。
- **测拦截分支改数据库**：如未验证邮箱拦截，改 `users.emailVerified`（有邮箱未验证→`EMAIL_NOT_VERIFIED`；清空 email 三列→`EMAIL_REQUIRED`+tempToken）。**改 PII 列必须 trap 恢复**（备份原值，EXIT 时写回）。
- **60s 发送冷却**：同一手机号 60s 内只能 `send-sms-code` 一次，测多分支**换手机号**或 `sleep 65`（后台跑）。
- **PG/Redis 连接**：`psql -h localhost -p 5433 -U postgres -d cloudcad`（密码 `wdx123456`）、`redis-cli -p 6380 -a wdx123456`。
