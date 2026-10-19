# 安全模式 / 普通模式 双模式体系规划（wayfinder map）

> 状态：**勘察完成 + 目的地已定稿，frontier 待逐票裁决** · 2026-10-19
> ⚠️ **票据未落 Gitea**：当前令牌 scope 仅 `public-only`，仓库 `qjx/cloudcad` 私有 → 所有 repo 端点 404（已实测 `/labels` `/issues` `POST` 均 404）。本文件是**本地暂存地图**，令牌补齐 `read:repository`/`write:issue` 后需迁移为 `wayfinder:map` 票，子票按 T1–T11 建票并挂 `wayfinder:<type>` 标签。
> 票据约定见 `docs/agents/issue-tracker.md` § Wayfinding operations（父子走 body 约定、blocking 走 `## Blocked by` 小节）。
>
> 涉及**三层一致性**：前端 / API SDK / 后端 / DB 四端全动（新增配置项需重生 SDK + MSW；审计枚举若新增需 migration）。与 `docs/packaging-unification-plan.md` 的「纯打包、三层零改动」不同。

---

## 一、目的地（Destination）

一个**总开关** `securityMode`（`secure` / `normal`），驱动**一批细节开关**按 profile 批量取目标值：

- **`normal`（普通模式）= 默认**，用于本地部署包与测试。目标是「怎么适合用户体验怎么来」——放开为安全考虑而设的注册/账号/提示/入口限制。
- **`secure`（安全模式）= 用于生产与等保送测**。默认关闭，须管理员显式开启；开启后横幅提示「当前配置符合安全配置」。

验收形态：一张 Gitea wayfinder 地图上 T1–T11 全部闭合 → 一份 ADR（双模式机制 + 与打包期 variant 的边界）→ 一组带 `ready-for-agent` 标签的实施票。

**不是**：新增安全能力。勘察结论是能力大多已建成（见 §四），缺的是**默认值档位与一个总开关**。

---

## 二、已拍板（grilling 未获答复，按推荐项推进；任一可翻案，翻案只影响其下游票）

| 决策 | 选定 | 翻案代价 |
|---|---|---|
| **模式载体** | `securityMode` 进 `RUNTIME_CONFIG_DEFINITIONS` 且 `isPublic: true`；`.env` 另留 `DEPLOY_SECURITY_MODE` 作部署期默认。管理员可随时在 `/runtime-config` 切换、无需重启 | 改「仅 .env」则切换需重启，本地来回测试体验差 |
| **密码复杂度** | **不动 `password-policy`**。普通模式只放宽文案与入口，口令规则维持 10 位 + 3 类不变 | 若翻案要放宽规则，触发 T3 的结构性改造（最热安全路径） |
| **管理员入口** | `adminLoginEntry: ISOLATED\|MERGED`。普通模式 `MERGED`（管理员可从 `/login` 登录），安全模式 `ISOLATED`（保持双向硬隔离） | 影响 T4 |
| **横幅受众** | 全局 ADMIN 横幅（`Layout.tsx`）+ `/runtime-config` 页可交互横幅（带切换按钮）。普通 `USER` 看不到 | 影响 T10 |

---

## 三、Frontier（可开工的决策票）

阻塞图（箭头 = 被阻塞 → 阻塞者）：

```
T1 目标值表形态 ──┬─→ T2 批量写语义 ──┬─→ T4 管理员入口对称性
                 │                   ├─→ T10 横幅与切换交互
                 │                   └─→ T11 逐项裁决
                 └─→ T11 逐项裁决
T3 口令策略范围裁决     （独立）
T5 未登录/登出态通道治理 （独立）
T6 等保审计缺口取舍     （独立）
T7 CSRF 缺陷 + ticket 范式（独立，与 T5 有交集）
T8 docker config-service 读错 .env（独立）
T9 variant × securityMode 边界（独立，需 ADR）
```

### T1 · 目标值表的单一事实源形态（research → decision）
在 `RUNTIME_CONFIG_DEFINITIONS` 每项上加 `profile: { secure, normal }` 元数据，还是另立 `runtime-config-profiles.ts` 声明 `{ key: { secure, normal } }`？
- 前者与「定义表是唯一事实源」自洽，但定义表已 927 行；后者让定义表不动，但两处 key 可能漂移，需补守卫测试。
- 下游全部依赖此选择。

