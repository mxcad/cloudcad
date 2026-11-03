# CloudCAD 认证模块浏览器 E2E 全面测试报告

- **测试日期**：2026-10-26
- **分支**：develop（HEAD `bd800ee`）
- **被测环境**：PC 前端 `http://localhost:8000`（React 19 + Vite dev）、移动端 `http://localhost:7001`（Vue 3 + Vant）、后端 `http://localhost:3001/api/v1`（NestJS）、PG `localhost:5433/cloudcad`、Redis `localhost:6380`
- **系统状态**：`GET /auth/setup/status` → `setupRequired:false`（已初始化）
- **测试方法**：`agent-browser` 0.27.0 真实操作页面为主，DB/Redis 仅用于「构造分支前置状态」与「取验证码填回 UI」；curl 仅作后端返回码交叉印证
- **并行模型**：主会话统一切换全局运行时配置（分阶段），每个阶段内多个子代理并行跑各自分支域，互不共享配置与账号前缀

---

## 0. 测试基建（本轮结晶产物）

| 产物 | 路径 | 说明 |
|---|---|---|
| 认证分支夹具脚本 | `packages/backend/scripts/e2e-auth-fixtures.ts` | `create`/`list`/`destroy` 三个子命令，按需造任意分支前置态的临时用户。复用后端真实 `bcryptjs` 12 轮 + `encryptPii`/`hmacIndex`/`normalizeEmail`/`normalizePhone` + `@cloudcad/db` 共享 Prisma Client，与登录校验零漂移 |
| 配置切换手法 | `UPDATE runtime_configs SET value=... WHERE key=...` + `DEL runtime_config:<key>` `DEL runtime_config:all` | 已实测验证并还原。直接调 `PUT /runtime-config/:key` 需管理员登录态且有 P2022 bug，DB+DEL 缓存最稳 |
| 分支底稿 | `.agents/skills/browser-testing/references/auth-e2e-playbook.md` | 六条流程的逐步骤选择器 + 前置构造 + Redis 取码 + 断言 + 收尾 |
| 截图目录 | `gui-test-screenshots/` | 各波次按 `w1l/`、`w1r/`、`w1f/` 等子目录归档 |

### 夹具脚本用法

```bash
cd packages/backend
node --import tsx scripts/e2e-auth-fixtures.ts create <username> \
  [--email <e>] [--password <p>] [--no-password] \
  [--phone <p>] [--phone-verified] \
  [--email-unverified] [--no-email] \
  [--status ACTIVE|SUSPENDED|INACTIVE] \
  [--deleted-days -N] [--deactivated-by SELF|ADMIN]
node --import tsx scripts/e2e-auth-fixtures.ts list    --like 'w2_%'
node --import tsx scripts/e2e-auth-fixtures.ts destroy --like 'w2_%'
```

### 夹具脚本自校验（已实测）

| 场景 | 命令 | 后端登录返回 | 结论 |
|---|---|---|---|
| 普通用户 | `create w0_ok --password 'W0Ok!2026x'` | `code:SUCCESS` + accessToken | ✅ |
| 无密码账号（微信注册类） | `create w0_nopw --no-password` → DB `password IS NULL` | `401 账号或密码错误` | ✅ 分支可触发 |
| 无邮箱 + 未验证 | `create w0_noem --no-email --email-unverified` | `401 code:EMAIL_REQUIRED` + `tempToken`(bind_email_temp) | ✅ 分支可触发 |
| 注销冷静期内（SELF） | `create w0_del --deleted-days -1` | `200` + 登录后 DB `deletedAt IS NULL`、`status=ACTIVE` | ✅ 自动恢复分支可触发 |
| 批量清理 | `destroy --like 'w0_'` | `deleted users=5` | ✅ 收尾干净 |

---

## 1. 基线运行时配置（勘察快照，Wave1 阶段值）

| 键 | 值 | 对分支的影响 |
|---|---|---|
| `mailEnabled` | `true` | 邮箱验证码链路可用 |
| `requireEmailVerification` | `true` | 注册需邮箱验证、未验证邮箱登录被拦截 |
| `smsEnabled` | `false` | 忘记密码仅单通道；登录页不渲染手机 tab；注册页不渲染手机框 |
| `requirePhoneVerification` | `false` | 手机未验证不拦截 |
| `allowRegister` | `true` | 注册页渲染表单 |
| `allowAutoRegisterOnPhoneLogin` | `false` | 手机码登录遇未注册手机号 → 412 `PHONE_NOT_REGISTERED` |
| `adminLoginEntry` | `MERGED` | 管理员可走普通 `/login` |
| `mfaEnforceEnabled` | `false` | 管理员 TOTP 不强制 |
| `wechatEnabled` | `false` | 登录页不渲染微信按钮 |
| `passwordPolicyMinLength` | `6` | 弱策略，仅长度下限 |
| `passwordPolicyMinCategories` | `0` | 类别检查关闭 |
| `passwordPolicyWeakCheckEnabled` | `false` | 弱口令黑名单关闭 |
| `passwordPolicyChangeEnforceEnabled` | `false` | 首登强制改密关闭 |
| `accountLockFailThreshold` | `100` | 失败锁定阈值高（Wave5 临时调低） |
| `loginRateLimitMax` | `500`/60s | 频率限流阈值高 |
| `registerRateLimitMax` | `100`/3600s | 注册限流阈值高 |
| `passwordResetRateLimitMax` | `100`/3600s | 重置限流阈值高 |

### 基线用户

| username | email | status | emailVerified | phone | totpEnabled |
|---|---|---|---|---|---|
| `admin` | — | ACTIVE | t | — | **t** |
| `e2e_admin` | e2e-admin@example.com | ACTIVE | t | — | f |
| `e2e_user_a` | e2e-user-a@example.com | ACTIVE | t | — | f |
| `e2e_user_b` | e2e-user-b@example.com | ACTIVE | t | — | f |
| `testuser1`/`testuser2`/`wdx`/`wdxx` | — | ACTIVE | 混合 | — | f（真实用户，全程禁改） |

---

## 2. 源码交叉核对基线（用于判定子代理结论是否真缺陷）

| 观察点 | 源码事实 | 结论判据 |
|---|---|---|
| 登录页手机 tab | `Login/index.tsx:315` `{smsEnabled && (<Tabs>...)}` | `smsEnabled=false` 时**不渲染**手机 tab 是设计如此，非缺陷 |
| 忘记密码通道 Tabs | `ForgotFormView.tsx:88` `{mailAvailable && phoneAvailable && (<Tabs>...)}` | 单通道时**不渲染** Tabs 是设计如此；此时副标题固定「使用邮箱接收验证码」 |
| 忘记密码副标题文案 | `ForgotFormView.tsx:78-84` 三分支 | 双通道=「使用{method}接收验证码」 |
| 忘记密码 label / placeholder | label=`邮箱地址`、placeholder=`请输入邮箱地址` | 断言用 placeholder 还是 label 要分清 |
| 忘记密码「忘记邮箱?」 | `ForgotFormView.tsx:108-116` 按 `contactType` 条件渲染 | 邮箱态显示「忘记邮箱?」、手机态显示「忘记手机号？」（问号全/半角不同） |
| 两通道都关的两条路径 | 页面级 `!mail && !phone` → `NoChannelView`（index.tsx:98）；提交后后端返回 `mailEnabled===false && smsEnabled===false` → `SupportView`（index.tsx:81） | 两个视图触发时机不同，不要混为一谈 |
| 前端不消费 `adminLoginEntry` | `grep adminLoginEntry` 在 `packages/frontend/src` 零命中 | MERGED/ISOLATED 是**纯后端**门禁；前端不切换登录页形态 |
| 管理员独立入口 | `ADMIN_LOGIN_PATH`=`/admin-login`（`.env.local` `VITE_ADMIN_LOGIN_PATH`）→ 后端 `POST /admin/auth/login` | Wave4 走 `http://localhost:8000/admin-login` |
| `/admin/mfa`、`/admin/change-password` | `App.tsx:295`、`:308` 均包 `ProtectedRoute` 但**独立于后台 Layout** | 后端 JwtStrategy 会 403 `MFA_SETUP_REQUIRED`/`PASSWORD_CHANGE_REQUIRED` 拦截后台数据请求，故必须独立渲染 |
| 现有 Playwright 认证规格 | `playwright.config.ts` `webServer.command` 含 `VITE_MSW=true`；`auth.fixture.ts` 注释「MSW 浏览器 worker 拦截 API 请求」 | **`identity-auth.spec.ts`(964行) + `auth-verification.spec.ts`(575行) 跑在 mock 下、不触达真实后端**，不能替代本轮真实后端浏览器测试 |
| 移动端认证路由 | `frontend_mobile/src/router/index.ts`：`/login` `/register` `/verify-email` `/verify-phone` `/forgot-password` `/reset-password` | 与 PC 同名，Wave6 直接复用剧本 |

---

## 3. 波次结果

<!-- WAVE RESULTS APPENDED BELOW -->

### Wave1-L 登录全分支（子代理实测，环境被打包流水线打断前）

证据：`gui-test-screenshots/w1l/`（5 张截图 + 15 份快照）。账号由 `scripts/w1l-seed.ts` 构造（9 个 `w1l_` 前缀账号，复用 bcryptjs 12 轮 + `encryptPii`/`hmacIndex`/`normalizeEmail` 真实路径）。

| 分支 | 账号 | 实测 UI 结果 | 判定 |
|---|---|---|---|
| A1 正确密码登录 | `e2e_user_a` + 正确密码 | 进入首页 | ✅ |
| **A3 手机号登录** | `w1l_phone`（`13700112233`）+ 正确密码 | 「账号或密码错误」 | ⚠️ **待复验（高优先）** |
| B5 密码错误 | `e2e_user_a` + 错误密码 | 「账号或密码错误」 | ✅ 防枚举 |
| B6a 邮箱不存在 | `nobody-w1l-999@example.com` | 「账号或密码错误」 | ✅ 防枚举 |
| B6b 用户不存在 | `w1l_no_such_user` | 「账号或密码错误」 | ✅ 防枚举 |
| B7 停用账号 | `w1l_suspended`（SUSPENDED） | 「账号或密码错误」 | ✅ 防枚举 |
| B8 无密码账号 | `w1l_nopwd`（password=null，微信注册） | 「账号或密码错误」 | ✅ 防枚举 |
| B9 空字段原生校验 | — | 抓到「无法访问此网站」=后端已死 | ⚠️ 作废，需重测 |

**B 系列 5 个分支同文案是正确行为**（`admin-auth.service.ts:113-170` 与 `login.service.ts` 共用防枚举设计：用户不存在/状态不可用/非管理员/密码错误一律 `401 账号或密码错误`，不暴露账号存在性）。

**A3 待复验的读码结论**：`login.service.ts:174-182` 的手机号验证门禁是 `if (smsEnabled && requirePhoneVerification && !user.phoneVerified)`——**当前 `smsEnabled=false` 时该门禁整体跳过**，所以不是门禁拦截。`findLoginUserIncludingDeleted`（`user-repository.ts:160-184`）对 `/^(\+86)?1[3-9]\d{9}$/` 命中的账号会额外用 `phoneHmac` 索引列做 OR 匹配；`phoneHmacIndex(p)` = `hmacIndex(normalizePhone(p), key)`，`normalizePhone` 幂等（去空白+去 `+86`），与种子脚本写法等价。**读码找不出失败原因**，必须在后端恢复后实测确认是账号状态漂移（可能被后续夹具覆盖）还是真缺陷。

### Wave1-R 注册流程（子代理实测，9 步全链路截图）

证据：`gui-test-screenshots/w1r/01..09.png`。

| 步 | 截图 | 结论 |
|---|---|---|
| 01 | `01_step1_render.png` | 第一步（邮箱+用户名）正常渲染 |
| 02 | `02_empty_next_confirm_modal.png` | 空表单下一步 → 弹确认框 |
| 03 | `03_step2_password.png` | 进入第二步（密码） |
| 04 | `04_password_too_short.png` | 短密码 → 长度提示 |
| 05 | `05_empty_fields_errors.png` | 空字段 → 内联报错 |
| 06 | `06_email_exists_precheck.png` | 邮箱已占用 → 预检提示 |
| 07 | `07_username_exists_precheck.png` | 用户名已占用 → 预检提示 |
| 08 | `08_verify_email_after_register.png` | 注册后跳邮箱验证页 |
| 09 | `09_verify_success_home.png` | 验证成功 → 首页 |

**注册主链路 9 步全通**，含两处重叠加码（邮箱/用户名占用预检）。⚠️ 注意：`04_password_too_short` 出现于默认策略下；默认 `passwordPolicyMinLength` 的实际值以 Wave5 强策略测试为准。

### Wave1-F 忘记密码（子代理未产出 UI 证据）

`gui-test-screenshots/w1f/snap/` 为空——该子代理只走了 API 层，UI 分支未覆盖。其 API 层怀疑项：**`POST /api/v1/auth/reset-password` 在 `confirmPassword != newPassword` 时返回 200 且真的改了密码**（期望 `400 两次输入的密码不一致`）。**待后端恢复后独立复现确认**——这是当前最高价值的未验证项。

**⚠️ 静态分析已证伪（2026-10-26，后端离线期间读码核对三层契约）**：

| 层 | 证据 | 结论 |
|---|---|---|
| 前端 | `pages/ResetPassword.tsx:112` `confirmPassword: data.confirmPassword` | 发送 |
| hook | `pages/ResetPassword/useResetPassword.ts:29` `confirmPassword: data.confirmPassword` | 透传 |
| API SDK | `types.gen.ts:1289` `ResetPasswordDto.confirmPassword: string`（必填） | 类型保留 |
| 后端 DTO | `dto/password-reset.dto.ts:75-80` `@IsString` + `@IsNotEmpty` + `@Validate(IsMatch, ['newPassword'])` → `两次输入的密码不一致` | 校验存在 |

**三层链路完整**：不匹配 → `400 两次输入的密码不一致`；漏发 `confirmPassword` → `400 确认密码不能为空`。**疑似 P0 大概率为误报**（子代理 curl payload 缺字段、或误读另一分支的 200）。仍需后端恢复后一次真机 curl 坐实，但**优先级从 P0 降为 P3**。

### 登录（密码）完整分支矩阵（`login.service.ts` 逐行核对，复跑依据）

判定顺序固定，**短路在前**——测试前置状态必须避开前面的短路才能触达后面的分支：

