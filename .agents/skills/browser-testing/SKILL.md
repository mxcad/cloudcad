---
name: browser-testing
description: 用浏览器实测 CloudCAD 前端功能（登录、CAD 编辑器、协同、多角色）的最快方法——工具选型（agent-browser 探路 / Playwright 脚本结晶 / 避开 control-browser 的 IAB 上限）、探路→结晶工作流、卡点解决（建测试账号、装 chromium、起服务）、等待策略（本仓库禁用 networkidle）、多浏览器多角色。凡是「用浏览器测一下前端」「验证页面/交互/登录」「多角色协同操作」「把这个测试流程固化成脚本」「为什么浏览器测试这么慢/卡住/白屏」都用它。
---

# 浏览器测试（CloudCAD 前端）

本技能沉淀了在本仓库实测前端功能时踩过的坑与最快路径。核心思想：**探路（agent-browser 交互）→ 结晶（Playwright 脚本）→ 复用（直接跑脚本）**。每次探路学到的卡点解法都要固化成脚本，下次不再卡。

> **下结论前先读「十三、E2E 发现判读」**：E2E 发现 ≠ 产品缺陷。发现异常时**先查设计决策（ADR/设计文档/实现注释的设计理由）→ 再排除测试环境因素 → 真实 API 复核 → 才定产品缺陷**；否则会把「BY DESIGN / 引擎黑盒 / 测试制品」当 bug 修，方向始终不对（2026-10-30 实测：24 项发现里约 1/3 经判读后不是产品缺陷，含设计误判、测试制品、功能缺失）。

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
| `packages/backend/scripts/e2e-auth-fixtures.ts` | **造任意分支前置态的临时用户**（`create`/`list`/`destroy`） | 认证分支测试的「摆前置」统一入口：`--no-password`（无密码/微信注册账号）`--phone + --phone-verified`（手机登录）`--email-unverified` / `--no-email`（`EMAIL_NOT_VERIFIED` / `EMAIL_REQUIRED` 拦截）`--status SUSPENDED` `--deleted-days -N`（注销冷静期内/超期，配 `--deactivated-by SELF\|ADMIN`）；复用后端真实 bcrypt/PII 路径，与登录校验零漂移。**并发隔离靠 username 前缀**（`w1l_`/`w2p_`…），测完 `destroy --like '<前缀>_'` | 2026-10-26 |
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
- `references/auth-e2e-playbook.md` — **认证模块浏览器 e2e 剧本**（登录/注册/验证码/忘记密码/邮箱·手机验证：逐流程 UI 选择器 + 分支前置用 DB/Redis 构造 + Redis 取码填 UI + 断言 + 收尾）

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

## 十二、认证模块浏览器 e2e（agent-browser 剧本，可重复跑）

要**用浏览器真操作页面**跑认证 e2e（验证 UI 渲染 + 流程走通，而非只打 API 看返回码）时，直接按 `references/auth-e2e-playbook.md` 的剧本执行——它把登录 / 注册 / 验证码 / 忘记密码 / 邮箱·手机验证六条流程的**逐步骤 + UI 选择器 + 分支前置构造 + Redis 取码 + 断言 + 收尾**都结晶好了。

- **主测法 = agent-browser 真操作页面**；DB/Redis 脚本**只在「构造某分支前置状态」时**用（如把用户 `emailVerified` 置 false 触发邮箱拦截、直建 phone 用户触发手机登录成功），改完立刻用浏览器走 UI 验证。
- **验证码从 Redis 拿、在 UI 里填**：UI 点「获取/发送验证码」触发后端 Mock 写码 → `redis-cli GET` 取 6 位码 → 填回 UI 验证码框。**不依赖真邮箱/真短信**，故可离线稳定复跑。
- **与第十一节的关系**：第十一节是「纯 API 穷举后端分支」（快、全、不看 UI）；本节是「浏览器 e2e」（看 UI、走真实用户路径）。两者互补——先跑本节验证 UI 流程，再用第十一节穷举后端边界分支。
- **移动端**：`agent-browser set device "iPhone 14"` 切手机形态后 `open 7001`，流程同 PC（选择器文案一致）。

## 十三、E2E 发现判读——发现 ≠ 缺陷（先查决策 + 排除环境）

> **这是本技能最重要的一节。** 2026-10-30 一轮 24 项 UI/UX 发现里，约 1/3 经判读后**不是产品缺陷**（含 2 项设计误判、1 项测试制品、1 项功能缺失、多引擎黑盒/固有行为）。若不做判读直接修，方向始终不对、还会误改正确代码。

**判读顺序（逐级收窄，每一步都在回答「这是真实缺陷吗」）：**

