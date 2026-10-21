# 安全模式 / 普通模式 双模式体系规划（wayfinder map）

> 状态：**勘察完成（共 20 份），地图重划为 T1–T17，frontier 待逐票裁决** · 2026-10-19 三轮
> 一轮结论见 §八「一轮勘误」，一轮事实底座已按二轮证据重写。
> **三用户裁决已入图**：默认 `normal`；普通模式便利高于一切不做合规、安全模式完全遵循等保 → 推翻「不动 password-policy」，T3 升为最大结构项，连带新增 T17。
> ⚠️ **票据未落 Gitea**：已确诊令牌 scope 问题（非网络/时序），需人工做 1 次长效令牌，步骤见 §十。
> 票据约定见 `docs/agents/issue-tracker.md` § Wayfinding operations（父子走 body 约定、blocking 走 `## Blocked by` 小节）。
>
> 涉及**三层一致性**：前端 / API SDK / 后端 / DB 四端全动（新增配置项需重生 SDK + MSW；审计枚举新增需 migration）。

---

## 一、目的地（二轮重划）

一个**总开关** `securityMode`（`secure` / `normal`），驱动**25 项配置 + 6 项新增口令策略项**按 profile 批量取目标值（完整表见 §四）。

- **`normal`（普通模式）= 默认**，用于本地部署包与测试。原则由用户明确拍板：**便利高于一切，不做合规**。管理员与普通用户都不需要满足等保口令要求，`12345678` 这类初始口令在普通模式下是**正当设计**而非违规。
- **`secure`（安全模式）= 默认关闭**，管理员显式开启。原则：**完全遵循等保三级**，不放松任何一条。开启后管理员横幅提示「当前配置符合安全配置」。

> 这条原则推翻了二轮拍板的「不动 `password-policy`」——口令策略**必须**模式化，且因此成为本次最大的结构项（见 T3）。

**二轮勘察的核心结论：「双模式」只覆盖用户抱怨的大约 40%。**

用户列出的痛点里，另一 60% **与模式开关无关**——是错默认值、死路、死代码、以及两个真实安全缺口（邮箱验证码无限爆破、魔数校验整体未接线）。它们两个模式都需要修，且不修的模式开关就没有意义（普通模式下用户照样卡死）。

因此本次分两条线并行推进，**模式开关不是唯一交付物**：

- **线 A · 模式机制**（T1–T12）：新增 `securityMode` + profile 目标值表 + 批量写 + 横幅切换。
- **线 B · 无条件修复**（T14–T16 + §五 40 项清单）：默认值断裂、死路、死代码、错误契约、账号安全真缺口。

线 B 与模式机制零耦合，可独立排期独立交付，且两模式同时受益。**这是本轮最重要的范围裁决，见 T13。**

**不是**：新增安全能力。勘察结论是能力大多已建成，缺的是默认值档位、一个总开关，以及一批从没被修过的死代码。

---

## 二、已拍板（任一可翻案，翻案只影响其下游票）

| 决策 | 选定 | 翻案代价 |
|---|---|---|
| **模式载体** | `securityMode` 进 `RUNTIME_CONFIG_DEFINITIONS` 且 `isPublic: true`；`.env` 另留 `DEPLOY_SECURITY_MODE` 作部署期默认 | 改「仅 .env」则切换需重启，本地来回测试体验差 |
| **默认模式** | **全部默认 `normal`**。部署包出厂即普通模式 | 改默认 `secure` 则每套本地测试机开箱就撞等保门槛，与「本地部署包方便测试」目标直接冲突 |
| **普通模式原则** | **便利高于一切，不做合规**。管理员与普通用户都不要求满足等保口令要求；`12345678` 初始口令在普通模式下是正当设计而非违规 | 用户明确拍板，翻案需重新立项 |
| **安全模式原则** | **完全遵循等保三级**，不放松任何一条 | 同上 |
| **作用域** | **分线 A/线 B 两期推进**（T13）：模式机制与无条件修复解耦，线 B 先走 | 合并会把 ~40 项 bug 修复合进单一未评审机制，无法 review |
| **密码复杂度** | **⚠️ 二轮拍板已被用户推翻**：由「不动 `password-policy`」改为**口令策略必须全面模式化**，成为本次最大结构项（见 T3） | 回到「不动」则违反普通模式「便利高于一切」原则 |
| **管理员入口** | `adminLoginEntry: ISOLATED\|MERGED`。普通 `MERGED`、安全 `ISOLATED` | 影响 T4 |
| **横幅受众** | 全局 ADMIN 横幅 + `/runtime-config` 页可交互横幅（带切换）。普通 `USER` 看不到 | 影响 T10 |
| **配置可见性** | 安全组 20 项**保持 `isPublic: false`**，普通模式不向普通用户开放安全项；改为在配置页加「模式受管项」计数让管理员可见 | 见 T12 |

---

## 三、Frontier（决策票 T1–T16）

阻塞图（箭头 = 被阻塞 → 阻塞者）：

```
T13 作用域重划 ─────────────────────────→ T14 / T15 / T16（决定本期还是独立）
T1 目标值表形态 ──┬─→ T2 批量写语义 ──┬─→ T10 横幅与切换交互
                 │                    └─→ T11 逐项裁决
                 └─→ T11
T12 isPublic 名单纠错 ──→ T11
T17 校验下限 vs 便利原则 ──→ T11（决定 normal 取值能否归零）
T3 口令策略模式化   （独立，**本次最大结构项**，含 1 张新建表）
T4 管理员入口       （独立，前置 @IsAdmin 收敛）
T5 未登录/登出态通道（独立）
T6 审计证据链       （独立，需 ADR）
T7 CSRF + ticket    （独立）
T8 docker config-service（独立）
T9 variant 边界      （独立，需 ADR）
```

### T1 · 目标值表的单一事实源形态
在 `RuntimeConfigDefinition`（`runtime-config.types.ts:107-132`）上加可选 `profiles?: { secure, normal }`，还是另立 `runtime-config-profiles.ts`？
- 定义表已 928 行 69 项；接口是**封闭的显式字段表**，无 profile 承载位，但普通 TS interface 加可选字段不破坏兼容 → 加字段是最低改动。
- 另立表则定义表不动，但两处 key 可能漂移，需补守卫测试。
- 下游全部依赖此选择。

### T2 · 「按 profile 批量写」的写入语义与冲突处理
本次**唯一真正的新机制**。二轮把它从三问扩到**五问**：
1. **是否覆盖用户手改值**（`updatedBy` 非空）？仓库哲学是「不替用户做决定」（`mergeExampleIntoEnv` 绝不替用户解开注释项，有 23 行注释记述历史缺陷），但等保通常要求**强制收敛**。正面冲突，必须 ADR 裁决。
2. **env 层遮蔽**：`resolveValue`（`runtime-config.service.ts:149-181`）三层是 runtime(`updatedBy`非空) > env(`envKey`) > default。**env 是中间层不是终层**——用户改过的值永远压过 env，env 只压「安装默认行」和代码默认值。批量写会把 value 从 env 层抢过来，**此后改 .env 同名变量无效**。security 组 **18/20 有 envKey 且 `.env.example:574-798` 全是裸值** → 冲突面 = 18/20 实锤。
3. **影响面预览 + 二次确认**：`ResetCategoryModal.tsx:41-74` 的三段式（引导句 + env 单独提示 + `rc-reset-preview` 逐项列表）可直接复用为 `ModeSwitchModal`。
4. **事务原子性（新增）**：Controller **只有单键 `PUT /runtime-config/:key`**（`:252-278`），`POST reset-category`（`:334-367`）是循环调 `resetToDefault` 的**批量重置**不是批量赋值。N 次 `set()` = N 次 DB 往返 + N 条 `runtime_config_logs` + **无事务**，半成功不可回滚。等保切换必须一次事务。
5. **「env 优先级高于 profile 写入」的第 4 层（新增，最本质缺口）**：`updatedBy` 是二值的（改过/没改过），无法表达「这是 profile 批量写的、应低于 env」。要满足该语义必须新增优先级层或 `runtime_configs` 加来源列（**需 schema 迁移**）并改 `resolveValue` 判定。
- **关键利好**：`resetToDefault`（`service.ts:588-622`）刻意**清空显式修改标记**（`updatedBy = null`）而非写回默认值，null 后 env 重新生效。这是天然的「撤销 profile、回归 env」反向操作原型——等保↔普通来回切都可用，不必另造机制。
- 另需确认：`runtime_config_logs` **无 `batchId`**（`schema.prisma:320-332`），N 条日志无法归因到「一次切换」。

