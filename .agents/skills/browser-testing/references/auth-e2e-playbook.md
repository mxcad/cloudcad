# 认证模块 e2e 剧本（agent-browser 为主 + DB/Redis 构造分支前置）

把认证模块（登录 / 注册 / 验证码 / 忘记密码 / 邮箱·手机验证）的 e2e 结晶成**可重复执行的 agent-browser 剧本**。核心原则：

- **浏览器是主测法**：用 agent-browser 真操作页面（填表、点按钮、看渲染、看 console），验证的是「用户真实会看到什么、流程能不能走通」。
- **DB/Redis 脚本只是「构造分支前置」的必要手段**：某些分支的前置状态（用户是否已验证邮箱/手机、通道开关、验证码值）无法从 UI 造出来，才用 `psql`/`redis-cli` 直接改数据把页面「摆到」那个分支的入口。改完立刻用浏览器走 UI 验证。
- **验证码从 Redis 拿、在 UI 里填**：mock 短信/邮件 provider 不真发信，码只写进 Redis。剧本在 UI 点「获取/发送验证码」触发后端写码，再从 Redis `GET` 出 6 位码填回 UI 的验证码框——**不需要真邮箱/真短信**，故 e2e 可离线稳定复跑。

> 纯后端分支穷举（不关心 UI 渲染、只要打 API 看返回码）走 `environment.md` 的 curl 手法，更快更全。本剧本是「浏览器 e2e」——两者互补，不重复。

---

## 0. 前置（每次跑剧本前）

1. **服务在跑**：frontend 8000（PC）/ frontend_mobile 7001（移动）、backend 3001、config-service 3002、PG 5433、Redis 6380。缺谁起谁（见 `environment.md`）。
2. **测试账号就绪**：`cd packages/backend && node --import tsx scripts/ensure-e2e-accounts.ts`（幂等建 e2e-admin / e2e-user-a / e2e-user-b，密码见 `environment.md`）。
3. **连 PG / Redis**（后台脚本用全路径，见 `environment.md`）：
   ```bash
   export PGPASSWORD=wdx123456
   PSQL="<repo>/runtime/windows/postgresql/pgsql/bin/psql.exe"
   REDIS="<repo>/runtime/windows/redis/redis-cli.exe"
   $PSQL -h localhost -p 5433 -U postgres -d cloudcad -c '...'
   $REDIS -p 6380 -a wdx123456 --no-auth-warning GET '...'
   ```
4. **运行时配置开关**（决定 UI 渲染哪些字段/走哪个分支）：`mailEnabled` / `requireEmailVerification` / `smsEnabled` / `requirePhoneVerification` / `allowRegister`。改开关**走 API**（`PUT /api/v1/runtime-config/:key`）或改 DB 后 `DEL` 对应 Redis `runtime_config:<key>` 缓存键——**外部改 DB 不刷新缓存，页面读到的还是旧值**（详见 `environment.md`）。
5. **agent-browser 会话**：`agent-browser --session <name>` 开独立实例；**操作前先 `snapshot -i` 拿 ref**（只 `open` 不 `snapshot` 就 `fill @eN` 会 `Unknown ref`）。移动端先 `agent-browser set device "iPhone 14"`。

**验证码 Redis 键**（`+86` 前缀只在短信）：

| 通道 | 码键 | 频率限制键 | 尝试计数键 |
|---|---|---|---|
| 短信 | `sms_verification:code:+86<手机号>` | `sms_verification:rate_limit:<手机号>` | `sms_verification:verify_attempts:<手机号>:<UTC日期>` |
| 邮箱 | `email_verification:code:<邮箱>`（**无 +86**） | `email_verification:rate_limit:<邮箱>` | `email_verification:verify_attempts:<邮箱>:<UTC日期>` |

---

## 1. 登录（密码）— `/login`

**UI 选择器**（`getByRole`/`getByLabel` 优先，文案兜底）：
- 账号框：`label`「邮箱或用户名」/ placeholder「请输入邮箱或用户名」（sms+mail 双开时是「请输入手机号、邮箱或用户名」）
- 密码框：`label`「密码」
- 按钮：「立即登录」
- 链接：「立即注册」「忘记密码？」

**剧本**：
1. `open http://localhost:8000/login`（移动 7001）→ `snapshot -i`。
2. 填账号（`e2e-user-a@example.com`）、密码（`E2eUser!2026`）。
3. 点「立即登录」→ 等 `waitForURL` 离开 `/login`（**别用 networkidle**）。
4. **断言**：URL 不再是 `/login`（进首页 `/`）；顶部出现用户名/头像。