### T2 · 「按 profile 批量写」的写入语义与冲突处理（prototype → decision）
这是本次**唯一真正的新机制**。必解三问：
1. **是否覆盖用户手改值**（`updatedBy` 非空的行）？仓库哲学是「不替用户做决定」——`mergeExampleIntoEnv` 明确「绝不替用户解开注释项」（有 23 行注释记述曾静默激活 `# CORS_ORIGINS` 致生产 CORS 全断的历史缺陷），`fillEmptySecrets` 只填空不覆盖。但等保通常要求**强制收敛**。二者正面冲突，必须在 ADR 里显式裁决。
2. **env 层遮蔽**：`resolveValue` 三层优先级是 DB(`updatedBy` 非空) > env(`envKey`) > default。批量写会置 `updatedBy`，从而**遮蔽所有 env 层默认值**——`security` 组 20 项里 18 项有 `envKey`。`ResetCategoryModal` 已为 envItems 做专门提示，说明这是已知痛点；安全模式切换会**系统性触发**它。
3. **是否需要影响面预览 + 二次确认**：`dangerous: true` 先例（`ResetCategoryModal` 逐项列「将恢复这 N 项」）可复用，但模式切换影响面是数十项。
- 同时需确认留痕：`runtime_config_logs` 每条自然留痕（oldValue/newValue/operatorId/operatorIp 齐全），但**配置变更目前不进 `audit_logs`**（`runtime-config.controller.ts` grep `Audit` 零命中）——见 §四 缺口 D。

### T3 · 口令策略热生效化的范围裁决（decision，需 ADR）
`password-policy.service` 构造期固化 env、`getPasswordChangeStatus` 被 `jwt.strategy` 每请求同步调用；`constants.ts:640-651` 有**明确注释反对收录运行时配置**，理由是 ripple 到 4 处调用点且「对最热安全路径的结构性改造」。
- 本次已拍板「不动」。但**必须写进 ADR**，否则「普通模式为何不放宽密码」会反复被重新提出。
- 选项：A 排除并记录理由（已选）／ B 纳入并改造为惰性读取。

### T4 · 管理员入口 `MERGED` 的语义与对称性（decision）
现状 `login.service.ts:345` 硬编码拒绝 ADMIN、`admin-auth.service.ts:145` 仅收 ADMIN，**双向硬隔离且零运行时开关**。`login.service.ts:320-334` 注释记述了一个前科：管理员门必须在恢复逻辑之前，否则已注销 ADMIN 账号经其他入口会先触发 `recoverIfPendingDeletion` 写库 + `user.restored` 审计副作用再被拒绝。
- 改造必须**两处对称**，否则出现「管理员入口关了、普通入口却能登」或反之的不对称漏洞。
- `MERGED` 下的防枚举代价：管理员账号可被枚举探测（`error.user.not_found` 目前在登录路径不被使用，统一返回 `invalid_credentials`）。

### T5 · 未登录态与登出态的通道治理（research → decision）
勘察清单（8 项，见 §四 E）：公告轮询全局挂载（未登录也 30s 轮询）、`file-stream` 完全匿名 SSE（低熵 hash 可枚举探测）、登出**不退协同会话**（`closeSession()` 只清 store，`exitCollaborationIfNeeded()` 仅 `beforeunload` 触发）、批量下载 SSE 无登出清理、`clearCookie` 只传 `{path}`（`session-cookie.writer.ts:73-76`，与写入时 `secure`/`domain` 不一致，https 或跨子域部署下 cookie 可能清不掉 → 登出后仍带 `auth_token` 直到 1h 过期）、后端无「登出即断该用户所有 SSE」机制、3 个 SSE 端点缺 `@Public` 导致 query token 在无 cookie 客户端不可达、access token 走 URL query（进历史与 access log）。
- 决策：哪些进「安全模式强制收敛」，哪些是独立技术债单独排期。