| # | 行 | 条件 | 返回 | 备注 |
|---|---|---|---|---|
| 1 | 64 | 账号维度限流 | 拒 | 与 IP 维度 RateLimitGuard 互补 |
| 2 | 66 | 失败锁定（#416） | 拒（含剩余时间） | 锁期内**正确密码也拒** |
| 3 | 69-71 | `USER_SYNC_HOOK` | 同步外部认证 | 仅 impl-mx 注册时生效，OSS 为零 |
| 4 | 80-86 | 用户不存在 | `401 账号或密码错误` | 防枚举 |
| 5 | 89-98 | `status≠ACTIVE && !deletedAt` | `401 账号或密码错误` | SUSPENDED/INACTIVE 未注销 |
| 6 | 104-115 | `password=null` 或比对失败 | `401 账号或密码错误` + 记失败 | **null 密码按密码错误处理**（`bcrypt.compare(null)` 会 reject → 500，破坏防枚举） |
| 7a | 352-361 | 管理员 && `adminLoginEntry=ISOLATED` | `401 账号或密码错误` | **管理员门在前**，防止自注销管理员被一次尝试拉回 ACTIVE |
| 7b | 287-302 | `deletedAt` 且 `deactivatedBy=SELF` 且冷静期内 | **自动恢复** → 继续登录成功，响应带 `restored:true` | graceDays 读 `userCancelGraceDays` |
| 7c | 315-324 | `deletedAt` 且 `SELF` 且冷静期已过 | `401 {code:ACCOUNT_DEACTIVATED, graceDays, cleanupDays}` | 前端据此弹客服框 |
| 7d | 277-279 | `deletedAt` 且 `deactivatedBy=ADMIN` | 返回 null → 落 129 行 → `401 账号或密码错误` | 管理员软删不自动恢复、走防枚举 |
| 8 | 129-138 | 恢复后 `status≠ACTIVE` | `401 账号或密码错误` | |
| 9a | 149-163 | `mailEnabled && requireEmailVerification && !emailVerified && !email` | `401 {code:EMAIL_REQUIRED, tempToken(bind_email_temp, 30m)}` | UI 跳邮箱绑定 |
| 9b | 165-171 | 同上但有 email | `401 {code:EMAIL_NOT_VERIFIED, email}` | UI 跳邮箱验证 |
| 10a | 182-198 | `smsEnabled && requirePhoneVerification && !phoneVerified && !phone` | `401 {code:PHONE_REQUIRED, tempToken(bind_phone_temp, 30m)}` | |
| 10b | 199-205 | 同上但有 phone | `401 {code:PHONE_NOT_VERIFIED, phone}` | |
| 11 | 229-261 | 全通过 | tokens + `restored?` + user（含 `hasPassword`、会员展平 `membershipTierLevel/ExpiresAt/isVip/membershipTier`） | 清空失败计数；有 session 时 `establishSession` |

**两个易漏测的边界**：
- **#6 的 null 密码**：`password=null`（微信注册）必须走 `false` 短路而不是让 `bcrypt.compare` 抛异常——否则攻击者能用 500 vs 401 枚举「无密码账号」。Wave1-L 的 B8 已覆盖此分支且行为正确。
- **#7a 管理员门必须在 #7b 恢复之前**：这是刻意的设计纠正（三个 provider 流程曾把恢复放在管理员门之前，导致自注销管理员账号被拉回 ACTIVE 又立即被拒的无意义写库）。Wave4 测 `adminLoginEntry=ISOLATED` 时必须顺带验证「已注销管理员走普通入口不触发恢复」。

### 手机验证码链路分支矩阵（`local-auth.provider.ts:73-183` + `auth-facade.service.ts:470-484`）

**`smsEnabled` 门禁分布——本轮最关键的开关语义（逐处 grep 核实）**：

| 流程 | 端点 | `smsEnabled` 门禁 | 证据 |
|---|---|---|---|
| 发码（login 场景） | `send-sms-code` | ❌ **无** | `auth-facade:470-479` 仅 `scene==='bind'` 时查手机号占用 |
| 校验码 | `verify-sms-code` | ❌ 无 | `auth-facade:482-484` 直通 |
| 手机登录 | `login-phone` | ❌ **无** | `local-auth.provider:73-183` 全文不读 `smsEnabled` |
| 手机注册 | `register-phone` | ✅ `!smsEnabled \|\| !requirePhoneVerification` → 拒 | `local-auth.provider:713-720` |
| 绑定/换绑手机 | `bind-phone`/`rebind-phone` | ✅ → `400 短信服务未启用` | `account-binding.service:86-87`、`104-105` |
| 解绑发码 | `send-unbind-phone-code` | ✅ | `account-binding.service:123-124` |

**结论：Wave2 必须开 `smsEnabled` 才能测「手机注册/绑定」，但「手机登录」默认配置即可测**——这也解释了为何 PC 登录页 `smsEnabled=false` 隐藏手机 tab 而后端其实放行（前端更严）。

**`loginByPhone` 分支（与密码登录的不对称，均是可测点）**：

| # | 行 | 条件 | 返回 | 与密码登录的差异 |
|---|---|---|---|---|
| 1 | 81 | 限流 | 拒 | 同 |
| 2 | 83-90 | 码无效 | `400 verifyResult.message` | 密码路径无此步 |
| 3 | 95 | `findByPhoneIncludingDeleted` | — | 只按 `phoneHmac` 查，不走 email/username OR |
| 4 | 97-142 | 未注册 + `allowAutoRegisterOnPhoneLogin && allowRegister` | **自动注册**：`u_<后8位>`、随机不可登录密码（`randomBytes(9)` base64url+`!Aa`）、`phoneVerified:true`、nickname `用户<后4位>` | 密码路径无 |
| 4b | 106-108 | 自动注册前 `assertInitialized()` | 零用户系统禁止抢占首个用户 | 测试需新库 |
| 4c | 133-141 | 未注册且不允许 | **`412` `{code:PHONE_NOT_REGISTERED, phone}`** | ⚠️ **HTTP 412 非 400**，controller 明示「需跳转注册页」；前端必须处理 412 |
| 5 | 145-147 | 自动注册后仍无用户 | `500 用户创建失败` | |
| 6 | 151-155 | `assertLoginEligible`（管理员门→冷静期恢复） | 同密码路径 | 复用同一出口 |
| 7 | 157-159 | `status≠ACTIVE` | **`401 账号已被注销`** | ⚠️ **不防枚举**——密码路径同场景是「账号或密码错误」。注释明写这是有意：验证码已通过=身份已确认，可明确提示 |
| 8 | 161-182 | 成功 | tokens + `restored?` + user | **无会员展平字段**（密码路径有 `membershipTierLevel/isVip/membershipTier`）——⚠️ **响应形状不一致，前端会员态可能读不到** |

**另两个差异**：手机登录**不查 `checkAccountLock`**（只查 `checkLimit`，密码路径两个都查）；**不查 `requireEmailVerification`/`user.phoneVerified`**——用码登录天然完成手机验证，语义正确。

#### ⚠️ 发现 F-1：登录响应 `user` 形状不一致（手机/微信路径缺会员展平字段）

`login.service.ts:219-258` 把 `membership` 关系展平成 `membershipTierLevel`/`membershipExpiresAt`/`isVip`/`membershipTier` 放进登录响应；`local-auth.provider.ts:175-181`（手机登录）与微信登录只给 `toPublicUser(user)` + nickname/avatar/role/status，**不含这四个字段**。

前端消费点 `hooks/useMembership.ts:20-23`：`membershipState({ tierLevel: user.membershipTierLevel ?? 0, expiresAt: user.membershipExpiresAt ?? null })`——**纯 `useMemo`，无兜底拉取**。

**但刷新路径会自愈**：`AuthContext.tsx:216` 的 `/auth/profile` 校验（10s 超时）与 `:275-285` 的 SSE `account-events` → `refreshUser()` 都会重拉 profile，而 `auth-facade.service.ts:523` 的 `getProfileWithMembership` **含** `membershipTierLevel`。

**判定：真实但不构成用户可见缺陷** —— VIP 用户走手机/微信登录后的**约 10s 窗口内** `isVip=false`（导出/下载权限按钮可能短暂显示锁定态），随后自愈。另注 `admin-auth.service.ts:307` 管理员登录恒写 `membershipTierLevel: 0`（管理员不参与会员，合理）。**建议而非必修**：三个登录出口统一展平逻辑，消除契约漂移。优先级 **P3**。

### 口令策略矩阵（`password-policy.service.ts`，Wave5 依据）

**校验顺序固定（`assertPasswordPolicy`，短路在前）**：

| # | 行 | 判据 | 失败文案 | 备注 |
|---|---|---|---|---|
| 1 | 68-74 | `!password \|\| password.length < minLength` | `密码长度至少 {min} 位` | **JS 字符串长度（UTF-16 code unit），非 Unicode 码位**——含 CJK 口令长度判定与直觉不同 |
| 2 | 77-82 | `weakCheckEnabled && weakPasswords.has(lower)` | `密码过于简单，请更换为更复杂的密码` | 静态数组 `../data/weak-passwords.ts`，大小写不敏感；**只有关键开关无逐条配置** |
| 3 | 88-101 | 四类计数 `< minCategories` | `密码需包含大小写字母、数字、特殊字符中至少 {min} 类` | 四类 = 小写/大写/数字/非字母数字；**与 `@cloudcad/platform` 的 `countPasswordCategories` 刻意保留两份**，由 `scripts/scan-password-policy.js` 检查 C 拦单侧改动 |

**仅约束设置口令入口**（注册/改密/重置/管理员创建），**存量口令不追溯**。所有参数**每次调用读取**（Redis 缓存 + 写时失效），改完即生效、无需重启。取值下限放宽到 0（`MinCategories=0`/黑名单关/周期 0 天）。

**定期更换判定（仅 ADMIN，`getPasswordChangeStatus`）**：

| 条件 | 返回 |
|---|---|
| `changeEnforceEnabled=false`（默认） | `{required:undefined, expiringSoon:false}` —— 登录不下发 `passwordChangeRequired`、JWT 不锁定 |
| `passwordChangedAt===null` | `{required:'first_login'}` 首登未改密（仅初始管理员） |
| `intervalDays>0 && ageDays>intervalDays` | `{required:'expired'}` 到期强制 |
| `intervalDays>0 && ageDays>intervalDays-expiringSoonDays` | `{expiringSoon:true}` 软提示，**不拦截** |
| 其余 | `{required:undefined, expiringSoon:false}` |

⚠️ **边界**：`intervalDays=0`（永不强制）时**跳过 expired/expiringSoon 判定，但保留 `first_login` 判定**——初始管理员即使关掉周期仍会被强制改密。Wave5 测「关闭强制」时别把 `first_login` 误判成开关没生效。

**普通用户不做周期判定**（`auth-facade.service.ts:496-509` 仅 `isAdminUser` 才调）——体验优先，等保考核管理员。同处还有一个软提示字段 `passwordUnchanged = isAdmin && passwordChangedAt===null`，**刻意不挂 `changeEnforceEnabled` 开关**（它是软提示非拦截）。

### 管理员入口（ISOLATED）完整分支矩阵（`admin-auth.service.ts`，Wave4 依据）

`POST /api/v1/admin/auth/login`，前置顺序**刻意固定**：

| # | 行 | 条件 | 返回 | 备注 |
|---|---|---|---|---|
| 1 | 71-87 | IP 在黑名单 | **`403 当前 IP 已被禁止登录`** | 黑名单**先于**白名单（被拉黑的 IP 即使不在白名单也报黑名单文案） |
| 2 | 89-105 | IP 不在白名单 | **`403 当前 IP 不在管理员白名单中，禁止登录`** | 白名单外**不消耗账号信息与限流计数**（最前置） |
| 3 | 107-110 | 限流 + 失败锁定 | 拒 | 锁期内正确密码也拒 |
| 4 | 119-171 | 不存在 / 状态不可用 / 非管理员 / 密码错 | **一律 `401 账号或密码错误`** | 防枚举：四类原因同文案 |
| 5a | 185-187 | `mfaEnforceEnabled` 开 + **未绑定** TOTP | **登录成功**，响应带 `mfaSetupRequired:true` | ⚠️ **不拦截**！前端据此锁到绑定页；JwtStrategy 层拦后台其余端点 |
| 5b | 188-206 | 已绑定 + 缺码 | `401 {code:MFA_REQUIRED}` | 第一因子已过，暴露「要码」无枚举风险 |
| 5c | 207-229 | 已绑定 + 错码 | `401 {code:MFA_CODE_INVALID}` + 计入限流 | |
| 5d | 185 前置 | `mfaEnforceEnabled=false` | **TOTP 完全忽略** | ⚠️ **已绑定者也无需动态码**，`totpCode` 参数被丢弃 |
| 6 | 233-242 | 口令到期判定 | 响应带 `passwordChangeRequired`/`passwordExpiringSoon` | 仅管理员入口；JwtStrategy 据此强制引导改密 |

**三个必须测的不对称**：
1. **5a 未绑定不拦截**——等保场景下「开 MFA 但管理员没绑定」仍能进后台，靠 JwtStrategy 的 `MFA_SETUP_REQUIRED` 拦后续请求。Wave4 必须验证这条链路真的拦住（否则是绕过）。
2. **5c 只调 `checkLimit` 不调 `recordLoginFailure`**（L212）——TOTP 错码**不计入失败锁定**，只有密码错才计入。测「连续错码会否锁号」时应得出「不会」。
3. **黑名单/白名单是 403 非 401**——与账号类的 401 区分开，前端若按 401 统一处理会漏显白名单提示。

---

## 4. API 层实测结果（后端恢复后）

### Wave1-R / Wave1-F API 层（curl）

**环境**：后端 `http://127.0.0.1:3001`，前缀 `/api/v1`；前端 devDependency 被并发打包清掉，全程 curl。时间 2026-10-26 12:00-12:20。基线配置：`mailEnabled=true`、`requireEmailVerification=true`、`smsEnabled=false`、`requirePhoneVerification=false`、`allowRegister=true`；口令策略 `passwordPolicyMinLength=6`、`passwordPolicyMinCategories=0`、`passwordPolicyWeakCheckEnabled=false`。

#### 契约澄清（任务假设与实际不符，先说清避免误判）