### T3 · 口令策略全面模式化（最大结构项，用户已拍板推翻「不动」）
**用户裁决**：普通模式便利高于一切、不做合规；安全模式完全遵循等保。故口令策略**必须**模式化，不再是「排除项」。这使它成为本次**最大的单项结构改造**，工作量超过 T2 的批量写机制。

现状（`password-policy.service.ts:67-98`）：
- 构造期固化 env，`getPasswordChangeStatus` 被 `jwt.strategy` **每请求同步调用** → 最热安全路径。
- `categories < 3` **硬编码**；弱口令黑名单 144 条硬编码完全不可配；**历史密码不复用完全未实现**。
- `PASSWORD_POLICY_MIN_LENGTH`（`configuration.ts:47`，构造期固化）、`PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED`（`configuration.ts:572`，env-only **需重启**）。
- `constants.ts:640-651` 有明确注释反对收录运行时配置，理由即上面这些。

**需要新增的 6 项配置**：
| key | normal（便利优先） | secure（等保 8.1.4.1） |
|---|---|---|
| `passwordPolicyMinLength` | 6 | 10 |
| `passwordPolicyMinCategories` | **0**（无类别要求） | 3 |
| `passwordPolicyWeakCheckEnabled` | false | true |
| `passwordPolicyHistoryCheckEnabled` | false | **true（能力完全缺失，需新建）** |
| `passwordPolicyChangeEnforceEnabled` | false | true |
| `passwordPolicyChangeIntervalDays` | 0（永不强制） | 需确认测评口径（现口径 180 天） |

**normal 取值推导依据**：必须能接受 `DEFAULT_ADMIN_PASSWORD='12345678'`（`secret-generator.js:37`）→ minLength ≤ 8、categories ≤ 1（纯数字 1 类）、弱口令黑名单必须关（该值命中黑名单 144 条）、且不强制改密。

**四块工作，成本递增**：
1. **惰性读取**（结构改造）：`password-policy.service.ts` 构造期固化 → 改惰性读 runtime config。`resolveValue` 走 Redis cache（`runtime_config:<key>`，写时失效），每请求成本 1 次 Redis GET，可接受。**这是 `constants.ts:640-651` 反对的核心，但反对理由（最热路径）在 Redis 缓存下不成立——真正的风险是误配置导致全员改密失败锁死管理员，须靠校验 + 影响面预览兜住，不是靠「不可配」。**
2. **硬编码常量化**（改造）：`categories < 3`、144 条黑名单开关。
3. **历史密码不复用**（**新建能力**，本次范围膨胀点）：需新表（`password_history`）、新校验、新迁移。等保 8.1.4.1 要求「不得启用最近 N 次使用过的口令」。**这是唯一需要建数据表的新能力，建议单独排票。**
4. **部署期口令路径模式感知**（改造 3 处）：
   - `setup-wizard.js:118-155` 三分支：`回车` = `DEFAULT_ADMIN_PASSWORD` 在 secure 模式**必须改为强随机**，否则一开安全模式就带着不合规初始口令；`n`=自定义的 `isPasswordWeak`（仅 ≥8 位 + 两类，`setup-wizard.js:46-63`）比后端严格策略宽松，须模式感知。
   - **初始管理员创建路径当前不调用 `assertPasswordPolicy`**（已实证）→ secure 模式下必须拦，否则部署完仍是 `12345678`。
   - `DEFAULT_ADMIN_PASSWORD` 的注释「有意不满足 #416 等保」在普通模式下**变成正当设计决策**，注释应改为「仅 normal 模式适用，secure 模式由 setup-wizard 强随机覆盖」——保留注释历史但说清适用范围。

**下游连带**：弱口令横幅（`Layout.tsx:766-795`，`passwordUnchanged`）在 secure 模式下语义不变，但 normal 模式下 `12345678` 是正当默认 → 横幅在 normal 模式是否还该显示？倾向：normal 模式仍显示（提示性），但文案改为「本地测试模式，建议生产前改为强口令」而非「弱口令不合规」。**这条待裁决。**

### T4 · 管理员入口 `MERGED` 的语义与对称性（证据更新）
二轮实证比一轮更集中：**4 条登录路径全部收口在 `assertLoginEligible`**（`login.service.ts:119`、`local-auth.provider.ts:147/289/452`）——密码、微信、手机码、邮箱。管理员入口仅收 ADMIN 在 `admin-auth.service.ts:145-155`（非管理员与密码错误同文案，防枚举）。
- ~~全仓 `runtime-config` keys 中**不存在 `adminLoginEnabled` / `adminLoginEntry`**（已核实）~~
  → **`adminLoginEntry` 已新增**：`ISOLATED`/`MERGED`，profiles `{ secure: 'ISOLATED', normal: 'MERGED' }`，
  `defaultValue: 'MERGED'`（出厂默认，2026-10-21 用户裁定；初版取 `ISOLATED` 求「升级零行为变化」，
  理由与代价见 deferred-decisions R5）。**T4 已完成。**
- ~~新增开关最合理落点 3 处：① `admin-auth.service.login()` 第 0 步前加闸；② 前端 `App.tsx:278-285` 路由门控 + `tokenRefresh.ts:169/219` redirect 目标；③ 配置项~~
  → 实际落点为 **③配置项 + ①的变体**：闸门放在 **`assertLoginEligible`**（四条普通登录路径的共同出口），
  而不是 `admin-auth.service.login()`——后者只管管理员专用入口，放那里覆盖不到普通入口。
  **②前端路由门控未做且不需要**：`MERGED` 取「放宽」（管理员可走任一入口）而非「禁用专用入口」，
  普通登录表单无需改动、专用入口始终保留，故前端与 SDK/MSW 零改动。语义取舍与理由见
  deferred-decisions R5。
- **前科实证且被注释固化**：`login.service.ts:329-340` 记载三个 provider 曾把恢复逻辑放在管理员门之前，导致「已注销的 ADMIN 凭一次普通入口尝试即触发写库（`deletedAt=null, status=ACTIVE`）+ `user.restored` 审计事件」（写库点 `:292-296`、事件 `:300-305`）随后才被拒绝。「恢复成为无意义且有害的副作用」。**教训：开关判断必须在一切写库/emit 之前，且拒绝路径统一走防枚举文案（避免探测开关状态）。**
- **隐性前置（二轮新增）**：`role?.name === 'ADMIN'` 散落 **6 处**（`auth-facade.service.ts:495`、`admin-auth.service.ts:145/257`、`login.service.ts:345`、`user-status.service.ts:50/102`），`@IsAdmin` 全仓零命中，`@Roles` 仅 1 处（`admin-mfa.controller.ts:83`）。**若只做入口开关不做判定收敛，`jwt.strategy.ts:158/192` 两处 ADMIN 分支仍按旧语义放行。**
  **→ 收敛已落地（见 deferred-decisions R5）**：实测是 8 处（含 `jwt.strategy.ts:158/192`），全部改走 `@cloudcad/contracts` 的 `isAdminRole()`/`isAdminUser()`，`SystemRole.ADMIN` 为唯一事实源，零行为变化。上述行号为收敛前状态，仅作历史证据保留。