### T6 · 等保审计缺口的取舍（decision）
`docs/security/mlps3-checklist.md` v0.2 已交付工程票 #415–#445，能力基本建成。**新增缺口**：
- B1 `auditLogAllAccessOperations`：`audit-log.service.ts:74-80` `HIGH_FREQUENCY_READ_ACTIONS` 丢弃成功登录/上传/下载 → 安全模式应取消过滤。**副作用：日志量暴涨**，需容量与归档带宽核算。
- B2 `nginxAccessLogEnabled`：`nginx.conf` 三处 `access_log off`。
- B4 `dbAuditReadOnlyEnforced`：DBA 可直改审计表，应用层有门禁但 DB 层无约束（pgAudit 或只读角色）。
- B6 时钟同步：**全仓零 NTP 实现**，而审计哈希链依赖时间序。
- 决策：本次纳入哪些，哪些独立排期。

### T7 · CSRF 缺陷与 SSE ticket 范式推广（task → decision）
`csrf.guard.ts:63-69`：Bearer token **只看长度 16–1024 即跳过 CSRF 校验，不验证 token 有效性**。带任意「像 JWT」的字符串即可架空 CSRF 层（虽然后续 `JwtStrategyExecutor` 会 401，但用户已持有效 token + XSS 场景下等同无 CSRF 保护）。
- `notice-center` 已有一张正确范式（一次性 ticket + 300s TTL + 立即删除），但只在该模块落地；端点 1/2/4 仍把 access token 放 URL。
- 决策：CSRF 短路修复是否并入本次「安全模式」，还是作为独立安全修复。

### T8 · docker 形态 `config-service` 读错 `.env`（decision）
`config-service` 硬编码读 `packages/backend/.env`（`lib/constants.js:10`），**无 `DEPLOY_DIR` 感知**；但 docker 形态权威 `.env` 在包根（`docker-runtime/index.js:32`），`step2Env` 只生成包根 `.env`。→ 运维中心的「服务/安全/数据库配置」表单在 docker 形态下**读写的是一份与容器实际生效配置无关的文件**。
- 对模式的直接影响：若模式开关依赖 config-service 运维中心，**docker 下切了没生效**。
- 我的倾向：模式开关走 backend `runtime-config` REST（`PUT /runtime-config/:key`），**不依赖 config-service**；T8 作为独立 bug 修，但模式设计不赌它。

### T9 · 打包期 `variant` × 运行时 `securityMode` 的边界（decision，需 ADR）
ADR-0075 已有**打包期** `variant=private|oss`，与运行时 `securityMode` 语义重叠（「private 包 = 私有化部署 = 要等保」）。必须写清分工，避免「包是 private 但运行时跑普通模式」这类不可复现组合。
- 建议：打包期 `variant` 决定交付物与**部署期默认模式**；运行时 `securityMode` 决定实际生效参数。

### T10 · 横幅与切换交互（prototype）
- `Layout.tsx` 现有两条安全横幅（密码到期 `:731`、弱口令 `:762`）**均无关闭按钮、硬编码仅 ADMIN**，`noticeAck.ts` 已读持久化走 localStorage + 24h TTL + `BroadcastChannel`。新增「当前模式」横幅需确定：是否可关闭、关闭后是否刷新重现、跨标签页如何同步。
- `/runtime-config` 页可交互横幅（带切换按钮）+ 影响面预览。
- **advanced 档陷阱**：`security` 组 20 项里 18 项是 `advanced`，`showAdvanced` 默认 `false`（`useRuntimeConfig.ts:137-138`）→ 模式批量写若落在 advanced 项上，**管理员默认看不见**，易误判「模式没生效」。需在 `PageHeader` 统计里加「模式受管项」计数。
- **i18n 陷阱**：`meta.ts:44-46` 明确警告「未登记的中文串在非中文 locale 下原样回落成中文」。新增分组标题与配置项描述**必须登记进 `messages/idMap.json`**，否则英文界面显示中文。

### T11 · 14 项限制清单的逐项裁决（decision）
勘察 2 列出 14 项账号/登录限制（§四 C）。每项在两个模式下的目标值需逐一裁决并落进 T1 的目标值表。已知 `allowRegister` / `allowAutoRegisterOnPhoneLogin` / `wechatAutoRegister` / `requireEmailVerification` / `requirePhoneVerification` / `mfaEnforceEnabled` / 10 项限流阈值等**已是可热改的 public 配置，纯改默认值零代码**；仅 3 项需动代码（协议勾选必填、PC 登录页注册入口门控、i18n 硬编码文案）。

---

## 四、勘察事实底座（8 份勘察的结论索引）