1. **先查设计决策**（第一优先，用户明确要求）：该行为在 ADR / 设计文档 / 实现注释的设计理由里有没有被有意决定？查到 → 判 **BY DESIGN**，不改码。典型：确认框 mustChoose 硬编码（`ConfirmDialog.tsx:30` 注释记录设计理由——CAD 中 Esc=取消绘图命令，破坏性确认必须挡 Esc+遮罩+×）、串行打开队列 enqueueOpen（`mxcadInstanceManager.ts:407` 有意防并发引擎打开，第二个打开排队而非丢弃）、IP 黑名单优先于白名单（ADR-0044 fail-close 安全性——这是「黑名单优先」为 BY DESIGN，真实缺陷另有其处，见下）。**查决策的坑**：设计理由常写在**实现注释**里而非独立文档；查 ADR 用 `docs/adr/` 索引，查实现注释 grep `BY DESIGN|设计理由|有意|勿动|铁律` 等关键词。
2. **再排除测试环境因素**：是不是我的测试方式制造的假象？GBK 终端 / 浏览器干扰 / 测试数据残留（详见下）。排除不了才进下一步。
3. **真实 API 复核**：涉及行为 / 编码 / DTO 的结论，用 curl 带 token 打真实端点比纯读代码更有说服力（实例：分享链接中文文件名编码——真实 API 返回 `fileName=%E9%98%B2...` 直接证明编码正确，否定「分享链接乱码」假缺陷）。
4. **才定产品缺陷**（或分类），再决定修不修。

**五分类（每个发现必须归入一类才结案）：**

| 分类 | 含义 | 处置 | 实例 |
|---|---|---|---|
| **真缺陷** | 产品确实坏了，且非有意设计 | 修 | 黑名单可加入回环地址（见下） |
| **BY DESIGN** | 行为被设计决策有意决定 | 不改码，文档标注 | mustChoose、enqueueOpen、黑名单优先于白名单 |
| **引擎黑盒** | 行为来自 mxcad/mxdraw 引擎内部，本仓库不可控 | 不改码，报引擎厂商或标注 | `_InsertImage` 原生对话框、引擎固有异步时序 |
| **测试制品** | 我的测试方式制造的假象 | 修正测试方式 | GBK 终端中文文件名 → U+FFFD 腐坏（编码其实正确） |
| **功能缺失** | 功能确实没有，但属产品范围/未立项 | 产品决策，不私加 | 分享无密码/权限（`file_shares` 无列、无 ADR 规划） |

**本次实例（判读如何改变结论）：**

- **BUG-PROJ-04/05（设计误判）**：先入为主当「bug」——`/cad-editor` 重定向 `/login` 被当缺陷，实际 `/cad-editor` 是**首页**、未认证用户本应可访问（用户更正）。教训：动「页面可达性 / 路由守卫」前先查路由设计与权限模型，别凭直觉修。
- **BUG-PROJ-08（测试制品）**：分享链接「乱码」——真实 API 验证编码正确（UTF-8 百分号编码），腐坏来自 DB 里已损坏的名称，唯一腐坏源是我用 GBK 终端发中文参数。**假 bug**。
- **BUG-PROJ-07（功能缺失）**：分享无密码/权限——查 `file_shares` 表无 password/permission 列、CreateShareDto 仅 fileId+expiresIn、UI 仅有效期、无 ADR 规划。结论 = 产品范围决策，非可私修的 bug。
- **BUG-CAD-02/06（BY DESIGN）**：mustChoose（确认框不可 Esc/遮罩关）、enqueueOpen（第二个打开排队）。查实现注释即明。
- **BUG-CAD-01/05（引擎黑盒/固有）**：`_InsertImage` 引擎原生对话框、引擎异步时序。本仓库不可控。
- **BUG-ADMIN-001（真缺陷，判读后发现真实 bug 与表象不同）**：表象「黑名单不生效」——查 ADR-0044 知黑名单优先于白名单是 BY DESIGN；**真实缺陷** = 可把回环地址（自恢复通道）加入黑名单且无保护。修 = 前后端硬阻止回环（400）。若不做判读，会去「修」黑名单优先逻辑（其实是正确的）而放过真缺陷。
- **USER-02**：同样是先查 ADR 才定位到真实缺陷点。

**判读前置工具（写测试用例前先做）：**

- **`docs/ui-ux-e2e-findings-<date>.md`**：发现记录模板（ID / 现象 / 步骤 / 期望 / 实际 / 判读分类 / 证据 / 结论）。每个发现必须带判读分类与证据才结案。
- 查设计决策的顺序：`docs/adr/` 索引 → 相关模块设计文档（`docs/design/`）→ 实现注释。**实现注释经常是设计理由的唯一落点**（本仓库大量「有意 / 勿动 / BY DESIGN」写在代码注释里）。