### T5 · 未登录态与登出态的通道治理（扩展 3 项）
原 8 项清单保留（§七 E），二轮新增三项实证：
- **公告已读 ack 跨账号串用**：`noticeAck.ts:17-21` 按 `noticeId` 存 localStorage、**未按 userId 分桶**，登出未清 → 换用户后误判已读。
- **`clearCookie` 只传 `{path}`**（`session-cookie.writer.ts:73-76`），写入时带 `secure`/`sameSite`/`maxAge`（`:50-65`）且受 `cookieDomain` 影响（`configuration.ts:280`）→ https 或跨子域下 Set-Cookie 属性不匹配，**登出后 `auth_token` 有效到 1h 自然过期**。
- **SSE 的 query token 不查黑名单**：登出后旧 token 1h 内可继续开 `/tasks/stream`、`account-events`、批量下载 SSE。`tokenRefresh` 黑名单只作用于新 JWT 校验。
- 另：登出不退协同会话（`closeSession()` 只清 store，`useAuthActions.ts:340-345`，collab 退出仅 `beforeunload`）；后端**无「登出即断该用户所有 SSE」机制**。

### T6 · 审计证据链能否「自证现在合规」（重命名，范围重大扩展）
一轮记的是「缺口 D：配置变更不进 audit_logs」。二轮证明缺口是**四重叠加**：
1. 配置变更不进 `audit_logs`（`runtime-config.controller.ts` grep `Audit` 零命中；`AuditAction` 枚举无 CONFIG 类）。
2. 替代表 `runtime_config_logs`（`schema.prisma:320-332`：`oldValue/newValue/operatorId/operatorIp/createdAt`）**无 success/userAgent、无哈希链、可删改**（`AuditLog` `:258-283` 字段更全但不被配置链路使用）。
3. SHA-256 + `prev_hash` 哈希链（`audit-chain.ts`）**只覆盖 audit_logs 归档，不含 `runtime_configs` 现值** → 能证明「过去」，不能证明「现在合规」。
4. `runtime/scripts/mlps3-drill.sh`（9957B）**只读 `.env` 静态值**，不查 DB `runtime_configs`；而 runtime 层优先级高于 env → env 写 true、后台被改 false 时仍报 ✅。
5. 无配置基线快照。

→ **等保评审问「你怎么证明现在处于合规配置」，四项叠加后当前无法自证。** 这是安全模式最实质的合规缺口，比「配置项默认值」重要得多。

**另一关键发现（T6 的前置约束）**：`AuditLogService.log()` **无条件写库**，全仓无「审计总开关」。`HIGH_FREQUENCY_READ_ACTIONS`（`audit-log.service.ts:74-81`）硬编码丢弃 `FILE_UPLOAD/FILE_DOWNLOAD/USER_LOGIN`，其中**仅 `USER_LOGIN` 有实际调用点**（`auth-facade.service.ts:114/128/380`）→ 实际只有「登录成功」被丢弃，失败保留（暴力破解场景反而放大）。**安全模式想要的「强制全量审计」无法通过配置实现——审计范围不是配置项，必须改代码移除硬编码过滤。** 写入是内联 `await prisma.auditLog.create()` 在请求热路径**同步阻塞**，也无法降级为异步。

**容量数据**：63 个 `AuditAction`、49 处 `log(` 调用点；`FILE_CREATE/UPDATE/NODE_RENAME/MOVE/COPY/RESTORE` 每编辑动作一条 → 量随在线编辑量线性增长。安全模式开全量前需容量与归档带宽核算。

原 B1–B6 缺口清单（nginx access_log off、DB 层无审计约束、全仓零 NTP、空闲超时零命中）保留。

### T7 · CSRF 缺陷与 SSE ticket 范式推广
`csrf.guard.ts:63-69`：Bearer token **只看长度 16–1024 即跳过 CSRF 校验，不验证有效性**。带任意「像 JWT」的字符串即可架空 CSRF 层。
`notice-center` 已有一张正确范式（一次性 ticket + Redis Lua `GET`+`DEL` + 300s TTL），但只在通知模块落地；端点 1/2/4 仍把 access token 放 URL（`services/eventStream.ts:55` → 进浏览器历史与 access log）。
决策：CSRF 短路修复并入本次「安全模式」还是独立安全修复。

### T8 · docker 形态 `config-service` 读错 `.env`
`config-service/lib/constants.js:9-10` 硬编码 `ENV_PATH = packages/backend/.env`，**无 `DEPLOY_DIR` 感知**；docker 形态权威 `.env` 在包根。→ 运维中心「服务/安全/数据库配置」表单在 docker 下**读写与容器实际生效配置无关的文件**。
另：`AUTH_*/SMS_*/RATE_LIMIT_*/AUDIT_*/BACKUP_*/ALERT_*/FILE_LIMIT_*` 这批 envKey **配置中心无任何表单**，只能手工改文件。
倾向：模式开关走 backend `runtime-config` REST，不依赖 config-service；T8 独立修。

### T9 · 打包期 `variant` × 运行时 `securityMode` 的边界
ADR-0075 已有**打包期** `variant=private|oss`，与运行时 `securityMode` 语义重叠。建议：打包期 `variant` 决定交付物与**部署期默认模式**；运行时 `securityMode` 决定实际生效参数。
**新增插入点证据**：裸机链路最合适位置是 `runtime/scripts/cli.js:274-278`（读 `PASSWORD_INITIALIZED` 之后、`:278` 分支之前），因为 `:278` 决定走 `autoSetupAndShowPasswords`（交互三分支，天然可承载模式差异）还是 `:283-306` 的 `mergeExampleIntoEnv`+`fillEmptySecrets`（非交互）。`setup-offline` 在 `:244` 已跑完但**不写密钥**，故不破坏既有 `.env` 时序。
需同步覆盖第二、三处：`runtime/docker-runtime/index.js:380`（docker 不经 cli.js，独立入口）、`verify-deploy.js:411` 的 `fillEmptySecrets`（否则验收环境与真实部署分叉）。
不宜插在 `setup-wizard.js` 内部：它会从 `start.js:890` 的重配置路径被二次调用，那时模式已定。

### T10 · 横幅与切换交互（落点精确化）
- **两条新横幅直接插在 `Layout.tsx:795` 之后、`:797 <NoticeBanner />` 之前**，复用 `:731-795` 两条密码横幅（密码到期、弱口令）的 JSX 模板、`animate-slide-up`、`isDark` 双变量配色、`ShieldCheck/ShieldAlert` 图标。零新组件。
- **判据从 `role.name==='ADMIN'` 改为 `hasPermission(SystemPermission.SYSTEM_CONFIG_READ)`**（`Layout.tsx:704` 已有同款判据）。**权限体系够用零改动**：`SYSTEM_CONFIG_READ` 仅 ADMIN(level 100) 持（`system-role.types.ts:37-66`），`AUDIT_ADMIN`/`USER_MANAGER`/`FONT_MANAGER`/`USER` 四类均不持 → 默认无人误入。路由守卫 `App.tsx:660-670` 已用 `PermissionRoute`。唯一注意：后端 `PUT /runtime-config/:key` 自身也需 `@RequirePermissions`（`:100` 已有 READ 保护），切换端点新增须同口径标注。
- **`ModeSwitchModal` 照抄 `ResetCategoryModal` 三段式**（`ResetCategoryModal.tsx:41-74`：引导句 + env 遮蔽提示 + `rc-reset-preview` 逐项列表 + danger 二次确认），把 `group.items` 换成「将被改动的项集合」、env 提示换成「其中 N 项受 env 遮蔽，切换不会改实际生效值」。
- **advanced 档陷阱**：`security` 组 20 项中 **18 项是 advanced**，`showAdvanced` 默认 `false`（`useRuntimeConfig.ts:138`，过滤 `:223`，搜索时不过滤档位）→ 批量写 18 项对管理员**默认不可见**。落点 `PageHeader.tsx:49-76` 统计条加「模式受管项」计数。
- **i18n**：`meta.ts:44-46` 警告未登记的中文串在非中文 locale 下原样回落中文。新增分组标题与配置项描述**必须登记进 `messages/idMap.json`**。
- **移动端零运行时配置界面**：`frontend_mobile/src/pages/` 无 admin 目录，`grep SYSTEM_CONFIG` 在移动端 src **零命中**。管理员在移动端看不到模式状态、不能切换。