### A. 基础设施（勘察 1 · 运行时配置）
- **唯一事实源**：`RUNTIME_CONFIG_DEFINITIONS`（`runtime-config.constants.ts:51`，69–95 项、14 分类），注释自述「全后端配置元数据唯一事实源」，默认值内联在每项。
- **三层优先级**：`resolveValue()`（`service.ts:142-181`）= runtime（DB `updatedBy != null`）> env（`envKey`/`envAliases`）> default。`updatedBy == null` 的行视作「安装默认行」不遮蔽 env。
- **`syncDefaultConfigs()`**（`service.ts:81-140`）在 `onModuleInit` 同步定义表到 DB，**刻意不碰 value/updatedBy** → 存量部署**不会**被新模式反向重置（利好）。
- **生效路径**：pull + Redis 写时失效（`del runtime_config:<key>` + `del runtime_config:all`，`service.ts:411-420`），无推送无轮询。前端 react-query `staleTime 30s`，保存后手动 invalidate。
- **全仓 0 处 profile/preset/模式概念**（`grep SECURITY_MODE|安全模式|runtimeProfile|configProfile|preset` 零命中）。唯一形似的 `tier: 'user'|'admin'|'advanced'` 是**纯展示分档**，不是开关集合。
- **配置项注册表已含等保引用**：`constants.ts:640` 「等保 2.0 8.1.4.1(d) 要求双因素」，可直接沿用文案先例。
- **缺口 D（关键）**：运行时配置变更**不进通用 `audit_logs`**——`runtime-config.controller.ts` grep `Audit` 零命中，`AuditAction` 枚举无 CONFIG 类。对一个要声称等保的「安全模式」，这是最实质的合规缺口（`audit_logs` 有 `success`/`errorMessage`/`userAgent`，`runtime_config_logs` 没有）。
- **前端公共消费面是硬编码白名单**：`RuntimeConfigContext.tsx:9-32` `PublicRuntimeConfig` + `:87-109` `mapPublicConfig()` + `:39-57` `DEFAULT_CONFIG`，三处必须同步改 + `isPublic: true`。当前 `security` 组几乎全 `isPublic: false`。

### B. 等保体系（勘察 8 · 合规对照）
- **已成体系，不是从零开始**：`docs/security/mlps3-checklist.md` v0.2（2026-09-01）逐条对照 71 控制点，统计 0 满足 / 40 部分 / 3 不满足 / 16 不适用 / 12 待承接；工程票 #415–#445 已交付（MFA、口令策略、失败锁定、审计哈希链、ClamAV、CI 门禁、制度体系）。ADR-0044/0045/0055/0071/0072/0073 全部安全相关。
- **真正的差距是「哪些默认开、哪些默认关」**——恰与本次需求重合。两个预埋总闸：`mfaEnforceEnabled`（已在运行时配置、热生效、`dangerous:true`，默认 false）与 `PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED`（env-only，默认 false）。`mlps3-checklist.md` 明确把二者列为「送测前置动作：须显式开启」。
- **两个真缺口**（两模式都需要、目前都没有）：C1 空闲超时（`idleTimeout`/`inactivity` 前端**零命中**，仅 JWT 绝对过期 1h）、B6 时钟同步（全仓无 NTP）。**不属模式开关问题，建议独立排期。**
- **无「模式」运行时轴**：已有轴全部正交——ADR-0016 的 `STORAGE_MODE`/`FUNCTION_EXECUTOR`/`QUEUE_DRIVER`、ADR-0075 的 `.deploy` `form=bare|docker` + **打包期** `variant=private`、`NODE_ENV`。