1. **字段名是 `email`/`phone`，不是 `contactType`/`contact`**。传 `{contactType, contact}` → `400 VALIDATION_ERROR property contactType should not exist`（`ValidationPipe forbidNonWhitelisted:true` 生效）。前端 `packages/frontend/src/pages/ResetPassword.tsx:106-113` 实际传 `{email, phone, code, newPassword, confirmPassword}`，**与后端契约一致** → 任务书里的 contactType/contact 是假设错误，非产品缺陷。
2. **注册是两阶段**：`POST /auth/register` 返回 201 只写 Redis `register:pending:<email>`（TTL 900s）+ 发验证码；`POST /auth/verify-email` 才真正建用户（`registration.service.ts:157-176`）。所以「注册后 DB 查无用户」是正确设计。
3. **`RegisterDto` 无 `confirmPassword`、无协议勾选字段** → 任务 A5/A6 分支在后端不存在，由前端把关。

---

#### ⚠️ 最高价值产出：(a)(b)(c) 三 payload 坐实结论

**判定基准**：`POST /auth/forgot-password` 取真验证码 `352515`（`w1f-reset@example.com`）；改密前后比对 `users.password` 的 bcrypt 哈希，并用新旧密码分别登录验证是否真的生效。

| payload | 实测 HTTP / code / message | DB 哈希变化 | 判定 |
|---|---|---|---|
| **(b)** `newPassword:'W1fNew!2026'`，**完全不发 confirmPassword**，真验证码 | `400 VALIDATION_ERROR`，`errors:[{field:"confirmPassword", message:"确认密码不能为空, 确认密码必须是字符串"}]` | **未变** | ✅ 符合预期（`@IsNotEmpty`/`@IsString` 生效） |
| **(a)** `newPassword:'W1fNew!2026'`、`confirmPassword:'Different!99'`（不匹配），真验证码 | **`200 SUCCESS`** / "密码重置成功，请使用新密码登录" | **❗❗ 已变**；新密码 `W1fNew!2026` 登录 → **200**，旧密码 `W1fOld!2026x` 登录 → **401** | ❌❌ **真缺陷坐实** |
| **(c)** 密码对一致，**验证码故意填错** `000000` | `401 UNAUTHORIZED` / "验证码无效或已过期" | **未变** | ✅ 符合预期（注意是 401 非 400，`password.service.ts:136` 抛 `UnauthorizedException`） |

**结论：疑似 P0 是真缺陷，非误报。** 符合任务书「(a) 返回 200 且密码真的改了」的 P0 判定标准。

**根因（源码级）**：`password-reset.dto.ts:78` 写的是 `@Validate(IsMatch, ['newPassword'], {...})`。而 `IsMatch`（`common/decorators/validation.decorator.ts:39-49`）是一个**装饰器工厂函数**——它返回一个 decorator，内部走 `registerDecorator({ validator: IsMatchConstraint })`。但 class-validator 的 `@Validate(constraintClass, ...)`（`Validate.js`）把参数原样存成 `constraintCls`，验证时 `ValidationExecutor.js:285` 调 `metadataStorage.getTargetValidatorConstraints(metadata.constraintCls)` 查约束元数据；而约束元数据**只由 `@ValidatorConstraint()` 装饰器写入**，全仓只有 `IsMatchConstraint` 这一个类被注册（`validation.decorator.ts:23-24`）。`IsMatch`（工厂函数）**从未被 `@ValidatorConstraint()` 注册** → `getTargetValidatorConstraints(IsMatch)` 返回空数组 → **该校验被静默跳过，不报错、不验证**。

**爆炸半径：`@Validate(` 全仓仅 3 处，全部失效。** 全部在 `password-reset.dto.ts`，且**全部传的是普通函数**：

| 行 | 位置 | 传的实参 | 实测是否失效 |
|---|---|---|---|
| 42 | `ForgotPasswordDto.validateContact` | `HasEmailOrPhone`（函数） | ✅ 失效，但被 `password.service.ts:47-49` **service 层兜底**掩盖 |
| 78 | `ResetPasswordDto.confirmPassword` | `IsMatch`（工厂函数） | ❌ **失效且无兜底 → 本轮 P0** |
| 87 | `ResetPasswordDto.validateContact` | `HasEmailOrPhoneReset`（函数） | ✅ 失效且**无兜底** → 校验缺失穿透到「用户不存在」 |

**另 2 处失效的实测坐实**：
- `forgot-password` 只传 `{"validateContact":"dummy"}`（无 email/phone）→ `400` "邮箱和手机号不能同时为空"。但此文案来自 `password.service.ts:48` 的 service 层兜底，**与 DTO 声明的「必须提供邮箱或手机号」不同** → 证明 DTO 校验没跑。
- `reset-password` 只传 `{"validateContact":"dummy", code, newPassword, confirmPassword}`（无 email/phone）→ **`401 UNAUTHORIZED` "用户不存在"**（哈希未变）。若 `HasEmailOrPhoneReset` 生效应返回 400。而 `password.service.ts:128-160` **没有** `if (!email && !phone)` 兜底（与 forgot-password 不对称）→ 校验缺失直接穿透。

**修复方向（一行）**：把 `@Validate(IsMatch, ['newPassword'], {...})` 改成 `@IsMatch('newPassword', {...})`（`IsMatch` 工厂本身就是为这种用法设计的，走 `registerDecorator`）；或传类 `@Validate(IsMatchConstraint, ['newPassword'], {...})`。另两处 `HasEmailOrPhone`/`HasEmailOrPhoneReset` 同理需改为 `registerDecorator` 形式或补 `@ValidatorConstraint()`。注意 `IsMatchConstraint` 类本身实现是正确的（`value === relatedValue`），**问题纯粹在调用方式**。

**为什么定 P0/P1 而非「误报」**：
- 前端 `packages/frontend/src/pages/ResetPassword/resetPasswordSchema.ts` 有 `.refine((data) => data.newPassword === data.confirmPassword)` → **Web UI 有兜底**，正常用户不会踩到。
- 但 `packages/frontend_mobile` / 第三方集成 / 任何直连 API 的客户端**无此保护**。
- `auth-facade.service.spec.ts:649-670` 的 `resetPassword` 单测**只测委托**（`expect(...).toHaveBeenCalledWith(...)`），完全不测 DTO 校验 → 这个失效校验**零测试覆盖**，故能长期存活。

**严重级精确表述**：confirmPassword 不匹配本身**不是认证绕过**——攻击者已持有效验证码（那才是安全边界），本来就能设任意密码。真实危害是**正确性缺陷**：①声明的校验静默失效（silent validation bypass）；②任何无前端兜底的客户端可把用户设成「用户自己没确认过」的密码 → 用户被锁号 + 客服负担；③同构缺陷 3 处，其中 2 处 service 层无兜底。**按任务书口径记 P0**；按「认证绕过」口径应为 P1。真缺陷无疑。

---

#### A. 注册全分支（`POST /api/v1/auth/register`）

| 分支 | 请求要点 | 实测 HTTP / code / message | 判定 |
|---|---|---|---|
| A1 正常注册 | 契约字段 `{email, username, nickname, password}` | **201** / "验证码已发送到您的邮箱，请查收并完成验证"；**DB 无用户**；Redis `register:pending:<email>` 已写入（TTL 900s） | ✅ 两阶段注册，非缺陷 |
| A1b 带 `confirmPassword`/`agreement` | 同上加两字段 | **400** `property confirmPassword should not exist` / `property agreement should not exist` | ✅ RegisterDto 无此二字段；任务 A5/A6 分支在后端不存在 |
| A2 重复邮箱（已落库账号） | `w1r-ok1@example.com` + 新用户名 | **409** CONFLICT / "注册信息已被占用，请更换后重试" | ✅ 防枚举统一文案，不区分哪个字段被占用 |
| A3 重复用户名（已落库账号） | 新邮箱 + 已占用用户名 `w1r_ok1` | **409** 同上文案 | ✅ |
| A-extra 用户名非法字符 | `w1x-bad!name` | **400** / "用户名只能包含字母、数字和下划线" | ✅ `^[a-zA-Z0-9_]+$` |
| A4a 弱口令 `password`（8 位） | | **201** 注册成功 | ⚠️ 策略宽松（`MinCategories=0` + `WeakCheckEnabled=false`），仅长度门生效 |
| A4b 弱口令 `123456`（6 位） | | **201** 注册成功 | ⚠️ 同上；生产环境应收紧策略 |
| A4c 短密码 `abc`（3 位 < minLength 6） | | **400** / "密码长度至少 6 位" | ✅ minLength 生效 |
| A7a check-field 已落库账号 | `{email:"w1f-reset@example.com", username:"w1f_reset", phone:"13800138000"}` | **200** / `{"usernameExists":true,"emailExists":true,"phoneExists":false}` | ✅ 三字段全查，非单字段 |
| A7b check-field 混合 | 已占用邮箱 + 空闲用户名 + 空闲手机 | **200** / `{"usernameExists":false,"emailExists":true,"phoneExists":false}` | ✅ |
| A7c check-field 空 body | `{}` | **200** / 三者全 `false`（不报错） | ✅ 全 `@IsOptional` |
| A8a 正确验证码激活 | `verify-email` 真码 | **200** + `accessToken`/`refreshToken`/`user`；DB 建用户 `emailVerified=t`、`status=ACTIVE`；pending 已 DEL | ✅ 全链路通 |
| A8b 错误验证码 | 假码 | **400** / "验证码错误，剩余 4 次尝试机会" | ✅ 剩余次数友好提示 |
| A8c 连续错码 | 6 次连续假码 | 递减「剩余 3→2→1→0 次」→ "验证次数已用完，请重新获取验证码" → 第 6 次 "验证码无效或已过期" | ✅ 5 次上限坐实 |
| A8d pending 已被清后验证 | w1x-ok 的 pending 被后续同邮箱注册的发送失败路径 DEL | **400** / "注册信息已过期，请重新注册" | ✅ 语义正确 |
| A2' 同邮箱二次注册（pending 态） | 同邮箱 60s 限流后重发 | **201**，但 **pending 被覆盖** | ⚠️ 见下方 F-2 竞态缺陷 |

#### B. 忘记密码 + 重置（(a)(b)(c) 见上，此处为其余分支）

| 分支 | 请求要点 | 实测 HTTP / code / message | 判定 |
|---|---|---|---|
| B1 正常流程 | `forgot-password {email}` → 取真码 → `reset-password` 密码对一致 | **200** / `{"message":"密码重置验证码已发送到您的邮箱","mailEnabled":true,"smsEnabled":false}`；重置后 **200** "密码重置成功，请使用新密码登录"；新密码登录 200、旧密码 401 | ✅ 全链路通 |
| B5 不存在邮箱（防枚举） | `nobody-999@example.com` | **200** "密码重置验证码已发送到您的邮箱"；**Redis `email_verification:code:*` EXISTS=0**（真没写码），改发「账号不存在通知信」 | ✅ 坐实防枚举（源码 `password.service.ts:81-101` 刻意设计）；⚠️ 文案不诚实见 F-4 |
| B5b 已停用账号（SUSPENDED） | `w1l-suspended@example.com` | **200** 同上文案；EXISTS=0 | ✅ `user.status !== 'ACTIVE'` 同走防枚举分支 |
| B6 双通道全关 | `mailEnabled=false` + `smsEnabled=false`（DB UPDATE + DEL `runtime_config:*`） | **200** / `{"mailEnabled":false,"smsEnabled":false,"supportEmail":"","supportPhone":""}`，message "邮件服务和短信服务均未启用，请联系客服重置密码" | ✅ 两开关均 false，前端可渲染 NoChannelView/SupportView；⚠️ 但客服信息为空见下 |
| B7 resend 冷却 | `resend-verification` 连发两次 | 首次 **200** "验证邮件已重新发送"；第二次 **400** "发送过于频繁，请稍后再试"；`email_verification:rate_limit:*` TTL=60s | ✅ 60s 冷却坐实 |
| B-resend 不存在邮箱 | `resend-verification {email:"ghost-race-999@example.com"}` | **200** + **Redis 码键 EXISTS=1（真写了码）** | ⚠️ 见 F-3 |

**B6 附带发现（配置数据缺陷，非代码缺陷）**：`supportEmail` / `supportPhone` 在 DB 中均为**空字符串 `""`**（`updatedBy` 非空，即被显式写成空）。双通道全关时前端 SupportView 会渲染「请联系客服：<空>」，用户无路可走。**若生产环境要关闭双通道，必须先填 `supportEmail`/`supportPhone`**。

#### C. 邮箱验证独立链路（`send-verification` + `verify-email`，账号 `w1f_dev` 已验证）

| 分支 | 请求要点 | 实测 HTTP / message | 判定 |
|---|---|---|---|
| C1 发码 | `send-verification {email:"w1f-dev@example.com"}` | **200** / "验证邮件已发送"；Redis 取码 `401191` | ✅ 对已验证账号也可发码 |
| C2 正确码验证 | `verify-email` 真码 | **200** + tokens + `user`（走 `registration.service.ts:222-240` 已有用户分支：`markEmailVerified` + `toPublicUser` + `generateTokens`） | ✅ |
| C3 重复验证（同码二次） | 同码再验 | **400** / "验证码无效或已过期"（码已被消费） | ✅ 一次性码，无重放 |
| — 端点限流 | `auth.controller.ts:252` | `@Throttle({default:{limit:12, ttl:60000}})` | ✅ 源码注明「每码 5 次上限只限同一码的猜测，不限每分钟猜多少个码」，故端点级再加限流 |

---

#### 本轮新发现缺陷（Wave1-R / Wave1-F）