### T11 · 25 项限制清单的逐项裁决（前提被 T12 推翻）
一轮称「纯改默认值零代码」对 8 项成立。二轮证明**对行为成立（`hot` 缺省 true），对 public 不成立**（见 T12）。裁决内容不变，但落地前提改变：不需要动前端白名单（利好），但也意味着管理员在配置页看不到这些项（需 T10 的计数补偿）。

### T12 · isPublic 名单纠错 → 普通模式配置可见性边界（新增）
**一轮文档的 public 名单约 80% 错**，实测：
- `security` 组 **20 项全部 `isPublic: false`**（`mfaEnforceEnabled` `:636` 也是 false）；18 项 advanced、2 项 admin（`mfaEnforceEnabled`/`deviceAuthFrontendDomain`），14 项 `dangerous: true`。
- `user/mail/sms/wechat` 组 11 项：`allowAutoRegisterOnPhoneLogin`(`:181`)、`userCleanupEnabled`(`:203`)、`refundNotifyEmails` 是 false；其余 8 项 true。
- **11 项全部无 `envKey`/`envAliases`/`validator`** → 这些项**不能靠 .env 做双模式**，只能走 runtime DB 或代码默认值。这是比「哪些可热改」更硬的分界约束。
- 另：定义表无 `validator` 字段，校验走 `input: ConfigInputMeta`（min/max/step/unit/maxLength/allowNull）+ 后端 `validateValue`。
决策：普通模式下是否把这些 admin/advanced 档安全项对普通用户开放？（已拍板：不开放，改为配置页计数。）

### T13 · 作用域重划：无条件修复 vs 模式开关（新增，最关键）
本轮最重要的裁决。证据：§五 列出的 ~40 项无条件修复中，**没有一项需要 securityMode 参与**，且每一项在两个模式下都是 bug。
- 若合并进模式项目：~40 项 bug 修复 + 一个新机制（批量写事务 + 第 4 层优先级 + profile 表）挤进同一个变更集，无法 review，且模式机制的任何设计错误都会阻塞线 B 的交付。
- 若分线：线 B 可立即开工、独立验证、两模式同时受益；线 A 聚焦新机制本身。
已拍板分线。翻案代价：线 B 需重新立项，且线 A 的验收会被 ~40 项待修 bug 污染。

### T14 · 私有化部署包默认值断裂三件套（新增，线 B）
`freeExportDownloadEnabled=false` 是**最严重的断裂**：`restriction-engine.service.ts:555/568` 抛 `VipFeatureRequiredException` 403 → 前端 `useDownloadFormatModal.ts:84/160`、`BatchDownloadDialog.tsx:161/215`、`useLibraryOperations.ts:213/256`、`applyVipExportIcons.ts:135` 弹「开通 VIP」引导，而私有化部署包**无付费体系** → 死路。
`batchDownloadEnabled=false`：`buildFileSystemManagerViewProps.ts:219` 不注入 `onFolderDownload` → 文件夹打包入口消失。注意 `batch-download.controller.ts:66` 已分离语义，**单文件下载不受门控**。
`docker-runtime/index.js:785`：`if (pwd === DEFAULT_ADMIN_PASSWORD)` 打印告警，但 `fillEmptySecrets` 产出 16 位强随机**永不等于** `12345678` → **该告警分支恒不可达**，docker 形态管理员口令用户完全不可见，只能读 `.env`。
决策：改代码默认值（`freeExportDownloadEnabled` 私有化形态默认 true）还是走模式？我倾向改默认值——这是默认值写错了，不是「为安全考虑的限制」。

### T15 · 错误契约统一（新增，线 B，用户明确关切）
用户原话「错误提示也不友好」。二轮勘察出**双轨制**：`exception.filter.ts` 的 HTTP status 映射 code + 各 service 自抛字符串 code（`EMAIL_REQUIRED`/`MFA_REQUIRED`/`ACCOUNT_DEACTIVATED` 散落），**全仓无 ErrorCode 枚举**；前端 `clientSetup.ts:47-58` `responseTransformer` 只抛**数值** code，字符串 code 原样透传。
关键事实：**后端中文串 0 条登记前端 `idMap`** → 跨端文案靠后端 `Accept-Language`，不靠前端 i18n。`meta.ts:42-44` 警告即指此。
5 处中文/英文子串判断（改文案即静默失效）：`ForgotPassword/index.tsx:79`（**且是死代码，见下**）、`DeviceAuthorize.tsx:192-193`、`LibrarySelectFolderModal.tsx:173,182`、`applyVipExportIcons.ts:115-118`、`clientSetup.ts:161`。
**静默失败**：`tokenRefresh.ts:207-250` `handleTokenRefreshFailure()` 会话过期**无任何提示**即清 token 跳登录；`error.yml:14 login_expired_redirect` 定义了但两端 0 引用（死键）。`clientSetup.ts:198` **4xx 一律不 toast**，403 权限类若调用方不自行提示则完全无声。
决策：是否引入 ErrorCode 枚举并强制前端走 code 分支（结构性改造，影响后端 49 处调用点 + 前端 2 处），还是先只修「不友好文案」这 23 处。

### T16 · 账号安全两个真缺口（新增，线 B）
二轮发现两个**与模式无关的真实安全缺口**，不修则等保送测仍不过：
1. **邮箱验证码无限爆破**：`email-verification.service.ts:40` `maxVerifyAttempts=5` 硬编码，且**邮箱侧无每日上限、无 IP 上限**（SMS 侧有 `smsDailyLimitPerPhone` + `smsHourlyLimitPerIp`）→ 邮箱码空间 10⁶，5 次/码，但**码可无限重发**。
2. **魔数校验整体未接线**：`file-validation.service.ts:35-40` JSDoc 自述「未接线、零消费者」——魔数、`blockedExtensions`、MIME 内容级校验**全部从未生效**，上传仅按扩展名派生 MIME → `.exe` 改名 `.dwg` 无任何阻拦。方向相反：这是**缺失**不是「限制」，普通模式不能靠放开修。
3. 附带：字体上传零大小限制（`fonts.module.ts:32-34` `limits: {}`，`library.module.ts:58` 注释记述过同类 OOM 事故）。
决策：并入线 B 还是独立排期。

### T17 · 校验下限 vs 「便利高于一切」的架构裁决（新增，被 T3 暴露）
用户拍板普通模式「便利高于一切」后暴露一个贯穿性问题：**validator 硬下限与便利原则正面冲突**。