**分支前置（DB 构造）**：
- **未验证邮箱拦截**（`mailEnabled && requireEmailVerification` 时）：把目标用户 `emailVerified` 置 `false`（有邮箱未验证 → 登录 401 `EMAIL_NOT_VERIFIED`，UI 应跳邮箱验证页）；清空 `email`/`emailEnc`/`emailHmac` 三列 → `EMAIL_REQUIRED`+tempToken（UI 跳邮箱绑定）。**改 PII 列必须 trap 恢复**。
- **账号停用**：`status` 置 `SUSPENDED` → 登录被拒。
- 测完恢复 `emailVerified=true` / `status=ACTIVE`。

---

## 2. 登录（手机验证码）— `/login` 手机 tab

**UI 选择器**（`PhoneLoginForm`）：手机号框「请输入手机号」、验证码框「请输入验证码」+ 按钮「获取验证码」、按钮「立即登录」。

**剧本**：
1. `open /login` → 切到手机验证码登录 tab → `snapshot -i`。
2. 填手机号（如 `13700009876`）→ 点「获取验证码」（后端 Mock 发码，写 Redis）。
3. 从 Redis 取码：`$REDIS ... GET 'sms_verification:code:+8613700009876'`。
4. 填验证码 → 点「立即登录」。
5. **断言**：进首页；若手机号未注册 → 提示 `PHONE_NOT_REGISTERED`（`allowAutoRegisterOnPhoneLogin=false` 时）。

**分支前置（DB 构造）**：
- **已注册手机号登录成功**：login-phone 成功路径只查「码有效 + 用户存在 + 发 token」，**不查 `smsEnabled`/`requireEmailVerification`**；`send-sms-code` 走 Mock，`smsEnabled=false` 也能发码。所以**不必开 `smsEnabled`**——直接往 `users` 插一个 `phone`/`phoneVerified=true` 的用户（PII 列复用后端纯函数：`phoneHmac=hmacIndex(normalizePhone(phone), PII_HMAC_KEY)`、`phoneEnc=encryptPii(phone, PII_ENCRYPTION_KEY)`，密钥在 `packages/backend/.env`，建号模式参考 `ensure-e2e-accounts.ts`）。测完删用户 + 清 `sms_verification:*<phone>*`。
- **未注册手机号**：用任意未入库手机号 → 应得 `PHONE_NOT_REGISTERED`。

---

## 3. 注册（两步）— `/register`

**Step 1（BasicInfoStep）选择器**：
- 用户名 `#username`「请输入用户名」（必填）
- 昵称 `#nickname`「请输入昵称（可选）」
- 邮箱 `#email`「请输入邮箱地址」（仅 `mailEnabled && requireEmailVerification` 渲染）
- 手机号 `#phone`「请输入手机号」（仅 `smsEnabled && requirePhoneVerification` 渲染，maxLength 11）
- 验证码 `#code`「请输入验证码」+ 按钮「获取验证码」（disabled 直到手机号满 11 位，倒计时显示 `Xs`）
- 协议 `#agreedToTerms`（「我已阅读并同意《用户协议》和《隐私政策》」）
- 按钮「下一步」

**Step 2（PasswordStep）选择器**：
- 密码 `#password`（placeholder 由生效口令策略推导，别写死）
- 确认密码 `#confirmPassword`「请再次输入新密码」
- 按钮「返回」「立即注册」

**剧本（默认分支：邮箱验证开、手机验证关）**：
1. `open /register` → `snapshot -i`。
2. Step1：`fill` 用户名/昵称/邮箱 → **`check @eN` 勾协议**（用 `check` 不是 `click`，实测 `click` 可能不 toggle）→ 点「下一步」（`click @eN` 对 onClick 按钮同样有效，见 §8；ref 按 §8 精确提取，按钮在快照里认不出时才 `eval` 兜底）。
   - 若协议没勾上，「下一步」会弹**「注册确认」模态框**（"请先阅读并同意…"，按钮「取消」/「同意并继续」）→ 重新 snapshot 后点「同意并继续」（eval 兜底亦可）即可勾选并进入 step2。