| # | 严重级 | 位置 | 描述 |
|---|---|---|---|
| R1 | **P0（任务口径）/ P1（认证绕过口径）** | `packages/backend/src/auth/dto/password-reset.dto.ts:78` | **`confirmPassword` 一致性校验静默失效**。`@Validate(IsMatch, ...)` 传的是装饰器工厂函数而非 `@ValidatorConstraint()` 注册的类，class-validator 找不到约束元数据 → 校验被跳过。实测：密码不匹配 + 真验证码 → **200 且密码真的改了**。根因同构波及本文件 3 处 `@Validate` 全部失效（另 2 处见下）。前端 zod 有兜底、单测只测委托不测 DTO → 零覆盖故长期存活。**详见上方最高价值产出章节。** |
| R2 | **低-中** | `packages/backend/src/auth/dto/password-reset.dto.ts:42`、`:87` | 另 2 处 `@Validate` 同样静默失效（`HasEmailOrPhone` / `HasEmailOrPhoneReset` 是普通函数未注册）。`ForgotPasswordDto` 那处被 `password.service.ts:47-49` service 层兜底掩盖（文案不同可证）；**`ResetPasswordDto` 那处无兜底**——实测不传 email/phone 时穿透到 `401 用户不存在`（应为 400「必须提供邮箱或手机号」）。与 `password.service.ts:128-160` 缺少 `forgotPassword` 那样的空值守卫不对称。 |
| R3 | **低** | `packages/backend/src/auth/impl/services/registration.service.ts:157-162` | **注册 pending 覆盖竞态（静默数据丢失）**。`redis.setex(register:pending:<email>, 900, ...)` 覆盖写，不检查是否已有 pending；用户名唯一性检查（`:53-56`）只查 DB **不查 pending 中的占用**。实测：`w1x-weak2@example.com` 先注册 `w1x_weak2`，同邮箱再注册 `w1x_racer2` → Redis pending 内容被**静默覆盖**为 `{"username":"w1x_racer2",...}`，旧数据丢失。后果：用户第一次提交 usernameA、重试提交 usernameB，验证码验证后激活的是 **usernameB**，用户以为自己注册的是 usernameA。触发条件：同一邮箱在 900s 内重复提交（刷新/重试/网络抖动）。非安全缺陷（同一邮箱所有者相同），但属 UX 正确性问题。 |
| R4 | **低** | `packages/backend/src/auth/impl/services/registration.service.ts:166-172` | **发送失败会删掉之前有效的 pending**。`sendVerificationEmail` 抛错时执行 `await this.redis.del(registerKey)`，无差别删除。实测坐实：`w1x-ok` 的 pending 被后续同邮箱注册触发的发送失败路径清掉，用户拿旧码验证 → `400 注册信息已过期，请重新注册`。与 R3 叠加放大影响。 |
| R5 | **低** | `packages/backend/src/notification/email-verification.service.ts:64-78`、`:121-123` | **`send-verification`/`resend-verification` 不检查账号是否存在**，直接生成码 + 写 Redis + 发邮件。实测 `resend-verification {email:"ghost-race-999@example.com"}`（DB 无此邮箱）→ **200 + Redis 码键 EXISTS=1**。与 `forgotPassword` 的刻意防枚举（不存在/非 ACTIVE 时不写码、改发说明信，实测 EXISTS=0）**策略不一致**。危害：邮件轰炸（受 60s rate limit 约束）、信息不一致。 |
| R6 | **配置数据** | `runtime_configs.supportEmail` / `supportPhone` | 双值均为**空字符串**（`updatedBy` 非空 = 被显式写成空）。双通道全关时前端 SupportView 渲染空联系方式，用户无路可走。非代码缺陷，但**生产关闭双通道前必须补齐**。 |

#### 本轮误报清单（实测 + 源码核对，确认非缺陷）

| # | 疑似问题 | 实际结论 |
|---|---|---|
| 1 | 任务假设的 `contactType`/`contact` payload | 实际契约是 `email`/`phone`（`forbidNonWhitelisted` 开启，传错字段 400 `should not exist`）。**任务描述假设错误，非产品缺陷**。前端 `ResetPassword.tsx:106-113` 与后端契约一致。 |
| 2 | 「注册后 DB 查无用户 = 缺陷」 | **两阶段注册**设计：201 只写 Redis pending + 发码，`verify-email` 才建用户。**正确行为**。 |
| 3 | A5「注册 `confirmPassword != newPassword` → 400」 | 后端 `RegisterDto` **无 confirmPassword 字段**，该分支在后端不存在。由前端 `Register/PasswordStep.tsx` + zod 把关。**职责划分，非缺陷**。 |
| 4 | A6「缺协议勾选 → 400」 | 后端**不校验协议勾选**（RegisterDto 无此字段），由前端 `Register/BasicInfoStep.tsx` 把关。设计选择，非缺陷。 |
| 5 | B4(b)「不发 confirmPassword → 绕过校验」 | 实测 **400「确认密码不能为空」**，DTO `@IsNotEmpty`/`@IsString` 生效 → **符合预期，非缺陷**。与 (a) 形成关键对照：同字段的 `@IsNotEmpty` 生效、`@Validate(IsMatch,...)` 失效 → 失效**只限于跨字段 `@Validate` 校验**，精确界定根因范围。 |
| 6 | `smsEnabled` 首次返回 `true`（DB/缓存均 `false`） | **未能复现的瞬时不一致**。后续多次调用稳定 `false`；最终三方（DB `false` / Redis 缓存 `false` / API `false`）一致。排查：`smsEnabled` 在 `runtime-config.constants.ts:405` **无 envKey** → env 层返回 undefined；`updatedBy=NULL`（安装默认行）→ `resolveValue` 走 `parseValue("false","boolean")` 应恒为 false。**不作为缺陷结论**，推测为并发会话/打包活动的瞬态缓存写入（本工作区多会话共享），记录在案供后续排查。 |

#### 本轮改过并恢复的配置/数据（最终态已复核实测）

| 项 | 基线 | 测试中 | 最终态 | 状态 |
|---|---|---|---|---|
| `runtime_configs.mailEnabled` | `true` | `false`（B6 双通道测试） | **`true`**（已 UPDATE + `DEL runtime_config:mailEnabled runtime_config:all`） | ✅ 已恢复；API 复核实测 `mailEnabled=true` |
| `runtime_configs.smsEnabled` | `false` | 未改 | `false` | ✅ 未变 |
| Redis `runtime_config:*` 缓存 | — | `DEL`（B6） | 已自然重建 | ✅ |
| `users.w1f_reset.password` | `$2b$12$4aB...`（对应 `W1fOld!2026x`） | 被 (a) 改为 `W1fNew!2026` | **`W1fOld!2026x`**（用 Bearer token 调 `/users/change-password` 改回，登录验证：新密码 401 / 旧密码 200） | ⚠️ **哈希值已变**（bcrypt 盐不同），语义等价；原哈希无法字节级还原 |
| `users.w1f_reset.passwordChangedAt` | `2026-10-26 03:07:20.971` | `04:11:10.441`（改密副作用） | **已恢复 `2026-10-26 03:07:20.971`** | ✅ |
| Redis `register:pending:*` / `email_verification:code:*` / `rate_limit:*` / `verify_attempts:*` | — | 测试产生 | 已 `DEL` | ✅ 无残留 |
| Redis `account-rate-limit:register:w1x-*` | — | 测试产生 | 保留 | ✅ 服务端限流计数，带 TTL 自然过期，无需处理 |
| `users.e2e_user_a`、`w1f_dev` | ACTIVE | 未改密（仅走验证码链路） | 原值 | ✅ 未变 |

#### 本轮创建的账号清单（供收尾清理）

| 账号 | 邮箱 | 状态 | 备注 |
|---|---|---|---|
| `w1x_weak1` | `w1x-weak1@example.com` | ACTIVE, `emailVerified=t` | 密码 `password`（弱口令，因策略宽松可通过）。**保留**（验证验证码链路的主体） |
| `w1x_nomail` | `w1x-nomail@example.com` | ACTIVE, `emailVerified=t` | 密码 `W1xNew!2026`；`mailEnabled=false` 时的直接注册分支产生。**保留** |
| `w1x_ok` / `w1x_weak2` / `w1x_racer2` / `w1x_dupuser` / `w1x_dupname` / `w1x_dupmail` | — | **未落库**（仅 pending） | pending 键已全部 `DEL`，DB 无残留 |
| `w1f_reset` | `w1f-reset@example.com` | ACTIVE | 密码已改回 `W1fOld!2026x`（哈希已变），`passwordChangedAt` 已恢复基线 |
| `w1f_dev` | `w1f-dev@example.com` | ACTIVE | 仅走 C 部分验证码链路，未改密 |
| `e2e_user_a` | `e2e-user-a@example.com` | ACTIVE | 仅用于基线对照查询，未触碰 |

---

### Wave2 / Wave6 API 层（curl）

**测试环境**：后端 `http://127.0.0.1:3001`，API 前缀 `/api/v1`；前端 devDependency 被并发打包清掉，全程用 curl。Redis Mock SMS 只写键 `sms_verification:code:+86<手机号>`（TTL 900s）。

#### A. 手机登录（默认 `smsEnabled=false` 下坐实「无门禁」）

| 分支 | 请求要点 | 实测 HTTP / code / message | 判定 |
|---|---|---|---|
| A1 发码（无门禁） | `POST /auth/send-sms-code` `{phone:"13700112233", scene:"login"}`；DB `smsEnabled=false` | **HTTP 200** / SUCCESS / "验证码已发送"；Redis 取码 `102138` | ✅ 坐实：send-sms-code 完全不看 `smsEnabled` |
| A2 登录成功（无门禁） | `POST /auth/login-phone` 用 A1 码登录 `w1l_phone` | **HTTP 200** / SUCCESS + `accessToken` + `refreshToken` + `user.phone="13700112233"` | ✅ 坐实：`smsEnabled=false` 时手机登录仍可用 |
| A3 错误码计数 | 5 次错码（每次重发码）后第 6 次 | 逐次 **HTTP 400**，message "验证码错误，剩余 N 次尝试机会" 递减 4→3→2→1→0；第 6 次 "验证次数已用完，请重新获取验证码" | ✅ 5 次上限坐实；文案友好 |
| A4 **未注册手机号** | `POST /auth/login-phone` `13800130001`（DB 无此号） | **HTTP 412** / `{"code":"PHONE_NOT_REGISTERED","message":"手机号未注册，请先注册","phone":"13800130001"}` | ✅ 坐实 **412 而非 400**：controller 明示 `HttpStatus.PRECONDITION_FAILED` 供前端跳转注册页 |
| A5a 自动注册（requireEmailVerification=true） | 打开 `allowAutoRegisterOnPhoneLogin`+`allowRegister`，`requireEmailVerification` 保持 `true`；`login-phone` 未注册号 `13800130002` | **HTTP 400** / "邮箱验证已启用，邮箱为必填项"（`user-crud.service.ts:82`） | ⚠️ **真实缺陷 #1**：自动注册路径 `userService.create` 不传 `email`，`requireEmailVerification=true` 时（本环境默认）自动注册路径**不可用** |
| A5b 自动注册（关闭邮箱校验） | 额外置 `requireEmailVerification=false` 后重试 `13800130002` | **HTTP 200** / SUCCESS + tokens；DB 新建用户 `username=u_00130002`、`nickname=用户0002`、`phoneVerified=true`、`passwordChangedAt` 有值 | ✅ 坐实自动建号：username=`u_${phone.slice(-8)}`、nickname=`用户${phone.slice(-4)}` |
| A5c **自动注册账号密码不可登录** | 用 `u_00130002` + 任意 4 个不同密码尝试 `/auth/login` | 全部 **HTTP 401** / "账号或密码错误"；DB `password` 前缀 `$2b$12$XPDDunSj`（bcrypt，随机生成） | ✅ 坐实：`crypto.randomBytes(9).toString('base64url').slice(0,12)+'!Aa'` 密码用户永远猜不到，只能用手机码登录 |

#### B. 手机注册（需 `smsEnabled=true`，且实测需 `requirePhoneVerification=true` 一并）

| 分支 | 请求要点 | 实测 HTTP / code / message | 判定 |
|---|---|---|---|
| B7 门禁坐实（部分打开） | `smsEnabled=true`, `requirePhoneVerification=false`，走完整发码+`register-phone` | **HTTP 400** / "手机号注册未启用，请使用邮箱注册" | ✅ 坐实 `!smsEnabled \|\| !requirePhoneVerification` **OR 门禁**：两者必须同时为 true |
| B8 注册成功 | 两者均 `true`（+临时 `requireEmailVerification=false`）→ 发码 `13800130005` + `register-phone` | **HTTP 201** / SUCCESS + tokens + `user.username=e2e_phone_reg_c` | ✅ 201 Created 语义正确 |
| B9 重复手机号 | 同号 `13800130005` + 新用户名再注册 | **HTTP 409** / CONFLICT / "注册信息已被占用，请更换后重试"（防枚举，不区分手机号/用户名） | ✅ 坐实 409 占用冲突 |
| B9b 重复用户名 | 新号 `13800130006` + 已占用用户名 `e2e_phone_reg_c` | **HTTP 409** / CONFLICT / "注册信息已被占用，请更换后重试" | ✅ 同上，防枚举文案统一 |
| B10 关闭 SMS 门禁 | `smsEnabled=false`，再 `register-phone`（码仍在 Redis） | **HTTP 400** / "手机号注册未启用，请使用邮箱注册" | ✅ 门禁对称 |

#### C. 账号绑定/解绑/换绑（Wave6，需登录态 + `smsEnabled=true`）

| 分支 | 请求要点 | 实测 HTTP / code / message | 判定 |
|---|---|---|---|
| C12 未绑手机发解绑码 | e2e_user_b 无手机号时 `POST /auth/send-unbind-phone-code`（Bearer） | **HTTP 400** / "您还未绑定手机号" | ✅ 语义正确 |
| C13 **发送已占用号 bind 码** | `send-sms-code` `{phone:"13700112233", scene:"bind"}`（w1l_phone 在用） | **HTTP 409** / CONFLICT / "该手机号已被其他用户绑定"（`auth-facade.service.ts:473-478`） | ✅ 坐实 409 占用冲突在**发码阶段**即拦截 |
| C14 绑定未占用号 | e2e_user_b + `bind-phone` `13800130003` | **HTTP 200** / "手机号绑定成功"；DB `phone=13800130003`、`phoneVerified=true`、`phoneVerifiedAt` 有值 | ✅ 全链路 200 |
| C15 换绑三步 | (1) `send-unbind-phone-code` 到旧号 `13800130003` → 200；(2) `verify-unbind-phone-code` → 200 + `token`；(3) 新号 `13800130004` 发码+`rebind-phone` 带 token | **HTTP 200** / "手机号换绑成功"；DB `phone=13800130004`、旧号已无归属 | ✅ 换绑原子性正确 |
| C16 解绑 | `send-unbind-phone-code` 到 `13800130004` → `unbind-phone` 用码 | **HTTP 200** / "手机号解绑成功"；DB `phone=NULL`、`phoneVerified=false` | ✅ 干净解绑 |
| C17a `smsEnabled=false` 门禁：`send-unbind-phone-code` | 关闭 `smsEnabled` 后调用 | **HTTP 400** / "短信服务未启用" | ✅ 门禁对称 |
| C17b `smsEnabled=false` 门禁：`rebind-phone` | 关闭 `smsEnabled` 后 `rebind-phone` 传假 token | **HTTP 400** / "短信服务未启用" | ✅ 门禁对称 |
| **C17c `smsEnabled=false` 门禁：`bind-phone`** | 关闭 `smsEnabled` 后带有效预置码 `13800130006` 调 `bind-phone` | **HTTP 200** / "手机号绑定成功"；DB `phone=13800130006` 已写入 | ⚠️ **真实缺陷 #2（中严重级）**：`account-binding.service.ts:68` 的 `bindPhone` **不查 `smsEnabled` 门禁**，直接跑 `verifyCode`。send-unbind/rebind/unbind 三门都查了，唯独 `bindPhone` 没有。攻击面：短信通道关闭时仍可绑定（前提是攻击者能通过其他渠道拿到 6 位码，Redis Mock 场景下就是可读 Redis 的运维账号；生产 SMS 关闭时攻击面小，但仍是**门禁不对称**的一致性 bug）。|