实证：`accountLockFailThreshold` validator `min=3`、`accountLockWindowSeconds`/`accountLockDurationSeconds` `min=60`（`account-rate-limit.service.ts:75-88` 注释的「max=0 关闭」**仅适用 4 个限流维度，不适用锁定**）→ **normal 模式下账号锁定无法彻底关闭**，管理员输错 10 次仍被锁 60 秒起。同理 T3 的 `passwordPolicyMinCategories` 必须允许 `0`。

冲突本质：validator 下限是**防误配**的（避免安全项被误设成 0 导致全线裸奔），但「便利高于一切」要求 normal 模式能归零。二者不能同时用同一套静态 validator 表达。

三选一（我推 A）：
- **A · 放宽全局下限 + profile 默认值承载严格性（推）**：validator `min` 统一降到 `0`（允许「禁用」），严格值由 secure profile 默认值提供。符合仓库既有哲学「不替用户做决定」（`mergeExampleIntoEnv` 绝不替用户解开注释项）。代价：secure 模式下管理员可手动把 MFA 设成 false，**「安全模式 = 完全遵循等保」不再由系统保证**——但 T2 的影响面预览 + 二次确认能拦住误操作，且用户有意为之时系统本就不该拦。
- **B · secure 模式下锁定 profile 值**（系统禁止下调到 profile 值以下）。技术上可行（写入时按 `securityMode` 校验），代价是新增一套「profile 保护期」语义，且与「不替用户做决定」哲学冲突，等保送测后想调参也调不了。
- **C · 双 validator**（按模式切换 validator）。最重，且违反「定义表是唯一事实源」。

> **若选 B，T6 的「自证合规」证据链价值大幅提升**——只有「系统保证不合规值无法写入」时，「安全模式 = 等保合规」才是可证明的强断言，而不是「管理员承诺不改」的弱断言。这值得和 T6 一并裁决。

---

## 四、默认值目标表（69 项全景）

**17 项需按 profile 分档，52 项两模式同值。** 同值项不列（结论：`audit/backup/alert` 全 12 项同值、`system/storage/file` 清理类 15 项同值、`brand` 全 4 项按部署填、`paymentEnabled` 前端零消费故同值）。

> **2026-10-21 范围收敛（用户裁定）**：初版建议 25 项分档、T11 实装 32 项，现收敛到 **17 项**。
> 判定标准——profile 只装「**等保必需 + 不依赖客户自建基础设施即可生效**」的项；切换模式
> 不替用户开关业务功能、容量与配额类配置。移出 15 项，理由见下节。本节以下三张表是
> **原始勘察结论**（含已移出的行），保留以便追溯取舍依据。
> 闸门已加：`runtime-config.service.spec.ts` 的「依赖外部基础设施或属业务/容量配置的键
> 不得声明 profiles」不变式钉死 15 个键名，防止回流。

### 已移出 profile 的 15 项（2026-10-21）
| 组 | 键 | 移出理由 |
|---|---|---|
| 依赖外部基础设施 | `requireEmailVerification` `requirePhoneVerification` `wechatEnabled` `wechatAutoRegister` | 依赖 SMTP / 短信通道 / 微信 AppID+Secret。未配置时替用户开启等于空开关；更糟的是 `requireEmailVerification=true` + `mailEnabled=false` 会让未绑邮箱的微信用户 100% 死锁（§六 R2：`local-auth.provider.ts:326` 未按 `mailEnabled`/`smsEnabled` 门控） |
| 业务功能开关 | `allowRegister` `allowAutoRegisterOnPhoneLogin` `batchDownloadEnabled` | 是否开放注册、批量下载是部署方的**产品决策**，不是等保项 |
| 业务策略 / 运维 | `userCancelGraceDays` `userCleanupEnabled` | 注销冷静期与过期用户数据清理是运维选择；且 `userCancelGraceDays` 原值 secure=30 / normal=3 方向本身可疑（normal 反而更短） |
| 容量配置 | `maxFileSize` | 上传上限由部署方按带宽与磁盘决定，与安全无关 |
| 配额（防滥用/成本） | `orderCreateRateLimitMax` `smsDailyLimitPerPhone` `smsHourlyLimitPerIp` `conversionGuestLimit` `conversionGuestWindowHours` | 防资源滥用与成本配额，非等保要求（原表已自注「配额非安全」「成本类」） |

> ⚠️ **移出 ≠ 出厂值自动变成便利侧。** 上述 15 键中 `batchDownloadEnabled`(false)、
> `maxFileSize`(100)、`orderCreateRateLimitMax`(10)、`smsDailyLimitPerPhone`(10)、
> `smsHourlyLimitPerIp`(20)、`conversionGuestLimit`(5)、`conversionGuestWindowHours`(2)
> 的出厂默认取的是**严格侧**。私有化部署要「便利」出厂值，须由打包期按 variant 写 `.env`
> （**T14 / ADR-0078 D2**，仍待落地）；本次收敛只处理「模式不该管这些」，不解决出厂默认值。

### security 组 · 12 项分档（全 `isPublic: false`）
| key | 默认 | normal | secure | 备注 |
|---|---|---|---|---|
| rateLimitPublicMax | 100 | 10000 | 100 | `rate-limit.guard.ts:80` |
| rateLimitAuthMax | 300 | 100000 | 300 | guard:81 |
| rateLimitLoginMax | 30 | 1000 | 30 | 按 IP/单位 **ms**；guard:82 |
| mfaEnforceEnabled | false | false | **true** | **等保 8.1.4.1(d)**；`admin-auth.service.ts:181`、`jwt.strategy.ts:159` |
| loginRateLimitMax | 30 | 500 | 30 | 按账号/单位 **秒**；`account-rate-limit.service.ts:80` |
| passwordResetRateLimitMax | 5 | 100 | 5 | :85 |
| registerRateLimitMax | 5 | 100 | 5 | :90 |
| orderCreateRateLimitMax | 10 | 1000 | 10 | 配额非安全；:95 |
| accountLockFailThreshold | 10 | 100 | 10 | **等保 8.1.4.1(c)**；⚠️ validator min=3 |
| accountLockDurationSeconds | 1800 | 60 | 1800 | ⚠️ min=60 |
| smsDailyLimitPerPhone | 10 | 100 | 10 | 成本类；`sms-verification.service.ts:222` |
| smsHourlyLimitPerIp | 20 | 500 | 20 | :237 |

> **`*Window*` 6 项 + `deviceAuthFrontendDomain` 两模式同值**（后者是部署地址非安全阈值，`constants.ts:893-895` 注释自述「碎分类并入」，profile 应排除）。
> ⚠️ **账号锁定无法在 normal 下彻底关闭**：`failThreshold` min=3、`window`/`duration` min=60 是 validator 硬下限；`account-rate-limit.service.ts:75-88` 注释的「max=0 关闭」**仅适用于 4 个限流维度，不适用锁定**。→ 见 **T17**：`便利高于一切` 要求 normal 能归零，与 validator 下限冲突。
> 除锁定 3 项外，19 项 normal 建议值均在现有 min/max 区间内（`rateLimitAuthMax` 上限 1000000）→ 限流类**无需改 validator**。

### user/mail/sms/wechat 组 · 8 项分档（全无 `envKey`）
| key | 默认 | isPublic | normal | secure | 备注 |
|---|---|---|---|---|---|
| allowRegister | true | true | true | **false** | ⚠️ 须先补 `local-auth.provider.ts:602` 校验 |
| allowAutoRegisterOnPhoneLogin | false | false | **true** | false | `local-auth.provider.ts:94` 唯一消费 |
| userCancelGraceDays | 7 | true | 1–3 | 30 | `login:285`、`cleanup:157`、`status:277` |
| userCleanupEnabled | true | false | true | **false** | 经 `TASK_ENABLED_KEYS:73` 间接读，字面 grep 误判孤儿 |
| requireEmailVerification | false | true | false | **true** | ⚠️ 须先修 `local-auth.provider.ts:326` |
| requirePhoneVerification | false | true | false | true | :222/**:327**/:712 |
| wechatEnabled | false | true | true | false | `local-auth.provider.ts:189` |
| wechatAutoRegister | false | true | **true** | false | :214，与 allowRegister 与门 :233 |