3. Step2：`fill` 密码/确认密码（满足策略）→ `click`「立即注册」（`type="submit"`，普通 click 即可）。
4. 后端 `register()` 发邮箱验证码（写 Redis `email_verification:code:<邮箱>`）→ 若 `requireEmailVerification` 且未验证，UI 跳 `/verify-email`。
5. 邮箱验证：从 Redis 取码 → `fill #code` → 点「验证」（`click @eN`，eval 兜底）→ 成功进首页（`/cad-editor`）。
6. **断言**：`eval "location.pathname"` 进 `/cad-editor`（已登录）；DB `users` 有该用户且 `emailVerified=true`。

**分支前置（DB/Redis 构造）**：
- **邮箱验证分支**：`mailEnabled=true && requireEmailVerification=true` → Step1 出现邮箱框；注册后跳 `/verify-email`，从 Redis `GET email_verification:code:<邮箱>` 取码填回验证。
- **手机验证分支**：`smsEnabled=true && requirePhoneVerification=true` → Step1 出现手机+验证码框；填手机号点「获取验证码」→ 从 Redis `GET sms_verification:code:+86<手机>` 取码填 `#code`。
- **注册关闭**：`allowRegister=false` → 页面渲染 `RegisterClosed`（无表单）。
- **邮箱必填拦截**：`requireEmailVerification=true` 但用户没填邮箱 → 后端 `error.user.email_required`（UI 红框）。

---

## 4. 忘记密码 → 重置密码 — `/forgot-password` → `/reset-password`

**忘记密码（ForgotFormView）选择器**：
- 双通道开时出现 `Tabs`（「邮箱」/「手机号」）切换
- 邮箱 `#email`「请输入邮箱地址」/ 手机 `#phone`「请输入手机号」
- 按钮「发送验证码」
- 按钮「返回登录」
- 双通道都关 → `NoChannelView`；提交后两通道都关 → `SupportView`

**重置密码（ResetPassword）选择器**：
- 邮箱 `#email`（readOnly，来自上一步 state）/ 手机 `#phone`（readOnly）
- 验证码 `#code`「请输入6位验证码」
- 新密码 `#newPassword`（placeholder 由策略推导）
- 确认新密码 `#confirmPassword`「请再次输入新密码」
- 按钮「重置密码」「返回登录」

**剧本**：
1. `open /forgot-password` → `snapshot -i`。
2. 选通道（默认邮箱）→ 填邮箱/手机 → 点「发送验证码」（后端写码进 Redis）。
3. 从 Redis 取码（邮箱 `email_verification:code:<邮箱>` / 手机 `sms_verification:code:+86<手机>`）。
4. 进 `/reset-password`（成功页点「去重置密码」）→ 填验证码 + 新密码 + 确认 → 点「重置密码」。
5. **断言**：成功页「密码重置成功」→ 自动跳 `/login`（带「密码重置成功，请使用新密码登录」）→ 用新密码能登录。

**分支前置**：
- **不存在邮箱**：后端对不存在邮箱也真发「说明信」（Google 模式），前端文案诚实——UI 仍走成功页，不报错。
- **双通道都关**：`mailEnabled=false && smsEnabled=false` → 页面直接 `NoChannelView`（无表单）。

---

## 5. 邮箱验证 — `/verify-email`

**选择器**（VerificationForm）：邮箱 `#email`「请输入邮箱地址」、验证码 `#code`「请输入6位数字验证码」、按钮「验证」、按钮「发送验证邮件」/「重新发送验证邮件」、按钮「返回登录」。

**剧本**：
1. `open /verify-email`（或从注册/登录拦截跳来，state 带 `email`）。
2. 页面自动代发码（登录流程 `EMAIL_NOT_VERIFIED`）或标记「已发送」（注册流程已发过）。
3. 从 Redis `GET email_verification:code:<邮箱>` 取码 → 填 `#code` → 点「验证」。
4. **断言**：成功页（`SuccessView`）→ 自动跳首页。

---

## 6. 手机验证 — `/verify-phone`

**选择器**（PhoneVerification）：手机号 `#phone`「请输入手机号」（仅 bind 模式）、验证码 `#code`「请输入6位数字验证码」、按钮「验证」（disabled 直到码满 6 位）、按钮「发送验证码」/「重新发送验证码」、按钮「返回登录」。