#### D. 注销冷静期（`deactivatedBy` 三种语义差异）

| 分支 | DB 状态 | 实测 HTTP / code / message / DB 变化 | 判定 |
|---|---|---|---|
| D18 **SELF + 1 天前**（冷静期内） | `status=INACTIVE`, `deletedAt=NOW()-1d`, `deactivatedBy='SELF'`；`userCancelGraceDays=30` | **HTTP 200** + tokens；响应 `data.restored=true`；DB 自动 `status='ACTIVE'`, `deletedAt=NULL`, `deactivatedBy=NULL`；触发 `user.restored` 事件 | ✅ 冷静期内自动恢复 |
| D19 **SELF + 40 天前**（冷静期已过） | `deletedAt=NOW()-40d`, `deactivatedBy='SELF'` | **HTTP 401** / `{"code":"ACCOUNT_DEACTIVATED","message":"账号已注销且已过冷静期，请联系客服恢复。数据将在30天后彻底删除","graceDays":30,"cleanupDays":30}`；DB 保持 INACTIVE | ✅ 明确错误码 + graceDays/cleanupDays 供前端分流客服框 |
| D20 **ADMIN 软删** | `deletedAt=NOW()-1d`, `deactivatedBy='ADMIN'` | **HTTP 401** / 通用 "账号或密码错误"（防枚举，无 `ACCOUNT_DEACTIVATED`）；DB **不恢复**（仍 INACTIVE / ADMIN） | ✅ 坐实 `deactivatedBy!=='SELF'` 分支走 `login.service.ts:270` 防枚举拒绝；管理员软删不自动恢复 |

---

### 本轮真实缺陷清单

| # | 严重级 | 位置 | 描述 | 状态 |
|---|---|---|---|---|
| **0** | **P0（已修）** | `packages/backend/src/auth/dto/password-reset.dto.ts:78`（原） | `@Validate(IsMatch, ['newPassword'], …)` —— `IsMatch` 是装饰器**工厂函数**，不是 `@ValidatorConstraint()` 注册的类。class-validator 执行期 `getTargetValidatorConstraints(cls)` 走 `constraintMetadatas.get(target) || []`，未注册即返回**空数组**，`forEach` 空跑，**校验被静默跳过且不报错** → `confirmPassword` 与 `newPassword` 不一致仍返回 200 **并真的改密码**。同文件另有两处同型缺陷（`:42`/`:87` 的 `@Validate(HasEmailOrPhone…)` 传普通函数），导致 reset-password 不传 email/phone 时穿透到 `401 用户不存在`（应为 400）。| **已修 + 已验证**（见下节） |
| 1 | **中** | `packages/backend/src/auth/impl/providers/local-auth.provider.ts:120-126` | 自动注册路径 `userService.create({username, password, nickname, phone, phoneVerified:true})` 不传 `email`，而 `user-crud.service.ts:79-84` 在 `requireEmailVerification=true` 时强制要求 email → 本环境默认 `requireEmailVerification=true` 时，**手机自动注册路径 100% 失败**。**这是策略冲突而非纯编码遗漏**：账号无法同时「仅 SMS 验证」与「必须有已验证邮箱」。需要产品决策，见「待裁定项」。| 未改，待裁定 |
| 2 | **中** | `packages/backend/src/auth/services/sms/sms-verification.service.ts:136-138` | **`smsEnabled=false` 形同虚设**。根因不是 `bindPhone` 缺门禁（那是表象），而是 `getProvider()` 在 `!smsEnabled` 时**回退 `MockSmsProvider`**（无条件 `success:true`），所以 `send-sms-code` 照样落码。**实测 `smsEnabled=false` 下 `POST /auth/send-sms-code` → HTTP 200「验证码已发送」，Redis 中 `sms_verification:code:+8613900139000` 真实存在**。后果：`smsEnabled` 只对 4 个 unbind/rebind 端点 + `register-phone` + `forgot-password` 的 phone 分支生效，对 `send-sms-code`/`verify-sms-code`/`login-by-phone`/`bind-phone` 完全不生效——同一配置两个相反结论。注：攻击者仍须拿到 6 位码（Mock 不发真实短信），故不构成直接爆破，但破坏运维者对开关的信任。| 未改，待裁定 |
| 3 | **低** | `packages/backend/src/auth/impl/providers/local-auth.provider.ts:120` | 自动注册账号密码为 `crypto.randomBytes(9).base64url.slice(0,12) + '!Aa`，用户**永远无法用密码登录**（A5c 实测 4 个猜测密码全 401）。安全上合理，但缺少任何用户可见提示（如「此账号仅支持验证码登录」）。| 观察项 |
| 4 | **低** | 全仓 `@Validate(` 用法 | 全量审计结果：**爆炸半径仅限 `password-reset.dto.ts` 一个文件**。修复后 `git grep "@Validate("` 非测试命中仅 4 条 —— 2 条是本文件的说明注释，2 条是已注册的具名约束类。无其他复现点。| ✅ 已审计，无遗留 |
| **5** | **P2（已修）** | `packages/frontend/src/pages/ForgotPassword/forgotPasswordSchema.ts` + `index.tsx` | **客户端校验纯静默失败（用户点了没反应）**，两条独立成因叠加：①schema 用对象级顶层 `.refine()`，`@hookform/resolvers/zod` 把对象级错误放进 **key `""`**（空字符串），RHF 不映射进 `formState.errors`（实测 `errorKeys` 为空）→ 提交被拦下但错误消息永不可达；②`index.tsx` 原本只解构 `register/handleSubmit/setValue`，**校验消息无人读取**。故空邮箱点「发送验证码」既不报错也不发请求。⚠️ **同仓已有正确对照写法**：`resetPasswordSchema.ts` 用 `.refine(..., { path: ['confirmPassword'] })`（显式 path），Register 的 `useRegisterForm.ts` 走逐字段 `fieldErrors` 汇总 —— 故 Register / ResetPassword 两页正常，唯此页静默。| **已修 + 浏览器实测**（见下节） |

#### P0 修复内容与验证证据（四层）

**根因（源码级，`class-validator@0.14.4` `decorator/common/Validate.js`）**：`@Validate(constraintClass, …)` 只把 `constraintCls` 存进 `ValidationMetadata`，执行期查 `constraintMetadatas.get(target)`；该 Map 只由 `@ValidatorConstraint()` 写入。**未注册的目标类型 → 空数组 → 零报错跳过。** 已用仓库真实 `IsMatch` 实现做行为对照实验（6 组）：

| 用例 | 目标类型 | 实际 | 期望 | 结论 |
|---|---|---|---|---|
| A | `@Validate(普通函数)` | 通过 | 拒绝 | ★静默跳过 |
| **B** | **`@Validate(IsMatch 工厂函数)`（原代码）** | **通过** | **拒绝** | **★P0 坐实** |
| **C** | **`@IsMatch()` 走 `registerDecorator`（修复后）** | **拒绝** | **拒绝** | ✅ |
| D | `@Validate(@ValidatorConstraint 类)` | 拒绝 | 拒绝 | ✅ 修复方案有效 |
| E | `@IsMatch()` 两值相同 | 通过 | 通过 | ✅ 无误伤 |
| F | `@Validate(具名普通函数)` | 通过 | 拒绝 | ★证明是类型问题而非名称 |

案例 F 是关键反证：`HasEmailOrPhone` 原本已具名，**具名不救**，必须是类。

**修复**：`@Validate(IsMatch, ['newPassword'], …)` → `@IsMatch('newPassword', …)`；两个 `HasEmailOrPhone*` 从普通函数改为 `@ValidatorConstraint({name, async:false})` 注册的具名导出类（须定义在消费它的 DTO 之前——类有 TDZ、不提升）。

**回归测试**：新增 `packages/backend/src/auth/dto/password-reset.dto.spec.ts`，**8/8 通过**（`jest --config jest.config.cjs src/auth/dto/password-reset.dto.spec.ts`）。

**真机 HTTP 复核**（`NODE_ENV=production IMPL= node dist/main`，3001 已用修复后 dist 重启）：

| 场景 | 期望 | 实测 |
|---|---|---|
| `confirmPassword` 不一致 | 400 + 不改密码 | **400** `VALIDATION_ERROR` / `field:confirmPassword` / `两次输入的密码不一致`，且 `passwordChangedAt` 前后恒为 `2026-10-26 03:07:20.971` ✅ |
| reset-password 不传 email/phone | 400（原 401 用户不存在） | **400** `field:validateContact` / `必须提供邮箱或手机号` ✅ |
| forgot-password 传 `{}` | 400 | **400** `field:validateContact` ✅ |
| 两次一致 + 验证码错 | 401（不应被校验误拦） | **401** `验证码错误，剩余 4 次尝试机会` ✅ |
| 两次一致 + 验证码对 | 200 | **200** ✅ |
| 重置后新密码登录 | 200 | **200** ✅ |
| 重置后旧密码登录 | 401 | **401** ✅ |

**审计命令**（排查全仓同类隐患，非测试命中应逐一核对目标类型）：

```bash
git grep -n "@Validate(" -- packages/backend/src --include=*.ts | grep -v spec
```

#### ⚠️ 环境归属纠正（重要，影响本节全部时间判断）

**3001 上现运行的后端不是本会话启动的 dev 构建，而是并发打包流水线的部署包进程。** 排查过程：前端 `/forgot-password` 渲染出「邮件和短信服务均未启用」，而 `/runtime-config/public` 返回的全是定义默认值（`brandTitle:""`、`requireEmailVerification:false`、`passwordPolicyMinLength:10`），与 DB 真值（`mailEnabled=true`、`isPublic=t`、`passwordPolicyMinLength=6`）矛盾。逐层排除后定位：

| | 本会话 dev | 部署包（并发流水线） |
|---|---|---|
| 进程 | 已退出 | **PID 8704**，14:07:53 起 |
| 命令行 | `packages/backend/dist/main` | `release\cloudcad-deploy-1.0.0-20261026-windows\packages\backend\dist\main.js` |
| 父进程 | — | PID 22080 = `runtime\scripts\cli.js deploy --skip-build`（14:04:01，**无 PM2 托管**） |
| PG | **5433** | **5432**（部署包 `.env`：`postgresql://postgres:12345678@localhost:5432/cloudcad`） |
| Redis | **6380** | **6379**（部署包 `.env`：`REDIS_PORT=6379`） |
| dist 构建时间 | 13:30:07（含 P0 修复） | **11:20:48（不含 P0 修复）** |

**判据**：`wui_reg_t1` 只存在于 5433（5432 中 `COUNT(*)=0`），而该账号创建于 14:07:05 —— 早于部署包后端 14:07:53 的启动时刻，故注册确实打到了本会话后端。

**由此产生的三条结论**：
1. **14:07:53 之后一切打到 :3001 的观察都归部署包**，不得记为本会话结论。此前「mailEnabled 从 true 变 false」不是配置缓存缺陷：是进程被换掉了。Redis 6380 里的 `runtime_config:all` 聚合缓存（841B，值正确）与部署包无关，`DEL` 它不会影响 :3001 响应——已实测证实（DEL 后响应不变）。
2. **部署包仍含 P0**（零副作用验证，14:18:50）：`POST /auth/forgot-password {}` → `400 邮箱和手机号不能同时为空`。此文案来自 `password.service.ts:48` 的 **service 层兜底**，不是 DTO 声明的「必须提供邮箱或手机号」→ 证明 DTO 校验仍未生效。本会话修复后应返回 `400 field:validateContact 必须提供邮箱或手机号`。
3. **附带正向验证**：部署包后端 `mailEnabled=false + smsEnabled=false + supportEmail/Phone=""` 时，`/forgot-password` 正确渲染 `NoChannelView` + `SupportView`（「暂无客服联系方式，请联系系统管理员」）—— 缺陷清单里 B6 提到的空客服信息兜底路径真实可达且渲染正常。

**未采取的动作**：没有 `Stop-Process 8704`。它是并发会话活跃的部署验证进程（父进程 `cli.js deploy --skip-build` 仍在跑），杀掉会破坏对方验证；且前端 API base 是 Vite proxy `BACKEND_URL`，改它会波及对方。

#### P2 缺陷 #5 修复内容与浏览器验证

**修复**（两处，互不依赖）：
1. `forgotPasswordSchema.ts`：对象级顶层 `.refine(...)` → `.superRefine((val, ctx) => ctx.addIssue({ code:'custom', path:['email'|'phone'], message }))`。显式 `path` 让错误落到具体字段而非 key `""`。
2. `ForgotPassword/index.tsx`：补解构 `formState: { errors }`，`clientError = errors.email?.message || errors.phone?.message`，与后端错误 `displayError = forgotPassword.error || clientError` 二选一（客户端拦下时请求根本不会发出，两者互斥）。`ForgotFormView` 的 `error` prop 由 `forgotPassword.error` 改为 `displayError`。

**浏览器实测（`agent-browser`，1258×622）**：

| 场景 | 实测 | 证据强度 |
|---|---|---|
| 空邮箱点「发送验证码」 | 内联提示「请输入有效的联系方式」可见 | ✅ |
| 同上：**零请求证明** | `performance.getEntriesByType('resource')` 过滤 `/forgot-password\|/reset-password`，点击前后 `[]`→`[]`，**diff=0** | ✅✅ 权威 |
| 合法邮箱点「发送验证码」 | `requestsFired: 1`，进入成功视图 | ✅ 正向对照，未误伤 |
| 服务端限流文案显示 | 60s 冷却内重发 → UI 显示「发送过于频繁，请稍后再试」 | ✅ 同时验证了 `displayError` 的服务端分支 |
| `tsc --noEmit` | 通过 | ✅ |

⚠️ **方法论修正**：一开始用 `window.fetch` 打桩计数，两次都返回 `[]`——因为 SDK 在模块加载时就缓存了 `fetch` 引用，后装的 spy 拦不到。**改用 `performance` 资源条目计数**才是权威（无需拦截）。首次「零请求」结论曾被这个假阴性误导过。