### file/system/billing 组 · 5 项分档
| key | 默认 | isPublic | normal | secure | 备注 |
|---|---|---|---|---|---|
| freeExportDownloadEnabled | **false** | true | **true** | false | **私有化默认关=VIP 死路**，见 T14 |
| batchDownloadEnabled | **false** | true | **true** | false | `buildFileSystemManagerViewProps.ts:219` |
| maxFileSize | 100 MB | true | 500 | 100 | `multer-upload-limits.ts:29` 兜底 max(配置,512MB)，无隐藏硬顶 |
| conversionGuestLimit | 5 | true | 20 | 5 | `restriction-engine.service.ts:19/542` |
| conversionGuestWindowHours | 2 | true | 24 | 2 | :18/545 |

### 需新增才能表达的（不在此表，无对应 key）
| 诉求 | 现状 | 改造档 |
|---|---|---|
| adminLoginEnabled / adminLoginEntry | **全仓零命中** | 新增配置项 |
| requireTermsAgreement | 前端硬门槛，后端无 terms 字段 | 新增配置项 |
| 空闲超时（等保 C1） | `idleTimeout`/`inactivity` 全仓零命中，仅 JWT 1h | 新增配置项 |
| 审计恒开 | `AuditLogService.log()` 无条件写库，无关闭路径 | **结构性** |
| 口令策略 6 项（见 T3） | `passwordPolicyMinLength` / `MinCategories` / `WeakCheckEnabled` / `HistoryCheckEnabled` / `ChangeEnforceEnabled` / `ChangeIntervalDays` | 4 项新增配置项 + 1 项**新建能力（需新表）**+ 惰性读取结构改造 |
| 验证码位数 | 6 位硬编码（`verification-code.store.ts:34` + `sms-verification.dto.ts:75,103` + 前端 `/^\d{6}$/` 6 处） | 新增配置项 |
| 手机号号段 | PC 9 处硬编码大陆号段，移动端 1 处已收敛 | 收敛单点 |

---

## 五、无条件修复清单（线 B，~40 项，两模式都需要）

与 `securityMode` 零耦合，可独立排期。**这是本次勘察中性价比最高的部分。**

### W1 · 私有化默认值断裂（3 项，最高优先）
1. `freeExportDownloadEnabled=false` → VIP 死路（T14）。
2. `batchDownloadEnabled=false` → 文件夹打包入口消失。
3. docker 管理员口令不可见（`docker-runtime/index.js:785` 死分支）。

### W2 · 登录注册死路与死代码（7 项）
4. `/reset-password` 直访卡死：`ResetPassword.tsx:62-64` 只读 `location.state`，无 fallback、无 toast → 只读空框。
5. **`ForgotPassword/index.tsx:79` 中文子串判断是死代码**：判 `error?.includes('账号已被禁用')`，但后端该分支走 success 路径**永不报错**（`ForgotPassword` 在 `:91-95` 返回 `mailEnabled=false` 才出客服）→ **客服入口永久不可达**。一轮文档误判为「改文案即失效」，实际是恒不可达。
6. PC 登录页注册入口不受 `allowRegister` 门控（`Login/index.tsx:369-381`）vs 移动端有（`LoginPage.vue:322-328`）。
7. `RegisterClosed.tsx:11-31` 硬编码「请联系管理员」，不接 `resolveSupportContact()` → 本地包首次开机的用户被推去找不存在的人。
8. 会话过期零提示（`tokenRefresh.ts:207-250`）+ `error.yml:14 login_expired_redirect` 死键。
9. 登录提交无防重入（`useLoginForm.ts:210-215`），`AdminLogin` 有先例。
10. 移动端登录页首屏被配置接口阻塞（`main.ts:60` `ensureBrandApplied` 串行 await 首个 SDK 请求）。

### W3 · 登出与会话残留（4 项，安全核心、纯收益）
11. `clearCookie` 只传 `{path}`（`session-cookie.writer.ts:73-76`）→ https/跨子域下登出后 `auth_token` 有效 1h。
12. SSE query token 不查黑名单（登出后旧 token 1h 内可继续开三条 SSE）。
13. 登出不退协同会话（`closeSession()` 只清 store）。
14. 公告已读 ack 跨账号串用（`noticeAck.ts:17-21` 未按 userId 分桶，登出未清）。

### W4 · 错误契约与文案（9 项）
15. 后端硬编码中文 **23 处**（一轮记 5 处）：`admin-stats.service.ts:272/275/289`、`local-auth.provider.ts:206`、`account-binding.service.ts:212`、`internal-secret.guard.ts:53`、`notice-center.service.ts` 11 处、`runtime-config.controller.ts:141/225`、`upload-token.service.ts:59`、`users.service.ts:294/299`。
16. `csrf.guard.ts:81/94/103` 英文硬编码无 i18n 键（`CSRF token is required`）→ 中英混杂重灾区。
17. `error.yml:6` 冷静期「30天」硬编码 vs `userCleanup.delayDays` 可配（i18n 调用不传参）。
18. 占位符永不插值：`error.yml:48`「（N次）」、`public_file.yml`「（最大 NMB）」。
19. 中文子串判断 4 处（`:173/182` 按中文目录名猜类型、`applyVipExportIcons.ts:115-118` 按中文标签匹配 VIP 图标、`DeviceAuthorize.tsx:192-193`）。
20. 错误契约双轨制：无 ErrorCode 枚举（T15）。
21. `clientSetup.ts:198` 4xx 一律不 toast，403 权限类静默。
22. 登录页密码无复杂度提示（`loginFormSchema.ts:13` `min(1)`）vs 注册页给全（`RegisterPage.vue:76`）→ 用户按弱密码登录。重置页只给长度不给复杂度 → 重置后被后端 400。
23. `clientSetup.ts:216-231` `MFA_SETUP_REQUIRED`/`PASSWORD_CHANGE_REQUIRED` 走 `window.location.href` 整页刷新重建 WebGL（`useAuthActions.ts:347-348` 注释里反对过）。

### W5 · 账号安全真缺口（3 项，T16）
24. 邮箱验证码无限爆破（无每日上限、无 IP 上限）。
25. 魔数校验整体未接线（`.exe` 改名 `.dwg` 无阻拦）。
26. 字体上传零大小限制（`fonts.module.ts:32-34` `limits: {}`）。

### W6 · 上传/字段限制硬编码（6 项）
27. 手机号正则硬编码大陆号段：PC **9 处**散落 vs 移动端 1 处已收敛（`authValidation.ts:12`）→ 两端收敛进度不一致。
28. 验证码 6 位硬编码（前后端共 8 处）。
29. 头像 5MB（`users.service.ts:293-300`）、品牌 Logo 2MB（`brand-asset.service.ts:65`）。
30. 字段限制三处各写一套：`public-file.module.ts:44` 1MB、`library:86` 10MB、`mxcad-core:101` 10MB；fields 恒 20。
31. `multer-upload-limits.ts:29` 兜底 `max(配置, 512MB)`。
32. `UPLOAD_MAX_SIZE`/`UPLOAD_ALLOWED_TYPES` 刻意不入运行时配置（`constants.ts:920-928` 注释自述「不收录、填了没反应」）。