**⚠️ 关键坑（2026-10-23 受控实验修正）：本页「发送验证码」「验证」按钮是 `type="button"` + `onClick`（非表单 submit，代码侧问题已记 Gitea #509）。早期「agent-browser click 不触发它们的 onClick、必须 curl」是**误诊**——失败全是选择器 bug（XPath 不可用 / grep 命中卡片行 / 结构性变化后没重 snapshot，见 §8）。`click @eN` 对两种按钮都有效，本页同样能用普通 click 走通；ref 拿不对时 `eval` 兜底（仍优于 curl）。仍成立的事实：
- **curl 只作最后兜底**（click 与 eval 都失败时）：优先驱动 UI 按钮触发真实 API。
- 后端端点是 **`POST /auth/bind-phone-and-login`**（@Public，body 带 `tempToken`+`phone`+`code`），**不是** `POST /auth/bind-phone`（后者需登录态，给已登录用户换绑，curl 无 token 会 401）。
- **bind 场景发码受 `smsEnabled` 门禁**（`account-binding.service.ts`：`smsEnabled=false` 抛「短信服务未启用」）——与 login-phone 场景（走 Mock、不查 smsEnabled）不同。测手机绑定前须先 `smsEnabled=true`（DB+DEL Redis 缓存，绕开 P2022 API bug）。
- **前置条件必须在页面加载前设好**：前端 `useRuntimeConfig` 在页面加载时拉一次配置并缓存，运行中改 `smsEnabled` 客户端看不到（同后端 Redis 缓存陈旧，只是发生在前端侧）。要开 `smsEnabled` 就**先改配置再 `open` 页面**，别在已加载的页面上改。
- **tempToken TTL = 30 分钟**（JWT `bind_phone_temp`，exp-iat=1800s）：登录→发码→验证要在这 30 分钟内完成；且登录到验证之间**不能整页刷新**（`location.state` 里的 tempToken 会丢）。

**剧本（bind 模式，agent-browser 为主 + 普通 click，eval 兜底）**：
1. **前置**：确认 `smsEnabled=true`（DB+DEL 缓存），**再** `open /login`（前端加载时缓存配置）。
2. 登录一个**无手机号**的用户（如 `e2e_user_b`）→ 后端返 `PHONE_REQUIRED`+tempToken → UI 自动跳 `/verify-phone`（bind 模式）。
3. UI `fill #phone`（如 `13700009877`）。**fill 后重新 `snapshot` 确认「发送验证码」已启用再操作**（fill 触发 React 重渲染才启用按钮，立刻点会点到 disabled 按钮 = 静默 no-op）。
4. **发码**：`click @eN`「发送验证码」（ref 按 §8 精确提取；快照里认不出时 `eval` 兜底：`agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='发送验证码')?.click();'ok'"`）→ 从 Redis `GET sms_verification:code:+8613700009877` 取 6 位码。
5. UI 把码 `fill #code`（验证 UI 码输入渲染 + 6 位校验）。
6. **验证**：`click @eN`「验证」（eval 兜底同第 4 步）→ 走 `bindPhoneAndLogin`（`POST /auth/bind-phone-and-login`，@Public，body 带 tempToken）→ 成功后 `window.location.href='/'` 整页刷新进首页。
7. **断言**：`eval "location.pathname"` 应为 `/`（或 `/cad-editor`）；DB `users.phone`/`phoneVerified` 已写入。

**`eval` 也不可用时的 curl 兜底**：发码 `curl -X POST /api/v1/auth/send-sms-code -d '{"phone":"...","scene":"bind"}'`；验证 `curl -X POST /api/v1/auth/bind-phone-and-login -d '{"tempToken":"...","phone":"...","code":"..."}'`（tempToken 从登录响应拿）。走 curl 时 UI 不会自动跳首页，UI 验证点退化为「绑定页渲染 + 输入 + 6 位校验」。

**非 bind 模式**（已有手机未验证，`location.state.phone` 有值）：页面直接可发码，其余同上。

---

## 7. 断言与收尾（通用）

**断言手法**（agent-browser）：
- **URL**：`waitForURL` 离开/到达目标路径（登录成功离开 `/login`；验证成功进 `/`）。
- **页面文案**：`snapshot` 后看关键文案（「密码重置成功」「手机号验证成功」「立即登录」消失）。
- **console**：看有无未捕获异常 / 4xx-5xx 报错（后端 NestJS Logger 也可交叉印证）。
- **登录态**：进首页后顶部出现用户名/头像；或 localStorage 有 `accessToken`。

**收尾（每次跑完必做，避免污染下次）**：
1. 删本次为构造分支直建的临时用户（`DELETE FROM users WHERE username='...'`，`refresh_tokens` 外键级联）。
2. 清验证码 Redis 键：`$REDIS ... KEYS 'sms_verification:*<phone>*'` / `email_verification:*<email>*` 逐个 `DEL`。
3. 恢复被 trap 改过的 PII 列 / `status` / 运行时配置开关到原始值（改配置记得 `DEL runtime_config:<key>` 缓存）。
4. 关掉 agent-browser 会话（或 `state save` 留登录态供下次复用）。