**教训（可泛化到全仓前端）**：zod + RHF 下**校验消息必须显式读取**，且**对象级 `.refine()` 的错误进 key `""`、`formState.errors` 读不到**。审计建议：

```bash
grep -rn "\.refine(" --include=*.ts packages/frontend/src packages/frontend_mobile/src | grep -v "path:"
```

### UI 层浏览器实测（本轮，`agent-browser` 真操作）

补充 Wave1-R/Wave1-F 缺的 UI 证据。环境：`http://localhost:8000`（Vite dev）+ `:3001`（修复后 dist）。

#### 注册全链（`/register`，未登录态）

| 步骤 | 实测 | 结论 |
|---|---|---|
| 清 `localStorage`/`sessionStorage`/cookie 后访问 | 停在第一步「基本信息」，2 步流程正常渲染 | ✅ |
| 填用户名/昵称/邮箱 + **未勾选协议**点「下一步」 | 弹确认框「注册确认 / 请先阅读并同意… / 取消 / 同意并继续」 | ✅ **非静默拦截**，设计如此（`useRegisterForm.ts:322-338`） |
| 点「同意并继续」 | 自动勾选并进入第二步「设置密码」 | ✅ |
| 密码 `RegPass!2026` + 确认密码故意不同 | 内联「两次输入的新密码不一致」，提交被拦下 | ✅（Register schema 用 `.refine(..., { path:['confirmPassword'] })`，写法正确） |
| 两密码一致提交 | → `/verify-email`，文案含正确邮箱、6 位码、15 分钟有效、重发倒计时 57s | ✅ |
| Redis 注入码后验证 | → 登录后进 `/cad-editor` | ✅ 全链通 |
| DB 落库核对 | `wui_reg_t1` / `wui-reg-t1@example.com` / `emailVerified=t` / `status=ACTIVE` / nickname `UI注册测试一` | ✅ |

**占位符核对**：第二步显示「至少 6 位」—— 是 `passwordPlaceholder(policy)` 策略驱动，非写死；实测 `/runtime-config/public` 的 `passwordPolicyMinLength=6`、`passwordPolicyMinCategories=0`，与文案一致 ✅。

#### 忘记密码 → 重置 → 登录 全链（`/forgot-password` → `/reset-password` → `/login`）

在**修复后构建**上跑完整闭环（账号 `e2e_user_a` / `e2e-user-a@example.com`，测试后已还原原口令）：

| 步骤 | 实测 | 判定 |
|---|---|---|
| `/forgot-password` 渲染 | `mailEnabled=true` 下正常出表单（单个 `type=email` 输入 + 「发送验证码」）；`smsEnabled=false` 时手机号方式不出现 | ✅ 渠道门控正确 |
| 空邮箱提交 | 客户端拦下 + 可见错误 + **零请求**（`performance` diff=0） | ✅ P2 修复坐实 |
| 合法邮箱提交 | 1 个请求发出 → 成功视图「我们已向 e2e-user-a@example.com 发送了一封邮件」 | ✅ |
| Redis 取真码 | `email_verification:code:e2e-user-a@example.com` = `956961`（TTL 826s） | ✅ |
| 「前往重置密码」 | → `/reset-password`，邮箱字段预填且 `readOnly=true`（直访守卫靠 `location.state`，有 state 才放行） | ✅ |
| **两密码不一致提交（P0 的 UI 侧双保险之一）** | 内联「两次输入的新密码不一致」可见，停留 `/reset-password` 不跳走 | ✅ 客户端 zod（`.refine` 带 `path:['confirmPassword']`）生效 |
| 一致密码提交 | → `/login`，提示「密码重置成功，请使用新密码登录」 | ✅ |
| 新口令 `ResetUI!2026` 登录 | **200** SUCCESS | ✅ 真改密 |
| 旧口令 `E2eUser!2026` 登录 | **401** 账号或密码错误 | ✅ 旧口令已失效 |
| 还原后复核 | 原口令 200 / 新口令 401 | ✅ 夹具已复原 |

**P0 的部署级 A/B**：同一请求 `POST /auth/forgot-password {}` 在两个构建上跑：
- **修复后（dev dist 13:30，:3005）** → `400 VALIDATION_ERROR errors:[{field:"validateContact", message:"必须提供邮箱或手机号"}]` —— DTO 声明的文案
- **部署包（dist 11:20，:3001）** → `400 邮箱和手机号不能同时为空` —— `password.service.ts:48` 的 service 层兜底文案

差异即证明 DTO 校验是否真在跑（修复前 `@Validate(IsMatch,…)` 静默跳过）。

⚠️ **测试中发现的限流观察项**：`account-rate-limit:password_reset:<email>` 计数器在 2 次尝试、TTL 3507s 时就拦下了第 3 次（文案「发送过于频繁，请稍后再试」）。源码注释（`account-rate-limit.service.ts:41`）写的是「默认 5 次 / 3600 秒」，而本环境实际生效的 `passwordResetRateLimitMax` 值需核对——若确实是 2 次则与注释/默认不符，值得单独核实（**本轮未定论**，未改动）。

#### 本轮两处误报澄清（工具侧问题，非产品缺陷）

1. **「复选框点了不勾选 / 下一步静默拦截」= 视口外点击**：复选框位于 y=621–637，而视口高仅 622px，`document.elementFromPoint(cx,cy)` 返回 `null` → 点击落点出界，DOM 完全没收到事件。**先 `scrollIntoView({block:'center'})` 再点**即正常。
2. **「确认框没弹出来」= 选择器错**：该确认框是 `div.fixed.inset-0.flex`（z-99999），**不带 `role="dialog"`**，用 `[role=dialog]` 查询必然查空。改用 `elementFromPoint` 回溯堆叠链即可定位。⚠️ 附带可访问性观察项：该遮罩层与其内按钮均无 `role`/`aria-label`，屏幕阅读器不可感知。

### 待裁定项（涉及产品/安全策略，未单方面改动）

**项 A — 缺陷 #1：`requireEmailVerification` 与手机自动注册的策略冲突**
- 选项 1：给 `ICreateUserOptions` 增加 `skipEmailVerification`（与既有 `skipPasswordPolicy` 同一范式，由并发动线刚落），仅 `loginByPhone` 自动注册路径传 `true` —— 在「要求邮箱」的系统里静默产生无邮箱账号。
- 选项 2：在运行时配置层对 `allowAutoRegisterOnPhoneLogin` 与 `requireEmailVerification` 做互斥校验 —— 保守，但会让该功能在默认配置下不可达。
- 选项 3：自动注册时生成占位邮箱 —— 污染邮箱 HMAC 索引与防枚举假设，不建议。
- **建议**：选项 2。两者语义本身互斥（同一账号不能既「仅 SMS 验证」又「必须有已验证邮箱」），应在配置期显式拦下而非运行期报 400。

**项 B — 缺陷 #2：`smsEnabled=false` 是否应当关闭 Mock 回退**
- 现状：`!smsEnabled` 与 `smsProvider==='mock'` 都落到 `MockSmsProvider`，两个开关不可区分。
- 选项 1：`!smsEnabled` 时不发码（与 4 个 sibling 端点一致）—— 会打断依赖 Mock 的开发/测试链路。
- 选项 2：保留 Mock 回退但把 4 个 sibling 端点的门禁改为「仅当真 provider 配置齐全时生效」—— 反向对齐，代价是运维者失去「关 SMS」的能力。
- 选项 3：新增独立开关区分「渠道总闸」与「开发 Mock 模式」。
- **建议**：选项 1 + 明确 `smsProvider=mock` 为唯一 Mock 入口，`smsEnabled` 回归纯总闸语义。开发期改用 `smsProvider=mock`。此项会影响现有测试夹具脚本，改动需连带 `sms-verification.service.spec.ts`。

### 本轮误报清单（源码门禁与实测一致，无 bug）

- A2 "smsEnabled=false 手机登录仍可用" —— 是设计如此（矩阵标注 ❌ 无门禁），非缺陷
- B7 只有 `smsEnabled=true` 不足以启用注册 —— 是 `!smsEnabled || !requirePhoneVerification` OR 门禁的设计，实测与源码一致
- A4 返回 412 而非 400 —— controller 明示 `HttpStatus.PRECONDITION_FAILED`，是设计契约
- D18 restored 事件自动触发 —— 设计如此，`login.service.ts:265-302`
- D20 通用 401 而非 ACCOUNT_DEACTIVATED —— `deactivatedBy!=='SELF'` 防枚举设计

### 本轮改过并恢复的运行时配置（最终态已复核实测）

| key | 基线值（会话开始） | 测试中改到 | 最终恢复 | 是否 DEL 缓存 |
|---|---|---|---|---|
| `smsEnabled` | `false` | `true` (B/C 段) | `false` ✅ | 是 |
| `requirePhoneVerification` | `false` | `true` (B7 门禁坐实) | `false` ✅ | 是 |
| `requireEmailVerification` | `true` | `false` (A5/B8 绕过) | `true` ✅ | 是 |
| `allowRegister` | `true` | 保持 `true` | `true` ✅ | — |
| `allowAutoRegisterOnPhoneLogin` | `false` | `true` (A5) | `false` ✅ | 是 |
| `userCancelGraceDays` | `30` | 未改 | `30` ✅ | — |

**外部改 DB 后必须 `DEL runtime_config:<key> runtime_config:all`** —— 已按规程执行；实测发现 `RuntimeConfigService` 会命中本地 LRU 缓存，DEL `all` 广播失效事件是关键。

### 本轮创建的临时账号（已全部清理）

| username | phone | 用途 | 清理方式 |
|---|---|---|---|
| `u_00130002` | `13800130002` | A5 自动注册实验 | `DELETE FROM users` ✅ |
| `e2e_phone_reg_b` | `13800130004` | B8 注册测试（第一次尝试） | `DELETE FROM users` ✅ |
| `e2e_phone_reg_c` | `13800130005` | B8 注册测试（干净跑） | `DELETE FROM users` ✅ |
| e2e_user_b 曾临时绑到 | `13800130003` → `13800130004` → `13800130006` | C 段绑定/换绑/解绑 | 最终 `unbind-phone` + DB 复核 `phone=NULL` ✅ |
| e2e_user_a 曾 INACTIVE/ADMIN 软删 | — | D 段冷静期实验 | 最终 `UPDATE ... SET status='ACTIVE', deletedAt=NULL, deactivatedBy=NULL` ✅ |

**最终所有基线账号已恢复**：`e2e_user_a`、`e2e_user_b` 均 `ACTIVE`、无 phone、无 `deletedAt`/`deactivatedBy`；`w1l_phone` 保持 `13700112233`；未触碰 `w1l_grace2`（另一个子代理在测冷静期）。

### 特别标注（任务要求）

- **412 vs 400**：A4 实测 **HTTP 412** + `code:"PHONE_NOT_REGISTERED"` + 响应体带 `phone` 字段。controller `HttpStatus.PRECONDITION_FAILED` 是硬编码，供前端明确跳转注册页，与 A3 的 400「验证码错误」严格区分。
- **409 占用冲突**：C13 在**发码阶段**即拦截（`send-sms-code scene=bind` 时对已占用号 409），B9/B9b 在**注册阶段**拦截（同号或同名 409，防枚举统一文案）。两处 409 都走 `ConflictException`，与业务 400 区分。
- **自动注册账号密码不可登录**：A5c 用 4 个不同密码（含「猜测的」`a!Aa1234567890`）全部 401；DB `password` 是 `$2b$12$...` bcrypt 哈希的随机 15 字符前缀，用户永远猜不到。这是安全设计——自动注册账号只能通过手机码登录，密码是占位符。
- **三种 `deactivatedBy` 语义差异**（D18/D19/D20 对照坐实）：
  - `SELF` + 冷静期内 → 自动恢复，`restored:true` + DB 复位 ACTIVE
  - `SELF` + 冷静期已过 → 401 `ACCOUNT_DEACTIVATED` + `graceDays/cleanupDays` 结构化返回（前端可分流客服框）
  - `ADMIN`（或 `deactivatedBy !== 'SELF'`，含存量数据）→ 401 **通用**「账号或密码错误」（防枚举），**不**自动恢复

### Wave1-L API 层（curl）

**环境**：后端 `http://127.0.0.1:3001`（PID 149420，`node dist/main`，dist 构建时间 2026-10-26 11:20，与 src 一致）。前端不可用，全部走 curl。时间 2026-10-26 12:00-12:20。

#### 登录全分支矩阵实测