### W7 · 部署链路（8 项）
33. `.env.example:13` 恒写 `NODE_ENV=production` + `configuration.ts:163-178` 生产硬门禁无条件 → 普通模式无法放松启动校验。
34. `DB_PASSWORD` **不在** `fillEmptySecrets` 的 `secrets` 数组（`secret-generator.js:82-96`，仅 6 项 SESSION/JWT/PII×2/REDIS/INTERNAL）→ 非交互裸机路径首密钥缺失依赖 wizard。
35. 裸机 DB/Redis 10 位纯数字（`setup-wizard.js:341-342`）vs docker 16 位四类（`docker-runtime/index.js:386`）同源派生不同强度。
36. 启动模式/是否重建两次纯便利询问（`deploy.js:39-59`、`:155-171`）→ 新手不知选哪个，选错 PM2 后台留常驻进程。
37. 图纸版本检查失败无指引无回滚（`deploy.js:94`）→ 新手死档。
38. `setupPm2Startup` 静默吞错（`deploy.js:231-234`）→ 报成功但重启不自动恢复。
39. `runSetupWizard` 选 n 直接删 `.env` 并 `exit`（`setup-wizard.js:274-283`）→ 重配置中断即丢配置。
40. `lib/credentials.js` 已从源码删（`c909003`）但 `release/`、`.tmp-pack-test/` 残留副本 → 包内容与源码分叉，安全审计歧义。

### W8 · 未登录态体验（3 项）
41. 公告轮询不按登录态门控（`useNoticeStream.ts:81` 30s，`NoticeProvider` 挂 Router 外层 `App.tsx:746-751`）→ `/login` 页也在轮询。
42. `docsUrl` 已在公共白名单（`RuntimeConfigContext.tsx:17`）却未用于登录页 → 未登录用户零帮助入口。
43. 管理员登录入口完全不可发现（`adminLoginConfig.ts:16` 默认 `/admin-login`，普通登录页零引用 `ADMIN_LOGIN_PATH`）→ **本地包首次启动管理员无合法入口**。

---

## 六、Not yet specified（Fog）

- **模式切换的广播** —— `runtime-config` **无任何推送通道**（全 backend src 无 `@WebSocketGateway`；唯一 SSE 是文件转换进度；`queryKeys.ts:121-123` 仅 `all`/`public` 两 key），前端 `staleTime` 30000ms。多管理员终端最长 30s 才见新值。`/public` 端点特意不挂 `CacheInterceptor`（`controller.ts:76-78` 注释记述曾致「保存后最长 300s 显旧值」）。要「立即」需新建通道或前端 `BroadcastChannel`（仅同浏览器多标签）。
- **模式切换是否进审计哈希链** —— 见 T6。T2 的批量写在语义上是「数十条配置变更」还是「一次模式切换」？`runtime_config_logs` 无 `batchId`，留痕粒度需裁决。
- **等保送测材料是否需要说明「模式」概念** —— 定级报告草稿（`docs/compliance/mlps3-grading-report-draft.md`，135 行）**对系统安全配置零实质表述**，大量`【待公司填写】`。缺口不是「表述与默认值出入」，而是**缺基线说明章节**。
- **三权分立的实际强度** —— 建模到「权限清单不共享」一级（ADMIN 显式排除 AUDIT_ADMIN，`permissions.enum.ts:91-97`；清理端点收窄 `audit-log.controller.ts:219-220`），但**无任何互斥校验**（grep「互斥|mutual|exclusive|三权」在角色权限代码零命中）。事实保护来自 `User.roleId` 单值——**可绕过**：持 `SYSTEM_ROLE_PERMISSION_MANAGE` 者能把 26 项全塞进 CUSTOM 角色授给一人，系统不拦。等保 8.5.2 送测时会被问到。
- **存量已等保部署的迁移语义** —— 二轮**已实锤安全**：`syncDefaultConfigs`（`service.ts:81-140`）只对不存在的 key `createMany`、对已存在 key 仅回填 `isPublic`/`description` 漂移项，**刻意不碰 `value`/`updatedBy`**（`:96-98` 注释明文）；且 `resolveValue` 只认 `updatedBy != null`，故 DB 默认行不遮蔽 env → **新增 `securityMode` 只做新增行，不污染任何存量严格部署**。此项从 fog 毕业，结论已定。
- **移动端是否消费 `securityMode`** —— 移动端零运行时配置界面、零 admin 目录。若 `isPublic: true`，两端都要消费；而两端白名单本就不一致（移动端多 `conversionGuestWindowHours`/`conversionGuestLimit`，PC 白名单无）→ 新增字段需改 **6 处**（PC type/default/map + 移动端 interface/default + 后端 isPublic + SDK）。
- **空闲超时（C1）与时钟同步（B6）** —— 两模式都需要、目前都没有。倾向独立（与模式开关无耦合）。
- **`allowRegister` 的两个校验缺口** —— `verify-email-and-register-phone`（`auth.controller.ts:272` `@Public()` → `local-auth.provider.ts:602-684`）**完全不读 `allowRegister`**，`:656` 直接建号；这是 `allowRegister=false` 下唯一的公网建号后门（管理员 `POST /users` 本就不查，属设计内；手机/微信自动注册 `:104`/`:233` 已被正确与门拦截）。另 `registration.service.ts:35` 口令校验**先于**注册开关 → 关闭注册后弱口令报策略 400 而非「注册已关闭」，**可被外部探测配置状态**。

---

## 七、勘察证据索引

### 一轮 8 份（保留，已被二轮部分推翻）
A 基础设施 · B 等保体系 · C 14 项限制 · D 前端登录 UX · E SSE 与登录态 · F 部署与打包 · G 管理员权限 · H 合规对照

### 二轮 12 份（本轮新增）
| 勘察 | 范围 | 最关键产出 |
|---|---|---|
| R1 | security 组 20 项 | 全 `isPublic:false`；18/20 envKey 且 `.env.example` 全裸值；账号锁定有 validator 硬下限无法归零 |
| R2 | user/mail/sms/wechat 11 项 | 11 项全无 envKey；`allowRegister` 建号后门 `:602`；微信登录死锁组合 |
| R3 | audit/backup/alert 12 项 | **审计无总开关**；63 AuditAction/49 调用点/热路径同步写；12 项两模式同值 |
| R4 | system/storage/file/collab/billing/brand 26 项 | `freeExportDownloadEnabled` VIP 死路；`collaborationDomains` 后端孤儿但前端 5 处真消费（伪安全边界） |
| R5 | 后端硬编码盲区 | 26 条；魔数未接线；字体上传零上限；邮箱码无限爆破；9 处 ADMIN 字符串比较 |
| R6 | 前端/移动端硬编码 | 32 条；PC 9 处手机号正则；两端白名单不一致；`/reset-password` 死路 |
| R7 | 部署全链路 | 15 断点；模式插入点 `cli.js:274-278` + `docker-runtime:380` + `verify-deploy:411` 三处；docker 口令死分支 |
| R8 | 配置读写消费链 | `resolveValue` 五层真相；**无批量端点无事务**；`resetToDefault` 是天然反向原型；权限体系够用零改动 |
| R9 | 登录·会话·SSE | 9 条登录入口全 `@Public`；`assertLoginEligible` 4 处收口；6 条 SSE 全表；公告 ack 跨账号串用 |
| R10 | 错误提示与文案 | 双轨制无枚举；23 处硬编码中文；`ForgotPassword:79` 死代码；会话过期零提示 |
| R11 | 管理员界面与横幅 | 横幅精确插点 `Layout.tsx:795` 后；`ModeSwitchModal` 复用 `ResetCategoryModal`；移动端零配置界面 |
| R12 | 等保与权限 | 等保→配置映射表；三权分立可绕过；审计证据链四重缺口 |