### C. 14 项账号/登录限制清单（勘察 2）
| 类别 | 项目 | 状态 |
|---|---|---|
| 注册总开关 | `allowRegister`（`constants.ts:163-174`，`tier:user` `dangerous:true` `isPublic:true`） | 已可热改 |
| 自动注册 | `allowAutoRegisterOnPhoneLogin` / `wechatAutoRegister` | 已可热改 |
| 强制验证 | `requireEmailVerification` / `requirePhoneVerification` | 已可热改 |
| MFA | `mfaEnforceEnabled`（`:630-649`，默认 false） | 已可热改 |
| 限流/锁定 | `mfaEnforceEnabled` 之外 10 项限流阈值 + 账号锁定 | 已可热改 |
| 注销/清理 | `userCleanupEnabled` / `userCancelGraceDays` | 已可热改 |
| **口令复杂度** | 10 位 + 4 类中至少 3 类，`password-policy.service.ts:67-98`；`< 3` **硬编码**；弱口令黑名单 144/151 条完全不可配；**历史密码不复用完全未实现** | **env + 硬编码** |
| **管理员入口隔离** | `login.service.ts:345` / `admin-auth.service.ts:145` | **硬编码，零开关** |
| **协议勾选必填** | `registerFormSchema.ts:22-24` + `RegisterPage.vue:82-90`，后端**无 terms 字段** | 前端硬门槛 |
| **PC 登录页注册入口** | `Login/index.tsx:369-381` **不受 `allowRegister` 门控**；移动端 `LoginPage.vue:322-328` 有门控 | **两端不一致 bug** |
| **5 处未 i18n 硬编码中文** | `sms-verification.service.ts:229` / `user-status.service.ts:333-369` / `users.service.ts:294,299` / `user-password.service.ts:79` / `sms-verification.service.ts:398` | 改动文案会漏翻 |
| **邮箱验证码上限 5 次** | `email-verification.service.ts:40` 硬编码常量；**短信侧却有配置项，不对称** | 硬编码 |
| **`collaborationDomains` 孤儿** | `constants.ts:882`，description/impact 都写了行为但**全后端零读取**；同文件 `:894` 注释明确说不收录零消费者字段 | 死配置 |
| `allowRegister` 校验缺口 | `local-auth.provider.ts:602-664`（`verifyEmailAndRegisterPhone`）**不校验 `allowRegister`**；关闭注册后仍能经该端点建号。另 `registration.service.ts:35` 口令校验先于注册开关，关闭时错误密码得到策略 400 而非「注册已关闭」，两处文案可被探测配置状态 | 安全缺口 |

### D. 前端登录 UX 与文案（勘察 4）
- 全仓无图形验证码/CAPTCHA；登录页无「记住我」「切换账号」；Tab 仅 `smsEnabled` 时出现，关闭后手机端用户零入口且无说明。
- 手机号正则**硬编码大陆号段** `^1[3-9]\d{9}$`（`loginFormSchema.ts:9`）。
- 防枚举彻底：不存在/禁用/密码错三者同一文案 `invalid_credentials`，前端无区分能力。普通模式若想给「账号不存在，要注册吗？」引导，**必须后端加开关**，纯前端文案层做不到。
- `ForgotPassword/index.tsx:78` 用 `error?.includes('账号已被禁用')` **中文子串判断**分支 —— i18n 耦合，改文案即失效，应先改为业务 code。
- `ResetPassword.tsx:62-64` 联系方式**只能来自 `location.state`**，直访 `/reset-password` → 只读空框卡死；placeholder 只给长度不给复杂度（注册页给全），三处（注册/重置/改密）应共用一份政策文案。
- 403 只打标签不 toast（`clientSetup.ts:212-215`）；`MFA_SETUP_REQUIRED` / `PASSWORD_CHANGE_REQUIRED` 用 `window.location.href` **整页刷新**，重建 WebGL 上下文（项目自己在 `useAuthActions.ts:347-348` 注释里反对）。
- 登录提交**无防重入**（`useLoginForm.ts:212-215`，对比 `AdminLogin` 有 `if (loading) return`）。
- `error.yml:6` 硬编码「数据将在**30天后**彻底删除」，但 `cleanupDays` 来自可配的 `userCleanup.delayDays` → 配置一改文案就撒谎，应用 `{days}` 占位符。
- **管理员登录入口完全不可发现**：`adminLoginConfig.ts` 默认 `/admin-login`，建议改乱码路径防猜；普通登录页**零引用** `ADMIN_LOGIN_PATH`，纯靠 URL 猜。
- **运行时配置页不可发现**：`navigation.ts:150-153` 无 `icon` → 不进侧边栏，唯一入口是 `Layout.tsx:704-722` 齿轮图标，**仅 `SYSTEM_CONFIG_READ` 可见**，普通用户完全不可见。