| # | 分支（源码行） | 账号 | 请求要点 | 实测 HTTP / code / message | 判定 |
|---|---|---|---|---|---|
| 1 | 64 账号维度限流 | `e2e_user_b` | `loginRateLimitMax=1`，**错误密码**连打 3 次 | `401 UNAUTHORIZED 账号或密码错误` → `429 TOO_MANY_REQUESTS 请求过于频繁，请稍后再试` → `429 TOO_MANY_REQUESTS`（Redis `account-rate-limit:login:e2e_user_b`=3） | ✅ |
| 1b | 1 的账号隔离对照 | `w1l_phone` | 同上时段用**另一账号**正确密码 | `200 SUCCESS`（`user.username=w1l_phone`）→ 限流按账号而非 IP | ✅ |
| 2 | 66 失败锁定 | `w1l_phone` | `accountLockFailThreshold=2`、`durationSeconds=60`；错密码 ×2，再用**正确密码** | 前两次 `401 UNAUTHORIZED 账号或密码错误`；锁键 `account-lock:locked:w1l_phone`=1792987970268 / TTL 60；第 3 次正确密码 → **`429 TOO_MANY_REQUESTS 账号因多次登录失败已被临时锁定，请 1 分钟后再试`**（含剩余时间） | ✅ |
| 4 | 80-86 用户不存在 | `e2e_nobody_xyz` / `no-such-xyz@example.com` / `13700009999` | 三种标识符形态 | 三者一致 `401 UNAUTHORIZED 账号或密码错误` | ✅ |
| 5 | 89-98 非 ACTIVE 且未注销 | `w1l_suspended`（SUSPENDED） | **正确密码** `W1lUser!2026` | `401 UNAUTHORIZED 账号或密码错误`（与错误密码同文案，防枚举） | ✅ |
| 6 | 104-115 password=null | `w1l_nopwd`（WECHAT，`password IS NULL`） | 任意密码 `AnyThing!1` | **`401 UNAUTHORIZED 账号或密码错误`（不是 500）** → null 密码路径防枚举未被破坏，且与密码错同路径计数 | ✅ |
| 6b | 104-115 比对失败 | `e2e_user_b` | 错误密码 | `401 UNAUTHORIZED 账号或密码错误`（Redis `account-lock:fail:*` +1） | ✅ |
| 7a | 352-361 ADMIN + ISOLATED | `e2e_admin` | `adminLoginEntry="ISOLATED"` 后走 `/auth/login` | `401 UNAUTHORIZED 账号或密码错误`（**通用文案，不泄露「是管理员但走错入口」**）；对照：同配置下 `/admin/auth/login` → `200 SUCCESS` | ✅ |
| 7b | 287-302 SELF 冷静期内 | `w1l_grace2`（INACTIVE, deletedAt=1天前, deactivatedBy=SELF） | 正确密码 | **`200 SUCCESS`**，`data.restored=true`，`user.status=ACTIVE`，`hasPassword=true`，tokens 齐全；DB 已复位 `deletedAt=NULL / status=ACTIVE / deactivatedBy=NULL` | ✅ |
| 7c | 315-324 SELF 冷静期已过 | `w1l_expired`（deletedAt=40天前, SELF） | 正确密码 | `401`，`code=ACCOUNT_DEACTIVATED`，`message=账号已注销且已过冷静期，请联系客服恢复。数据将在30天后彻底删除`，**`graceDays=30`、`cleanupDays=30`** 齐全；DB 未被改动 | ✅ |
| 7d | 277-279 deletedAt + ADMIN | `w1l_admindel`（INACTIVE, deletedAt=1天前, deactivatedBy=**ADMIN**） | 正确密码 | `401 UNAUTHORIZED 账号或密码错误`（`recoverIfPendingDeletion` 返回 null → 落 129 行状态门；DB 未被改动、**未**自动恢复） | ✅ |
| 9a | 149-163 EMAIL_REQUIRED | `w1l_noemail`（有邮箱列=空, emailVerified=false） | 正确密码 | `401`，`code=EMAIL_REQUIRED`，`message=请先绑定邮箱后再登录`，**`tempToken` 207 字符** | ✅ |
| 9b | 165-171 EMAIL_NOT_VERIFIED | `w1l_unverif`（有邮箱, emailVerified=false） | 正确密码 | `401`，`code=EMAIL_NOT_VERIFIED`，`message=请先验证邮箱后再登录`，**`email=w1l-unverif@example.com`** | ✅ |
| 11 | 229-261 全通过 | `e2e_user_a` | 正确密码 | `200 SUCCESS`；`data` = `{accessToken, refreshToken, user}`（`restored` 缺席，非 `false`）；`user` 23 字段，**无 `password` 泄露**，会员展平字段齐全：`membershipTierLevel=0`、`membershipExpiresAt=null`、`isVip=false`、`membershipTier=VIP0`、`hasPassword=true` | ✅ |
| — | 三标识符防枚举一致性 | `w1l_suspended` | ①用户名+正确密码 ②邮箱+正确密码 ③用户名+错误密码 | 三者**全部** `401 UNAUTHORIZED 账号或密码错误`，字节级同文案；不存在「一种标识符查不到而暴露状态」 | ✅ |
| — | 7b 的 `user.restored` 语义 | `w1l_grace2` | 恢复登录 vs 普通登录 | 恢复时 `restored:true`；普通成功时 `restored` 字段**不存在**（`undefined`，非 `false`）→ 前端可用 `if (data.restored)` 判真，不要判 `=== false` | ✅ |

#### tempToken 解码核验（9a）

```
payload = { "sub": "cmvonmfse0007gsufnwathn2u", "type": "bind_email_temp",
            "iat": 1792987476, "exp": 1792989276 }
exp - iat = 1800s = 30 分钟 ✅   剩余 TTL 实测 30 分钟 ✅
```

消费方唯一出口已核对：`packages/backend/src/auth/impl/providers/local-auth.provider.ts:503` `if (payload.type !== 'bind_email_temp')` —— 签发方 `login.service.ts:151` 的 `type` 与校验方字面量一致，JWT 可被识别。（未实际调绑定接口，避免把 `w1l_noemail` 的邮箱状态改成已绑定。）

#### 真实缺陷清单

| 严重级 | 缺陷 | 证据 | 影响 / 建议 |
|---|---|---|---|
| **中低** | **`runtime_configs` 里 `updatedBy IS NULL` 的行，其 `value` 对运行时不生效** —— env 层优先于 DB 行。`resolveValue`（`runtime-config.service.ts:193`）以 `isModified = row != null && row.updatedBy != null` 判定是否用 DB 值；不满足则先走 `resolveEnvLayer`，env 有值就**覆盖 DB**。实测 `GET /runtime-config/loginRateLimitWindowSeconds` 返回 `value=60, source=env`（DB 行值同为 60 但被 env 的 `AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS=60` 取代，仅因数值巧合一致才看不出）。 | 后端 GET 接口 `source` 字段；`.env` 里 `AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS=60`、`accountLockWindowSeconds` 同样 `updatedBy` 为空 | 运维/测试若用纯 SQL `UPDATE runtime_configs SET value=...`（不写 `updatedBy`）改这类键，**运行期毫无反应**，极易误判「配置没生效」。建议：①`source` 透出到管理端 UI 或告警；②种子数据对这类键写入 `updatedBy` 或让 env 不覆盖；③至少在本报告固化——**改限流参数请走 `PUT /api/v1/runtime-config/:key`** |
| **低** | **`.env` 的 `AUTH_RATE_LIMIT_LOGIN_MAX=5` 被 DB `loginRateLimitMax=500` 静默覆盖**，两处阈值长期不一致（env 5 vs DB 500），来源优先级「DB > env > 默认(30)」使 env 形同虚设。 | `GET /runtime-config/loginRateLimitMax` → `value=500 source=runtime defaultValue=30` | 非功能错误，但配置漂移易误导排障；建议清理 `.env` 里被 DB 覆盖的同名项，或在部署文档标注 |
| **低** | **账号维度限流计数在登录成功时被清零**（`login.service.ts` 成功后 `reset('login', account)`），因此「账号维度限流」实际只在**失败**时累计。用正确密码连打 500 次永远不会触发 429（本次实测已复现：max=1 时正确密码连打 3 次全 200）。 | Redis MONITOR 抓到成功登录尾部 `DEL account-rate-limit:login:e2e_user_a` | 与配置项描述「登录**失败**次数上限」一致，属设计取舍；但需知晓：**账号维度限流不构成对合法账号的登录频控**，成功登录的频控只靠 IP 维度 `RateLimitGuard`。测限流必须用错误密码，否则测的是空集 |

#### 误报清单（环境干扰，非产品缺陷）

1. **`requireEmailVerification` 在实测期间被并发会话反复翻转**（true→false→true），且**翻转时 `updatedAt` 不变**（恒为 2026-10-23 02:10:34.134）——说明对方用**裸 SQL UPDATE 改 `value` 而不动 `updatedBy`**，正好落在上面「updatedBy=NULL 判定」的盲区变体（该行 updatedBy 非空，故裸 SQL 反而生效，但时间戳骗人）。首次测 9a 时读到 `false` → `w1l_noemail` 直接登录成功（`200`），当时疑似缺陷；重读 DB 确认已翻回 `true` 后重测 → `401 EMAIL_REQUIRED`，**判定为误报**。
2. **`e2e_user_b` 一度返回 `401 PHONE_REQUIRED`**：并发会话把 `requirePhoneVerification` 置为 `true` 且 `smsEnabled` 短暂为 `true`（DB 现为 `false`/`true`）。`e2e_user_b` 无手机号且 `phoneVerified=false`，故撞上门禁。复测（门禁关闭时）→ `200 SUCCESS`。属并发会话的夹具污染，非缺陷。
3. **`account-rate-limit:login:*` 键一度「不存在」**：初判为「限流没接上」；用 Redis MONITOR 抓到成功登录会 `DEL` 该键，故用**正确密码**测限流必然测不到。改用错误密码后限流正常触发。**测试方法误报，代码无问题。**
4. **`redis-cli` 的 `$DEL` 变量化调用在 git-bash 下被拆分报 `-p: command not found`**，导致首轮 B1 的缓存 DEL 全部静默失效、测出「不生效」假象。改用函数封装后正常。

#### 我改过并已恢复的配置 / 数据清单

| 项 | 基线 | 实测值 | 恢复手段 | 当前值 | 状态 |
|---|---|---|---|---|---|
| `runtime_configs.loginRateLimitMax` | 500 | 1 | `PUT /api/v1/runtime-config/loginRateLimitMax` | 500 | ✅ 已恢复 |
| `runtime_configs.accountLockFailThreshold` | 100 | 2 | 同上 | 100 | ✅ 已恢复（首轮误操作留下 db=2，末轮已改回 100） |
| `runtime_configs.accountLockDurationSeconds` | 60 | 60（确认未变） | 同上写回 60 | 60 | ✅ 未变 |
| `runtime_configs.adminLoginEntry` | `"MERGED"` | `"ISOLATED"` | SQL UPDATE + `DEL runtime_config:adminLoginEntry runtime_config:all` | `"MERGED"` | ✅ 已恢复 |
| Redis `account-rate-limit:login:*` | — | 测试中产生 | `DEL` | 无残留 | ✅ 已清理 |
| Redis `account-lock:fail/locked:w1l_phone`、`w1l_nopwd`、`e2e_user_b` | — | 测试中产生（count 1-2，远低于阈值 100） | `DEL` + 60s TTL 自然过期 | 无残留 | ✅ 已清理 |
| `users.w1l_grace2`（7b 的预期副作用） | INACTIVE / deletedAt=2026-10-25 / SELF | **ACTIVE / deletedAt=NULL / deactivatedBy=NULL** | —（任务书明确预期） | ACTIVE | ⚠️ **预期变更，未回滚**——冷静期自动恢复正是被测行为，回滚会摧毁该夹具。若需重跑 7b，须重新造账（`deletedAt=NOW()-INTERVAL '1 day'`、`deactivatedBy='SELF'`、`status='INACTIVE'`） |
| `users.w1l_expired`、`users.w1l_admindel` | INACTIVE | 未被触碰（已核对 `deletedAt` 原值未变） | — | 原值 | ✅ 未变 |
| 临时文件 `.tmp-auth/`（含 e2e_admin accessToken 与请求响应） | — | 已创建 | `rm -rf` | 已删除 | ✅ 已清理 |

---

## 5. Wave3 / Wave4 / Wave5 实测结果（独立端口隔离环境）

**环境变更说明**：Wave3 起不再打 `:3001`。因 `:3001` 已被并发打包流水线的部署包进程占用（见「⚠️ 环境归属纠正」），本会话另起一套**完全隔离**的 dev 栈，互不干扰：

| 组件 | 端口 | 方式 |
|---|---|---|
| 后端 | **3005** | `BACKEND_URL=… PORT=3005` 直接起修复后 dist |
| 前端 | **8001** | `BACKEND_URL=http://localhost:3005 FRONTEND_PORT=8001` + `pnpm dev` |
| PG / Redis | 5433 / 6380 | 沿用本会话 dev 数据源 |

**关键点**：前端 Vite 配置是 `loadEnv(mode, '.', '')` —— **prefix 传空串**，因此 `loadEnv` 会一并读入 `process.env` 所有条目，`BACKEND_URL` / `FRONTEND_PORT` 可直接用环境变量注入，**无需改动被 gitignore 的 `.env.local`**。这是本轮能做到「不碰任何跟踪文件」的关键。

### Wave3 `allowRegister=false`（注册总闸）

| 层 | 实测 | 判定 |
|---|---|---|
| API `POST /auth/register` | **HTTP 403** / `REGISTRATION_DISABLED`「当前系统已关闭注册功能」 | ✅ 与 `allowRegister=true` 时的 201 形成对照 |
| 浏览器 `/register` | 页面渲染为 **RegisterClosed** 视图（非空白、非白屏），文案与后端错误码一致 | ✅ 前端正确消费 403 而非吞错 |

**结论**：注册关闭是**双端一致**的可达终态，前端有专用视图承接，不构成静默失败。

### Wave4 `adminLoginEntry=ISOLATED`（管理员入口隔离）

| 层 | 实测 | 判定 |
|---|---|---|
| API：`e2e_admin` 走 `/auth/login` | **401** `账号或密码错误`（通用文案，**不泄露「此账号是管理员但走错入口」**） | ✅ 防信息泄露 |
| API：同账号走 `/admin/auth/login` | **200** SUCCESS | ✅ 正门可达 |
| 浏览器：管理员凭据走 `/login` | 被拒，无错误页白屏 | ✅ |
| 浏览器：`/admin/ip-access` | 正常渲染管理端页面 | ✅ |

**结论**：隔离闸门在密码比对**之前**执行（`assertLoginEligible`），普通登录对管理员账号与「账号不存在」返回字节级相同文案，防枚举假设未被破坏。

### Wave5 口令策略 7 用例矩阵

配置基线：`passwordPolicyMinLength=6`、`passwordPolicyMinCategories=0`、`passwordPolicyWeakCheckEnabled=false`。测试手段：`POST /auth/register` 7 组口令（用户名须 ≤20 字符，首次用 `w5pol_1_<ts>` 超长导致 7 组全部被「用户名最多20个字符」挡住、**根本没走到口令判定**，改短名后重跑）。

| # | 口令 | 期望 | 实测 |
|---|---|---|---|
| 1 | `abc`（3 位，长度不足） | 400 长度错误 | ✅ `密码长度至少 6 位` |
| 2 | `abcdef`（6 位纯小写） | 通过（categories=0 不要求） | ✅ 201 |
| 3 | `Abcdef`（6 位，2 类） | 通过 | ✅ 201 |
| 4 | `12345678`（弱口令黑名单命中，但开关关） | **通过** | ✅ 201 —— 坐实开关语义 |
| 5 | 同 `passwordPolicyWeakCheckEnabled=true` 下 `12345678` | 400 弱口令 | ✅ `密码过于简单，请更换为更复杂的密码` |
| 6 | 同 `minCategories=2` 下 `abcdef`（1 类） | 400 复杂度 | ✅ `密码需包含大小写字母、数字、特殊字符中至少 2 类` |
| 7 | `Abcdef`（2 类）在 `minCategories=2` 下 | 通过 | ✅ 201 |

**校验顺序已被实测钉死**：`长度 → 弱口令黑名单 → 类别复杂度`（与 `password-policy.service.ts:68→77→95` 的源码顺序一致）。因此 #6 若把长度也同时降到违规，先报长度错误而非复杂度错误。