---

## 8. 稳定性铁律（本仓库专属）

- **`click @eN` 对 onClick 按钮和 submit 按钮都有效——前提是 ref 拿对**（2026-10-23 受控实验钉死，推翻旧结论）：早期「CDP 点击不触发 onClick、必须 eval」是**误诊**——所有失败都是选择器 bug。实测：表单外「立即注册」（onClick→导航）普通 `click @e11` 直达 `/register`；忘记密码流程「发送验证码」「前往重置密码」「重置密码」三个按钮全部普通 click 走通，**零 eval 兜底**。
  - **选择器三坑**（踩过的，按命中率排序）：
    1. **XPath 选择器在 v0.27.0 不可用**：`click "//button[contains(., 'x')]"` 恒报 `Element not found`。只用 **`@eN` ref** 或 **CSS 选择器**（`fill "#email" "..."` 实测可用）。
    2. **ref 提取别用裸文本 grep**：快照首行是 generic 卡片，其 name 含**整页文本**——`grep '立即注册'` 先匹配到卡片（ref=e1），点的是卡片中心（实测落到密码框）。必须 `grep 'button "立即注册"'` 精确匹配按钮行；快照行格式 `- button "文本" [ref=eN]`，使用时是 `@eN`（剥 `ref=` 不是剥 `ref`）。
    3. **结构性 DOM 变化后必须重新 `snapshot`**（步骤切换/模态框/页面跳转）；原地重渲染（fill→按钮启用）后旧 ref 仍有效（实测），但关键点击前重 snapshot 是安全习惯。
  - **`eval` 的 `element.click()` 保留为兜底**（按钮在快照里认不出、或 click 连续失败时）：
    ```
    agent-browser --session <s> eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '下一步')?.click(); 'ok'"
    ```
    驱动真实 UI 按钮（连导航/成功页都验证到），仍优于 curl；curl 只作最后兜底。
  - **submit 按钮空表单不触发提交**（实测：空字段点「立即登录」无 submit 事件）——先 fill 完字段再点 submit 按钮（流程天然如此，别指望空表单点击）。
  - **checkbox 用 `check @eN`**（不是 `click`）：`click` 勾选框实测可能不真正 toggle（注册协议勾选后仍 `checked=false` 导致「下一步」弹「注册确认」模态框）。
- **fill 后条件启用的按钮要重新 `snapshot` 确认启用再点**：如手机绑定页「发送验证码」disabled 直到手机号满 11 位；`fill` 触发 React 重渲染才启用，`fill` 和 `click` 拼在同一条命令里立刻点会点到 disabled 按钮 = 静默 no-op。fill → 重新 snapshot 确认无 `[disabled]` → 再 click。
- **禁用 `networkidle`**：CAD + 协同 WebSocket 让网络永远活跃，`wait --load networkidle` 实测空等 28s。认证页虽轻，仍统一用 `waitForURL`/`waitForSelector`/`domcontentloaded`。
- **操作前先 `snapshot -i`**：ref 按 session 按 snapshot 分配，只 `open` 不 `snapshot` 就 `fill @eN` 报 `Unknown ref`。
- **每个 Bash 带 timeout**（open/snapshot/click 给 15-30s，多步流程 60-120s）；**>10s 的操作放后台**（起服务、装浏览器）；**能不等就不等**——慢操作（浏览器 open / 装浏览器 / 建号）放后台，转去做并行的前置检查（DB/Redis 状态），查后台结果用非阻塞 `Read`/`cat` 输出文件，别 `TaskOutput block` 干等。
- **验证码 TTL 15 分钟**：取码到填码别拖过 15 分钟，否则 `expired`；重发有 60s 冷却（同手机号/邮箱），测多分支换号或 `sleep 65`。
- **改运行时配置走 API 或 DB+DEL 缓存**：外部改 DB 不刷新 Redis 缓存，页面读到旧值（详见 `environment.md`）；且前端 `useRuntimeConfig` 也在页面加载时缓存配置，**运行中改配置客户端看不到**——要改就改完再 `open` 页面。
- **移动端**：`agent-browser set device "iPhone 14"` 切手机形态再 `open 7001`；PC 用默认桌面宽视口。