### E. SSE 与登录态（勘察 7）
- **全仓零 WebSocket**。5 个 SSE 端点 + `/api/cooperate` REST 反向代理 + 一堆轮询。协同 SDK **走 `/api/cooperate` 代理非直连 3091**，`onEvent` 全仓零调用，在线人数唯一来源是 2s 轮询。
- **通知中心 SSE 后端完整实现，前端零调用** —— 刻意降级为 30s 轮询（`useNoticeStream.ts:13-23` 注释：常驻 SSE 在 HTTP/1.1 下占满浏览器每源 6 条连接，致普通 API 排队数分钟）。
- **未登录页唯一常驻请求** = `NoticeProvider` 的 30s 公告轮询（`@Public`，全局挂载 `App.tsx:744-752`，**不按登录态门控**）。
- **登出残留（安全核心）**：`account-events` SSE 与 conversion `tasks/stream` SSE 随 `setToken(null)` 正确 cleanup；**批量下载进度 SSE 无登出清理**；**协同引擎会话登出不退**（`closeSession()` 只清 store）；`CADEditorRouteGuard` 一旦加载永久驻留（保护 WebGL 的代价）；后端**无「登出即断该用户所有 SSE」机制**（token 黑名单只作用于新 JWT 校验，漏关的客户端最长持有 1h）。
- **鉴权路径不对称**：端点 1/2（批量下载进度、转换任务流）**无 `@Public`**，`JwtStrategyExecutor` 先跑且不读 query → `?token=` 在无 cookie 客户端**不可达**，跨域部署/桌面 EXE 场景下这两条 SSE 失效。对比端点 4/5 显式 `@Public` 靠控制器内自解析才生效。
- **仓库内已有正确范式**：`notice-center.controller.ts:20-23` 明确记录「JWT 落 URL 会进浏览器历史与反代 access log」，故用一次性 ticket（Redis Lua `GET`+`DEL`，300s TTL）。**但只在通知模块落地**，端点 1/2/4 仍把 access token 放 URL。
- `clearCookie` 只传 `{path}`（`session-cookie.writer.ts:73-76`），与写入时的 `secure`/`sameSite`/`domain` 不一致 → https 或跨子域部署下**登出后 cookie 可能清不掉**。
- `session.destroy` 失败会让登出返回 401（`auth-token.service.ts:152-158` throw），前端 `catch` 后仍清本地状态 → 用户看到「登出成功」而服务端 session 残留到 24h maxAge。

### F. 部署与打包（勘察 6）
- **4 条彼此独立的落盘通道**：①`.env.example` → `.env`（文件复制）②`fillEmptySecrets` ③`setup-wizard`（交互口令 + `PASSWORD_INITIALIZED` 哨兵）④`RUNTIME_CONFIG_DEFINITIONS` → DB seed（`onModuleInit`）。
- **仓库哲学（对 T2 有直接约束）**：`mergeExampleIntoEnv` 用 `.env.example` 作注释权威，**绝不替用户解开注释项**（`config-updater.js:707-723` 有 23 行注释记述历史缺陷：曾按「.env 里存在这个 key」判激活，导致第二次跑就静默激活 `# CORS_ORIGINS` 致生产 CORS 全断）；`fillEmptySecrets` 正则 `^KEY=[\t ]*$` **只填空不覆盖**；`env-files.js:75-79` 目标存在即 skip。
- **`mergeExampleIntoEnv` 双向风险**：`.env.example` 注释态安全项永不静默激活（保护便利默认），但反过来——**若在 `.env.example` 把某安全项写成裸值当「安全默认」，它会在所有普通模式部署上强制生效**，且存量部署升级时被增量 merge 进来。
- **口令强度不一致**：`docker-runtime/index.js:386-389` 用 `generateStrongPassword()`（16 位四类强随机），`setup-wizard.js:339-340` 用 `generateNumericPassword(10)`（10 位纯数字）。同一份 `.env.example` 派生却给出不同强度。
- **`DEFAULT_ADMIN_PASSWORD='12345678'`**（`secret-generator.js:33`）注释自述「有意不满足 #416 等保 8.1.4.1 复杂度要求（8 位纯数字，且命中弱口令黑名单）」—— 这是被**代码注释明确认可**的「便利默认压过安全合规」。`setup-wizard` 三分支默认分支也走这个值。
- **`configuration.ts:163-178` 生产硬门禁无条件**（`JWT_SECRET`/`DB_PASSWORD`/`SESSION_SECRET`/`REDIS_PASSWORD` 缺失即拒启），而 `.env.example:13` 恒写 `NODE_ENV=production` → 即使普通模式想放松这几个，门禁会先拒绝启动。
- **`AUDIT_ARCHIVE_ENABLED=true`（`.env.example:730`）与 runtime-config `auditArchiveEnabled` `defaultValue:false`（`constants.ts:405`）两处默认值矛盾** —— env 层优先级高于 default 层，实际生效 true。这是新增模式开关时最容易踩的同款陷阱：**同一键在 `.env.example` 与 `defaultValue` 各写一次而值不一致**。
- **断网验证**：`verify-deploy.js` 7 步自检。新增安全默认会破坏验证的触发条件：新必填 env 没进 `fillEmptySecrets` 的 `secrets` 数组 → 后端启动被硬门禁拦死；新默认值写成注释态 → 验证环境与真实部署环境分叉。
- **CI 门禁完全不校验 `.env.example` 默认值语义** —— 没有门禁会检查「部署包默认是普通模式还是安全模式」。
- **`mlps3-drill.sh`**（`runtime/scripts/`，9957 字节）：等保部署机只读演练跑手，读 `.env` 逐项检查出 markdown 报告。新模式上线后是最快的自检落点。