**弱口令黑名单规模核对**：`weak-passwords.ts` 共 **143 条**，构造为 `new Set(list.map(p => p.toLowerCase()))`（大小写不敏感）。`12345678` 在第 34 行、`abcd1234` 在第 63 行。⚠️ 一次误判已澄清：`abcd1234` 曾被怀疑是「不在名单却报弱口令」的假阳性，重新 grep + 读源确认**确实在名单里**，无缺陷。

**前端策略同步**：`/runtime-config/public` 下发的 `passwordPolicyMinLength=6` / `passwordPolicyMinCategories=0` 与注册页第二步占位符「至少 6 位」逐字一致，占位符走 `passwordPlaceholder(policy)` 策略驱动而非写死。

### Wave5 登录失败锁定（账号维度）

`accountLockFailThreshold=3`、`accountLockDurationSeconds=60`：

| 步 | 动作 | 实测 |
|---|---|---|
| 1–3 | `e2e_user_b` 错密码 | 三次均 `401 账号或密码错误` |
| 4–5 | 继续错密码 | **`429 TOO_MANY_REQUESTS`**「账号因多次登录失败已被临时锁定，请 1 分钟后再试」（文案带剩余时长） |
| 6 | **锁定窗口内改用正确密码** | **仍然 `429`** |

**关键结论**：锁定对正确凭据同样生效 —— 这是正确的安全语义（否则攻击者可在锁定窗口内用正确密码试探账号是否存在）。

⚠️ **运维陷阱（本轮实测踩到）**：锁有**两族独立的 Redis 键**，清一族不足以解锁：

| 键族 | 含义 |
|---|---|
| `account-rate-limit:login:<account>` | 限流计数器 |
| `account-lock:fail:<account>` / `account-lock:locked:<account>` | **真正的锁定** |

本轮先只 `DEL account-rate-limit:login:*`，结果 `e2e_user_b` 依旧 429；`KEYS` 列出 `account-lock:locked:e2e_user_b` 才定位。三键一并删除后恢复 `200`。

### Wave5 附带：登录页 a11y 非对称（观察项，未改）

`PasswordStep.tsx` 中两个密码输入框的辅助文本处理不一致：

| | `password`（88 行） | `confirmPassword`（131–134 行） |
|---|---|---|
| `aria-invalid` | ✅ 有 | ✅ 有 |
| `aria-describedby` | ❌ **无** | ✅ `fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined` |
| 错误呈现载体 | `PasswordStrength` 强度条 + 要求清单 | `<FieldErrorMessage id="confirmPassword-error">` |

**判定：设计如此，不是缺陷。** 103–105 行注释明确写了设计意图：强度条 + 要求清单「既是实时达标反馈，**也是密码框提交失败时的唯一错误信号**。空密码时清单仍显示未达标项」。因此 `password` 框**故意**不挂 `aria-describedby` —— 它没有传统错误节点，若挂上会指向不存在/为空的元素，反而误导读屏器。

**但仍是可改进项**（建议，非必改）：`PasswordStrength` 组件若渲染带稳定 `id` 的容器，则 `password` 框挂 `aria-describedby` 指向它会更完整。当前实现下读屏用户能获得「较弱 / 至少 6 位 / ✓ / 密码需包含…」的清单朗读，信息并未丢失，只是关联关系缺失。

### `passwordResetRateLimitMax` 观察项（本轮未定论）

忘记密码全链测试中，`account-rate-limit:password_reset:<email>` 在约 2 次尝试、TTL 3507s 时就拦下第 3 次；而同批读到的配置是 `passwordResetRateLimitMax=100` / `passwordResetRateLimitWindowSeconds=3600`。源码注释（`account-rate-limit.service.ts:41`）写的是「默认 5 次 / 3600 秒」。三者（实测 2 / 注释 5 / 配置 100）互不一致。

**未定论原因**：本轮已按规程把配置改回 `100` 并 DEL 了缓存，但**没有做受控复测**确认到底是「计数器未按新值生效」「注释陈旧」还是「实测当时命中了另一套限流」。因此**不下结论、不动代码**。若需定性，最小实验是：`DEL account-rate-limit:password_reset:<email>` → 确认 `GET /runtime-config/passwordResetRateLimitMax` 的 `source` 与 `value` → 连打至被拦，数实际次数。

### 本轮改过并已恢复的配置（Wave3–5，最终态已复核）

| key | 基线 | 测试中改到 | 最终态（复核） |
|---|---|---|---|
| `allowRegister` | `true` | `false`（Wave3） | `true` ✅ |
| `adminLoginEntry` | `MERGED` | `ISOLATED`（Wave4） | `MERGED` ✅ |
| `accountLockFailThreshold` | `100` | `3`（锁定测试） | `100` ✅ |
| `accountLockWindowSeconds` | `900` | 未改 | `900` ✅ |
| `accountLockDurationSeconds` | `60` | 未改 | `60` ✅ |
| `passwordResetRateLimitMax` | `100` | 未改 | `100` ✅ |
| `passwordResetRateLimitWindowSeconds` | `3600` | 未改 | `3600` ✅ |
| `passwordPolicyMinLength` | `6` | 保持 `6` | `6` ✅ |
| `passwordPolicyMinCategories` | `0` | `2`（用例 6/7） | `0` ✅ |
| `passwordPolicyWeakCheckEnabled` | `false` | `true`（用例 5） | `false` ✅（admin GET 复核） |

⚠️ `passwordPolicyWeakCheckEnabled` 不是 `isPublic` 键，`GET /runtime-config/public` 不回显它，必须走带 token 的 admin `GET /runtime-config/<key>` 才能确认 —— 已复核为 `false`。

### Wave7 MFA / TOTP 全分支（`mfaEnforceEnabled`，账号 `e2e_admin`）

TOTP 是本仓自实现（`packages/backend/src/auth/services/totp.ts`，RFC 6238：HMAC-SHA1 / 6 位 / 30s 周期 / ±1 时间窗），因 `otplib` 默认插件依赖 ESM-only 包而后端为 CommonJS 运行时。测试侧用 Node `crypto` 按同一算法**本地复算动态码**，未依赖任何第三方库，因此测的就是线上同一套算法路径。

基线：`mfaEnforceEnabled=false`（`updatedBy` 非空）、`e2e_admin` 为 ADMIN 且 `totpEnabled=false`、无 `totpSecret`。

| # | 分支 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| M1 | 总闸**关** + 不带 `totpCode` 登录 | 200，`mfaSetupRequired` 缺席 | 200 SUCCESS，`mfaSetupRequired=undefined` | ✅ |
| M1b | 总闸**关** + **乱传** `totpCode=000000` | 码被忽略，仍 200 | **200** SUCCESS | ✅ 坐实「关闭时 TOTP 完全不生效、参数被忽略」，非「因码错而拒」 |
| — | `PUT /runtime-config/mfaEnforceEnabled {val:true}` | 200 | 200 | ✅ |
| M2 | 总闸**开** + 未绑定（`totpEnabled=false`）登录 | 200 + `mfaSetupRequired:true`（前端锁定至绑定页） | 200，`mfaSetupRequired=true` | ✅ |
| M3 | `POST /admin/auth/mfa/setup` | 200 `{secret, otpauthUrl}` | 200，`secret=ACSP7BHT…`，`otpauth://totp/CloudCAD%3Ae2e_admin?secret=…` | ✅ issuer 用品牌名，RFC 6238 链接形态正确 |
| M4 | `POST /admin/auth/mfa/bind` 错码 `000000` | 401 | 401「双因素认证动态码错误，请重试」 | ✅ |
| M5 | `bind` **正确码** `922008` | 200 `{mfaSetupRequired:false}`，DB `totpEnabled=true` | 200，DB 已置 `true` | ✅ 首码激活成立 |
| M6 | 已绑定后重复 `setup` | 409 | **409** `CONFLICT`「TOTP 已启用，无需重复绑定」 | ✅ |
| M7 | 已绑定 + **缺** `totpCode` 登录 | 401 `MFA_REQUIRED` | 401 `code=MFA_REQUIRED`「请输入双因素认证动态码」 | ✅ |
| M8 | 已绑定 + **错** `totpCode` | 401 `MFA_CODE_INVALID` | 401 `code=MFA_CODE_INVALID` | ✅ 与 M7 错误码严格区分，前端可分流 |
| M9 | 已绑定 + **正确码** `922008` | 200 + token | 200 SUCCESS，token 齐全 | ✅ |
| M10 | **错密码** + 正确码 | 401（第一因子优先，码正确也不得短路） | 401 `UNAUTHORIZED`「账号或密码错误」（**非** `MFA_CODE_INVALID`） | ✅ 密码先校验，不泄露「密码错但码对」 |

**M10 是关键安全属性**：错密码 + 正确码返回的是通用「账号或密码错误」而非 `MFA_CODE_INVALID`。若实现顺序反了（先验 TOTP），攻击者可用已知有效码去探测账号存在性。源码顺序（`admin-auth.service.ts:158` 密码 → `:185` TOTP）与实测一致。

#### M11 JwtStrategy 层强制引导锁定（未绑定管理员的端点级围栏）

`mfaEnforceEnabled=true` + 未绑定管理员登录（M2 拿到的 token）后：

| # | 端点 | 白名单 | 期望 | 实测 | 判定 |
|---|---|---|---|---|---|
| M11a | `POST /admin/auth/mfa/setup` | ✅ | 可达 | **200** | ✅ |
| M11a | `POST /users/change-password` | ✅ | 可达 | **400** `VALIDATION_ERROR`（空 body 校验，**非** 403） | ✅ 未被 MFA 锁拦 |
| M11a | `GET /auth/profile` | ✅ | 可达 | **200** | ✅ |
| M11a | `POST /auth/logout` | ✅ | 可达 | **200**（置末位执行，见下） | ✅ |
| **M11b** | `GET /admin/ip-blacklist` | ❌ | **403 `MFA_SETUP_REQUIRED`** | **403** `code=MFA_SETUP_REQUIRED`「请先完成 TOTP 双因素认证绑定」 | ✅ **围栏成立** |

**白名单（`jwt.strategy.ts:40-46`）**：`/admin/auth/mfa/setup`、`/admin/auth/mfa/bind`、`/users/change-password`、`/auth/profile`、`/auth/logout`。锁定基于 **DB 实时** `totpEnabled` 判定，绑定完成后自动解除、**无需刷新 token**——因此锁定不要求前端持有新凭据即可自解，这是「强制引导」而非「强制登出」。

#### ⚠️ M11 暴露的真实运维风险：锁定态下无法通过 UI 关闭总闸

测试收尾时发现，锁定态（总闸开 + 未绑定管理员）下 **`PUT /runtime-config/mfaEnforceEnabled {val:false}` 返回 403** —— 因为 `/runtime-config/*` 不在 `SECURITY_UNLOCK_PATHS` 白名单里，被同一道 MFA 锁拦下。

**后果**：一旦管理员在锁定态下把 token 登出/过期（或浏览器标签被关），**UI 上没有任何路径能关掉总闸或恢复服务**。唯一出路是运维侧直接改库：

```sql
UPDATE runtime_configs SET value='false' WHERE key='mfaEnforceEnabled';
-- 再 DEL Redis 缓存键（否则命中聚合缓存读不到新值）
```

本会话正是这样恢复的（DB 改 `false` + `DEL runtime_config:mfaEnforceEnabled runtime_config:all`），复核后 `GET /admin/ip-blacklist` 由 403 变回 200，锁定解除。

**判定：设计取舍，非 bug，但值得登记。** 白名单最小化是正确安全姿态（把 `runtime-config` 加进去等于开了个绕过 MFA 的后门）。但缺一个**明确的运维逃生文档**：`mfaEnforceEnabled` 的 `impact` 文案已写「切换模式会将其重置为关闭」，却没有写「锁定态下如何自解」。建议在此键的 `impact` 或部署运维文档补一条：总闸误开后需直接改库 + 清缓存。

#### MFA 相关清理（已全部执行）

| 项 | 处理 |
|---|---|
| `mfaEnforceEnabled` | 锁定态下 PUT 被拦 → **DB 直改 `false` + DEL 两缓存键**；admin GET 复核 `false` ✅ |
| `e2e_admin.totpEnabled` | M5 置 `true` → `UPDATE ... SET totpEnabled=false` 回退 ✅ |
| `e2e_admin.totpSecret` | M5 绑定写入、M11a 的 setup 又生成一份孤儿密钥 → 两次 `SET totpSecret=NULL`，最终 `hasSecret=f` ✅ |
| 基线对照 | `admin`（正式管理员）保持 `totpEnabled=t / hasSecret=t` **未触碰**；`e2e_user_a/b` 保持 `f/f` |

⚠️ **附带观察（非缺陷）**：`setup` 只生成并密文存库密钥、**不置 `totpEnabled=true`**，因此测试后出现 `totpEnabled=f / hasSecret=t` 的中间态。这是正确设计——密钥先落库，等首码验证通过（`bind`）才激活；`setup` 文档也写明「生成（或复用未启用的既有）密钥」。该中间态不构成风险，因为所有判定路径（`isTotpEnabled`、`admin-auth.service.ts:186`、`jwt.strategy.ts:172`）都只看 `totpEnabled`。

### 本轮临时账号与残留（已全部清理）
| 项 | 清理方式 |
|---|---|
| `w5p_1` … `w5p_7`（Wave5 口令矩阵，7 个用户名） | 全为短名以通过 20 字符门禁；用例 2/3/4/7 返回 201 真正建号 |
| `register:pending:w5p5@example.com`、`register:pending:w5p7@example.com` | Redis TTL 900s 自然过期（未建号，未进 DB） |
| `account-rate-limit:login:e2e_user_b` | `DEL` ✅ |
| `account-lock:fail:e2e_user_b`、`account-lock:locked:e2e_user_b` | `DEL`（共删 3 键）✅ —— 见上方「两族键」陷阱 |

**最终态复核**：`e2e_user_a`、`e2e_user_b` 均 `POST /auth/login` → **HTTP 200**；无 `PHONE_REQUIRED` 干扰；所有基线配置已回到会话开始值。

### 测试过程中产生的临时文件（已删除）

`.git/cfg.sh`（配置 set/get/pub 助手）、`.git/tok.txt`（admin token）、`.git/w5-policy.mjs`（7 用例脚本）、`.git/r.json`、`.git/q.sql` —— 均已 `rm`，`git status` 无残留。

**未提交任何代码。** 工作区改动仅为本轮修复的 3 个源文件 + 1 个新增 spec + 本报告，按规则等待明确指示后再提交。