### 测试环境因素排除（制造假 bug 的两大来源）

1. **GBK 终端污染 → 腐坏数据**（2026-10-30 实测定案）：中文 Windows Git Bash 里用 curl 发中文参数（JSON body / URL）会发 **GBK 字节**，后端按 UTF-8 解码 → `U+FFFD`（�）腐坏 → DB 里存进坏名 → 后续功能（分享链接、文件名显示）看似「乱码」→ **误判为产品 bug**。判据与解法：
   - 判据：腐坏字符是 `�`（U+FFFD）；用英文/ASCII 参数复现不腐坏；DB 里该字段确实是坏字节。
   - 解法：**发多字节参数一律显式 UTF-8**——写进临时 `.json` 文件用 `--data-binary @file`（curl 读文件是字节原样，不经过终端编码），或改用 Node 脚本（`execFileSync` + `buf.toString('utf8')`）发请求。**别在终端字面量里写中文再传给 curl**。
   - 推论：得出「编码/乱码/文件名」类产品缺陷结论前，**必须**用真实浏览器（恒发 UTF-8）或 UTF-8 显式请求复核一次，排除环境因素。
2. **浏览器会话干扰 → 快照与截图不同步**（2026-10-30 实测）：共享 agent-browser 的 `default` 会话可能被**并行/残留进程导航到其他页面**（`session list` 只显示 `default` 仍受影响）；`screenshot` 可能命中非当前操作的标签页，与 `snapshot` DOM 不同步 → 截图看着像 bug 实际不是。解法：
   - **每个独立验证任务用显式 `--session <name>`**（不共用 `default`）。
   - **以 `snapshot -i` 的 DOM 为权威**，`screenshot` 只作辅助视觉；快照与截图不一致时以快照为准。
   - 测完 `agent-browser close --all` 清守护进程，避免残留 daemon 污染下一轮。

### 真实 API 复核（判读前置工具，从「仅认证分支」推广到「任何结论」）

第十一节的「纯 API 打后端」**不只用于认证分支**——任何模块结论要下「产品缺陷」定论前，先 curl 带 token 打真实端点复核一次（行为/编码/DTO/状态码）。比纯读代码更可靠，比浏览器更快更少干扰。实例：分享编码、黑名单 400/201、项目软删除，全部用真实 API 定案。

- **取 token**：`curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"account":"e2e-admin@example.com","password":"E2eAdmin!2026"}'` → 解析 `data.accessToken`。
- **打 API**：`curl -s -X <METHOD> http://localhost:3001/api/v1/<path> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ...`。
- **中文参数用 `--data-binary @file`**（见上 GBK 坑）。
- 前端走 Vite 代理时用 `localhost:8000/api/v1/...`（经代理）或直连 `3001`（绕过代理）均可；直连 3001 更少干扰。

### 测试数据清理（真实测试写 DB，测后必清）

真实 API / 浏览器测试会写进 DB（分享、IP 黑名单、项目、用户）。测完清理，否则污染下一轮（残留分享影响列表、残留黑名单影响后续登录验证）：
- **分享**：删 `file_shares` 对应行（或走 `DELETE /api/v1/shares/:id`）。
- **IP 黑名单**：删 `ip_blacklists` 测试条目。
- **项目**：`projects` 表软删（`deletedAt`）或真删，按模块约定。
- **用户**：`users` 行 + `refresh_tokens` 级联（见 environment.md 第十一节模式）。
- **原则**：每个真实写库测试的脚本都带**收尾清理**（trap EXIT 写回备份值 / 删测试条目），别裸跑。

### 从发现走向修复的配套坑（E2E 触发前端改动时常见）

E2E 发现常以「改前端文案 / 加错误提示」收尾，改 `packages/frontend` 文案时三个坑（2026-10-30 实测 BUG-ADMIN-001 修复）：

- **i18n 新键 = 4 个语言文件 + idMap.json，且 idMap 值必须是 `number`**：`src/languages/messages/idMap.json` 的 idMap 值必须为数字（类型 `Voerkai18nIdMap` 要求 number，写字符串会 tsc 报错 `Type 'string' not assignable to type 'number'`）。改法：在 `{zh-CN,zh-TW,en-US,ko-KR}.ts` 各加 `"1000317": "文案"`，再在 `idMap.json` 加 `"文案": 1000317`（数字）。
- **新键 ID 用现有最大 + 1**：`src/languages/messages/idMap.json` 现有最大 ID 是 1000316，新键用 1000317；加之前先 grep idMap 确认无重复键（JSON 重复键最后获胜，会静默覆盖）。
- **改完跑前端 `pnpm type-check`**（不是 npx tsc），再跑相关 vitest。