### G. 管理员权限（勘察 5）
- `RequirePermissions` + `PermissionsGuard` 是主链路；`@Roles` + `RolesGuard` 全仓库**仅 1 处使用**（`admin-mfa.controller.ts:83`），形同虚设；**不存在 `@IsAdmin` 装饰器**，管理员判定全是 `role?.name === 'ADMIN'` 字符串比较（6 处散落）。
- 5 个内置系统角色（`system-role.types.ts`）：`ADMIN`(100) / `AUDIT_ADMIN`(50) / `USER_MANAGER`(50) / `FONT_MANAGER`(50) / `USER`(0)，3 层。`AUDIT_ADMIN` 与 `USER_MANAGER` **刻意与 ADMIN 互不隶属**（`permissions.enum.ts:93` 注释）—— 等保 8.5.2 三权分立的建模基础。
- 权限位：系统 25 个 + 项目 19 个（Prisma 枚举）。
- **高危能力零二次确认**：`POST /admin/backup`（`pg_dump` 真实子进程）、`DELETE /admin/backups/:name`、`POST /users/:id/delete-immediately`、`POST /user-cleanup/trigger`、`PUT /runtime-config/:key`（改任意安全开关）、`POST /security-attempts/whitelist`（给陌生 IP 永久加白）、`POST /task-run/.../trigger`、`DELETE /roles/:id`、`PATCH /users/:id/status` —— **全部无二次确认**（无 OTP、无确认 token、无 `@CsrfProtected`）。仅 `POST /audit/cleanup` 有（归档校验 + 二次确认 + 409）。
- **管理员重置他人密码的端点不存在** —— 全仓仅用户自助 + 验证码两条。等保评审会问的点。
- **无任何「仅本地/仅回环」限制**：现有回环逻辑都是「放宽」（`ip-whitelist.service.ts:103-105` 恒放行 `127.0.0.1`/`::1` 自救通道；`ip-blacklist.guard.ts:44-52` 仅 dev 豁免）。所有管理员端点挂在 `0.0.0.0`，仅靠「角色权限 + 登录时 IP 白名单」组合防护。
- **`@Public` 敏感项**：`alert/internal-alert.controller.ts:39` 是唯一以 `@Public` 绕过 JWT 的非认证端点，靠 `InternalSecretGuard` 共享密钥兜底且 **fail-close**（`internal-secret.guard.ts:24-25`），但 `INTERNAL_SERVICE_SECRET` 是静态 env、无轮换、无按调用方区分。

---

## 五、Not yet specified（Fog）