### 高危组合（一轮漏记，二轮实证）
`requireEmailVerification=true` + `mailEnabled=false` + **微信登录**：`local-auth.provider.ts:326-327` 的 needEmail/PhoneBinding **未按 mailEnabled/smsEnabled 门控**，与本地登录（`login.service.ts:149,185` 有门控）不对称 → **未绑邮箱的微信用户 100% 死锁**，且故障只在微信渠道暴露，极难定位。同一误配下本地账号登录不受影响。

---

## 八、一轮勘误

| 一轮表述 | 二轮实测 |
|---|---|
| 「allowRegister / allowAutoRegisterOnPhoneLogin / wechatAutoRegister / requireEmailVerification / requirePhoneVerification / mfaEnforceEnabled / 10 项限流阈值……已是可热改的 **public** 配置，纯改默认值零代码」 | `hot` 缺省 true 故行为可热改成立；但 **security 组 20 项全 `isPublic:false`**，`allowAutoRegisterOnPhoneLogin`/`userCleanupEnabled`/`refundNotifyEmails` 也 false。public 名单约 80% 错 |
| 「文档称 10 项限流阈值」 | 实际安全分类下限流/锁定类 **共 15 项**（含 4 项 `orderCreate`/`sms*` 未在表内） |
| `collaborationDomains` 是**孤儿配置** | 后端 0 读取属实，但**前端 5 处真消费**（`SidebarContainer.tsx:451`、`appConfig.ts:409`、mobile `home/index.vue:280`、`platform/collaboration/domains.ts`）→ 是「仅客户端强制、可绕过」的**伪安全边界**，非孤儿 |
| `ForgotPassword` 中文子串判断「改文案即失效」 | 更糟：该分支后端**永不报错**，判断是死代码，**客服入口永久不可达** |
| 后端未 i18n 硬编码中文 **5 处** | **23 处**，另 `csrf.guard.ts:81/94/103` 3 处英文硬编码 |
| `error.yml` 硬编码「30天」位置 | 实际 `packages/backend/src/common/i18n/translations/zh-CN/error.yml:6`；前端 `zh-CN.ts:1929` 同句内既有 `{days}` 占位符又有写死「30天后」 |
| 「配置变更目前不进 `audit_logs`」（缺口 D，单点） | **四重缺口**：不进 audit_logs + `runtime_config_logs` 无链可删 + 哈希链不含现值 + drill 只读 env |
| 「存量部署不会被新模式反向重置——应保证安全（未实测）」 | **已实锤安全**（见 §六） |
| 管理员入口隔离「两处对称」 | 4 条登录路径**全部收口在 `assertLoginEligible`**，改造点比 2 处更集中 |
| 审计量级未评估 | 63 AuditAction / 49 调用点 / 热路径同步阻塞写；`HIGH_FREQUENCY_READ_ACTIONS` 中仅 USER_LOGIN 有调用点 |

**二轮拍板被用户推翻（2026-10-19 三）**：二轮原拍板「不动 `password-policy`」，理由是与「普通模式便利」原则冲突「但改造成本太高」。用户明确裁决：普通模式**便利高于一切、不做合规**，安全模式**完全遵循等保**——故口令策略**必须**模式化，T3 由「排除项」升级为**本次最大结构项**（含 1 张新建表 `password_history`）。连带暴露 T17（validator 硬下限 vs 便利原则）。同时确认**全部部署默认 `normal`**。

---

## 九、Out of scope

- **等保公司承接 12 项**（机构、人员、定级备案、测评）—— 流程事项，非代码。
- **国密 / 密评（8.1.10.9）** —— 架构级，非模式开关能表达。
- **客体（数据库表/行）粒度授权** —— 现行走补偿叙事（`mlps3-checklist.md` 已披露）。
- **单机热冗余** —— 架构级。
- **「管理员重置他人密码」新能力** —— 本次不引入新能力，只做档位切换。
- **`password-policy` 重构** —— 若 T3 维持「排除」裁决，则永久排除；翻案需重新立项。
- **`variant=private` 打包期的语义变更** —— 本次只划清边界（T9），不改 ADR-0075 的打包逻辑。
- **三权分立互斥规则** —— 结构性改造（需角色权限中间表或互斥依赖模型），本次只披露现状。
- **`storage-service` 在容器形态** —— 维持「Docker 部署包不装不跑不配」。

---

## 十、阻塞：Gitea 凭据（已确诊，需人工做 1 次）

迁移本地图表为 Gitea 票需要仓库写权限。2026-10-19 三轮实测，**确诊为 scope 问题，不是网络或时序**：

| 探测 | 结果 | 含义 |
|---|---|---|
| `GET /api/v1/user`（带 token） | **200** | 令牌有效、Gitea 在线、网络正常 |
| `GET /api/v1/repos/qjx/cloudcad`（带 token） | **404** | scope 不含 `read:repository` |
| `GET /api/v1/repos/qjx/cloudcad/labels`、`/issues` | **404** | 同上 |
| `GET /api/v1/user/repos` | **0 个仓库** | `public-only` 把私有仓库从列表**过滤掉**（不只是拒访问） |
| `GET /api/v1/repos/qjx/cloudcad`（**无** token） | **403** | 仓库存在且私有 |

用户身份：`wdx`，id=2，**`is_admin: false`**（所以不能自己授予仓库成员权限之外的东西；但你已有 `qjx/cloudcad` 成员权限、能 push，缺的只是令牌 scope）。

### 一次性修复（做完不用再登录 Gitea）

Gitea **令牌创建是纯 UI 操作，没有 API 端点能自建** → 必须登录浏览器一次。做这一次就永久解决：

1. 打开 `http://10.66.66.1:5656` → 登录 → 头像菜单「**设置 → 账户 → 访问令牌**」→「创建令牌」。
2. **有效期设为「不过期」**（Gitea 的 token 默认不过期，不要勾「设置过期时间」）。这是「只做一次」的关键。
3. 权限范围**全勾**（一次给足，省得以后回来第二次）：`read:repository`、`write:repository`、`read:issue`、`write:issue`、`read:user`、`write:user`。若表单里还有其他可勾的（`admin:repo_hook`、`read:public_key` 等）一并勾上——`wdx` 非管理员，勾不到 admin 级 scope，能勾的都勾即可。
4. 复制生成的 40 位令牌。
5. 写入凭据缓存（一次性）：
   ```bash
   printf 'protocol=http\nhost=10.66.66.1:5656\npath=/qjx/cloudcad.git\nusername=wdx\npassword=<新token>\n\n' \
     | git credential-manager-core store
   ```
6. 验证：
   ```bash
   TOKEN=$(printf 'protocol=http\nhost=10.66.66.1:5656\npath=/qjx/cloudcad.git\n\n' \
     | git credential-manager-core get | sed -n 's/^password=//p')
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: token $TOKEN" \
     http://10.66.66.1:5656/api/v1/repos/qjx/cloudcad/labels   # 期望 200
   ```
7. **回到令牌页面把旧的 `public-only` 令牌删掉**，避免下次又取到旧的那个（credential cache 会被覆盖，但 Gitea 侧旧令牌留着会混淆）。

⚠️ 已知坑：`git credential-manager-core get` 传**非缓存的 path/host 变体会交互式弹密码框挂死**——必须用上面**完全一致**的 `path=/qjx/cloudcad.git` 形式（少一个 `/` 或大小写不符都会挂住 shell）。

### 迁移动作（令牌修好后我来做）

1 张 `wayfinder:map` 票 + **17 张子票**（T1–T17，标签 `wayfinder:research|prototype|grilling|task`），子票 body 尾部挂 `*Wayfinder 票 · 子票：[<map title>](<map url>)*`，阻塞走 `## Blocked by` 小节（Gitea 无原生子 issue / issue-link 端点）。