- **模式切换是否进审计哈希链** —— `audit_logs` + SHA-256 + fail-closed 归档 + 逐期哈希链已建成，27 类操作未含「模式切换」。等保 8.1.4.3 要求记录管理员行为，模式切换显然算。但 T2 的批量写在语义上是「数十条配置变更」还是「一次模式切换」？留痕粒度需裁决。
- **切换后其他在线管理员终端如何感知** —— `runtime-config` **无任何广播通道**（前端 `queryKeys.ts:121-123` 只有 `all`/`public` 两个 key，无 WS/SSE/轮询；唯一先例是 `notice-center` 的 SSE，且**前端零调用**）。切换是单人操作还是需广播？这决定要不要新建一条通道。
- **存量已等保部署的迁移语义** —— `syncDefaultConfigs` 刻意不碰 `value/updatedBy` 应保证安全（存量已手改的行不会被重置），但**未实测验证**。存量库若已按严格配置跑，`securityMode` 默认 `normal` 会不会引发预期外行为？
- **等保送测材料是否需要说明「模式」概念** —— 测评分「公司部署 / 生产部署」，定级报告（`docs/compliance/mlps3-grading-report-draft.md`，S3/A3 三级）里是否需要体现双模式设计？若需要，模式切换的记录留存期与归档策略要与之对齐。
- **移动端是否消费 `securityMode`** —— `frontend_mobile` 有自己的公告/协同实现（`useNoticeStream.ts`、`conversionStream.ts`），两端在登录页注册门控上已有不一致（§四 C）。模式开关若 `isPublic: true`，两端都要消费。
- **管理员口令初始化路径强度统一** —— `setup-wizard` 三分支默认走 `12345678`（注释自述有意违反等保），docker 形态用 16 位四类强随机。普通模式是否应统一为「弱但可用」默认？这触及代码注释明确认可的「便利默认压过安全合规」，属价值观裁决而非技术裁决。
- **空闲超时（C1）与时钟同步（B6）** —— 两模式都需要、目前都没有。是否借本次顺带做，还是严格划为独立技术债？（我倾向独立：二者与「模式开关」无耦合，混入会显著扩大本次范围。）
- **`allowRegister` 的两个校验缺口** —— `verifyEmailAndRegisterPhone` 不校验 `allowRegister`（关闭注册后仍能建号）+ 口令校验先于注册开关（文案可被探测配置状态）。属安全修复而非模式特性，是否并入本次未定。

---

## 六、Out of scope

- **等保公司承接 12 项**（机构、人员、定级备案、测评）—— 流程事项，非代码。
- **国密 / 密评（8.1.10.9）** —— 架构级，非模式开关能表达。
- **客体（数据库表/行）粒度授权** —— 现行走补偿叙事（`mlps3-checklist.md` 已披露）。
- **单机热冗余** —— 架构级。
- **「管理员重置他人密码」新能力** —— 本次不引入新能力，只做档位切换。
- **`password-policy` 重构** —— 若 T3 维持「排除」裁决，则永久排除；翻案需重新立项。
- **`variant=private` 打包期的语义变更** —— 本次只划清边界（T9），不改 ADR-0075 的打包逻辑。

---

## 七、阻塞：Gitea 凭据

迁移本地图表为 Gitea 票需要仓库写权限。当前状态（已实测）：

- 凭据存于 Git Credential Manager（`printf 'protocol=http\nhost=10.66.66.1:5656\npath=/qjx/cloudcad.git\n\n' | git credential-manager-core get` 静默返回 `username=wdx` + 40 位 token）。
- **该 token scope = `public-only, write:issue, write:repository, write:user`**，但仓库私有 → 所有 repo 作用域端点 404（`/api/v1/repos/qjx/cloudcad`、`/labels`、`/issues` 均 404，`POST /labels` 亦 404）。`/api/v1/user` 正常 200（id=2, login=wdx），确认是 scope 问题而非网络/认证问题。
- 修复步骤（需人工，我无法自行完成）：
  1. Gitea「设置 → 账户 → 访问令牌」新建 token，勾选 `read:repository` + `write:issue`（当前 `public-only` 对私有仓库无效）。
  2. 一次性写入凭据缓存：
     ```bash
     printf 'protocol=http\nhost=10.66.66.1:5656\npath=/qjx/cloudcad.git\nusername=wdx\npassword=<新token>\n\n' | git credential-manager-core store
     ```
  3. 验证：`GET /api/v1/repos/qjx/cloudcad/labels` 返回 200 而非 404。
- 迁移动作：建 1 张 `wayfinder:map` 票（正文 = 本文 §一 §二 §五 §六）+ 11 张子票（T1–T11，标签 `wayfinder:research|prototype|grilling|task`），子票 body 尾部挂 `*Wayfinder 票 · 子票：[<map title>](<map url>)*`，阻塞走 `## Blocked by` 小节（Gitea 无原生子 issue / issue-link 端点）。
