# 0082 — 通道凭据进入运行时配置（加密落库 + 验证门禁 + 依赖联动），env 降级为部署期默认层

**Status**: accepted（2026-10-22）

## 背景

触发事件：管理员开启了「强制邮箱验证」但未开启「邮件服务开关」（出厂默认关），SMTP 凭据也未配置——注册页**静默地**不显示邮箱输入框、后端也不强制邮箱，整条链路「开关翻了等于没翻」，全系统没有任何一处警告。根因是三个结构性缺口：

1. **通道凭据 env-only**（MAIL_*/短信/微信/支付凭据全在 .env）：管理员在 UI 里既看不到「什么配了、什么没配」，也无法填写；
2. **开关无验证门禁**：`requireEmailVerification` 可以在邮件通道完全未配置时一键打开；
3. **开关间无依赖声明**：`requireEmailVerification` 依赖 `mailEnabled`、`alertEmailEnabled` 实际走 SMTP 却未声明依赖 `mailEnabled`——依赖关系只存在于代码调用点，不可见、不可校验。

原收录原则（`runtime-config.constants.ts`）规定「秘密不进 DB」（存 DB 等于摊进明文 pg_dump 备份与运维 UI）。本 ADR **部分推翻**该原则：通道凭据成为唯一例外，代价与约束见 D3/D4。

## 决策

### D1 范围：五个面向用户的通道进运行时配置，运维基础设施留 env

- **进**（通道配置含凭据，管理员 UI 可填）：邮件（SMTP）、短信（阿里云/腾讯云）、微信登录、支付（微信支付）、告警（邮件 + Webhook）。
- **留 env**（三类）：
  1. **启动期必需**（约 90 个变量：端口、CORS、DB/Redis 连接、路径、引擎、部署身份、cron）——运行时配置存在 DB 里，DB 没起来读不到它；
  2. **主密钥**（8 个：JWT×2、SESSION、PII 加密/HMAC、TOTP、DB_PASSWORD、REDIS_PASSWORD）——加密/校验 DB 内其他数据的钥匙；
  3. **进程间共享密钥**（3 个：`BACKEND_JWT_SECRET` / `INTERNAL_SERVICE_SECRET` / `CONVERSION_SERVICE_SECRET`）——conversion-service / storage-service 是兄弟进程，各自启动时从**自己的 env** 读、不连 backend 的 DB。**此类是架构硬约束，不是偏好**。
- **明确不进**（运维基础设施，非面向用户的通道）：云 FaaS AK/SK（华为/阿里/AWS 三组）、备份远端 ACCESS_KEY/SECRET、`SENTRY_DSN`、`SCRAPE_TOKEN`。

### D2 env 层语义：活回落（否决一次性播种）

每次读取 = runtime 值 > .env 值 > 默认（既有优先级链，ADR-0077 复用同一条链）。.env 永远有效，是部署期默认层：

- 存量部署零行为变化（.env 里的 MAIL_* 等继续作兜底层，无需迁移）；
- 运维保留 .env 带外通道；
- 否决「一次性播种」（首启把 .env 拷进 DB、此后 DB 为准、.env 被忽略，Open WebUI 模式）：它有升级陷阱——客户改了 .env 里的密码重启后**静默不生效**（DB 值优先），正是本 ADR 要消灭的静默偏离那一类故障。

### D3 通道凭据是「秘密不进 DB」的唯一例外：加密落库 + 掩码回读

- 新增 `secret` 输入类型：值以**通道主密钥**加密后落库。新 env 键 `CHANNEL_ENCRYPTION_KEY`，与 `PII_ENCRYPTION_KEY` 同样式（直接当 32 字节 AES-256-GCM key、无 KDF、长度非法拒绝启动；开发态回退 JWT 派生）。
- **掩码回读**：API 只返回首尾 2 字符 + 「已配置/未配置」状态，永不返回明文。否决只写不回读：多管理员运维场景下「确认当前生效的是哪份凭据」有真实价值（避免 A 配了 B 又覆盖、互相不知道）。
- 主密钥本身留 env（D1 第 2 类）：加密 DB 的钥匙不能存进它保护的 DB。
- 否决复用 PII 密钥（爆炸半径耦合：通道凭据泄露牵连用户 PII，反之亦然）；否决每通道独立密钥（密钥运维成本随通道数线性增长）。

### D4 验证门禁：通道开关须「配置完整 + 通道测试通过」才可开启

- **通道测试** = 每通道一个真实验证动作：邮件 = 测试发信给管理员填写的收件人（默认 supportEmail）；短信 = 凭据探测（服务商查询 API，不发送）+ 可选真实发送到管理员自己号码（显式确认、花一条短信钱）；微信 = AppID/Secret 调 `gettoken` API 探测；支付 = 签名 API 往返（验证凭据 + 证书链，不动钱）；Webhook = 测试 POST。
- **硬阻断、无绕过**：测试不过 = 不能开。通道日后坏了由既有「连续失败升级 P0 告警」（`alertEmailFailEscalate`）兜住，管理员改配置重测即热生效——开启时不需要后门。
- **验证状态**：新表持久化（channel、verifiedAt、testedBy——测试动作入审计，等保要求）；**该通道任一配置项变更即失效**（直接删除验证记录，比配置哈希更简单可靠）。
- `collaborationEnabled` **不**加测试门禁：`COOPERATE_URL` 是部署身份地址，不是凭据通道（最多校验非空）。

### D5 依赖联动：`requires` 声明 + 开启自动开启 + 关闭拒绝

- 定义表新增 `requires: string[]` 依赖声明（单一事实源，更新路径强制校验 + UI 渲染依赖状态）：
  - 功能层：`requireEmailVerification → mailEnabled`；`requirePhoneVerification → smsEnabled`；`wechatAutoRegister → wechatEnabled`；**`alertEmailEnabled → mailEnabled`（现代码缺失的边，本次补上）**；
  - 通道层：通道开关（带 `channel` 标记的布尔键）→ 其通道配置完整 + 已验证。
- **开启自动开启**：打开功能开关时**尝试**打开其依赖的通道开关，但通道自身门禁（D4）仍然生效——通道未验证则整个动作被拒绝并明确提示「请先完成 SMTP 配置并通过测试」，而不是绕过门禁硬开。
- **关闭拒绝**：关闭被功能开关依赖的通道开关时拒绝（「请先关闭邮箱验证」）。否决「自动连带关闭依赖项」（系统替管理员改另一个开关 = 静默偏离，ADR-0077 D5 同构教训）；否决「允许 + 警告」（重新制造触发本 ADR 的静默不生效）。

### D6 机制形态：扩展现有运行时配置体系，不新建子系统

在 `RUNTIME_CONFIG_DEFINITIONS` 上增加三种能力：`secret` 输入类型（D3）、`channel` 标记 + 通道测试注册表（D4）、`requires` 依赖声明（D5）。通道 = 「一组配置项 + 一个开关 + 一个测试动作 + 一组依赖边」。

否决：新建独立「通道管理」子系统（自己的表/API/UI）——会造出第二套并行配置体系，违背项目「收敛到唯一出口」铁律；运行时配置体系已有三层优先级、值校验、审计、`SYSTEM_CONFIG_WRITE` 权限管控全套设施。

### D7 支付证书文件：路径留 env，其余字段进 UI

微信支付 V2 需要 mTLS 证书/密钥**文件**（`WECHATPAY_CERT_PATH`/`KEY_PATH`），文件内容无法用 UI 文本框填写。一期：路径留 env（部署身份性质、变更频率低），appid/mchid/key/notify_url 进 UI。若客户真实诉求是「自助接入微信支付」，三期升级为「证书文件上传（加密落库 + 热重建 mTLS agent）」。

### D8 分期

- **一期** = 通用机制（secret 类型 + 测试框架 + 依赖强制 + 本 ADR）+ 邮件通道端到端（当前痛点）；
- **二期** = 短信 / 微信；
- **三期** = 支付 / 告警 Webhook。

机制是难的部分，邮件通道把它端到端验证掉；之后每个通道是「加一组键 + 写一个测试动作」的机械工作。

### D9 等保三级映射

- 加密落库（D3）；访问控制复用 `SYSTEM_CONFIG_WRITE`（通道配置归 admin 档）；审计 = 配置变更走既有 `runtime_config_logs` + 审计，**测试发送动作也入审计**（它外发真实消息，属敏感操作，承接 ADR-0079 的 CONFIG 类 `AuditAction`）；可见性 = 掩码回读 + 验证状态 + 依赖状态渲染。

## 后果与代价

- **收录原则重写**：`runtime-config.constants.ts` 的「秘密不进 DB」改为「秘密不进 DB，**通道凭据除外**（加密落库 + 掩码回读 + 验证门禁，ADR-0082）」。
- **新 env 键** `CHANNEL_ENCRYPTION_KEY`（生产必填）+ `.env.example` + 部署/打包脚本的密钥生成链同步（`fillEmptySecrets` 等）。
- **新表**通道验证记录 + migration。
- **四个通道客户端热重建**：邮件（nodemailer transport 启动期建）、短信（provider 首调后缓存）、微信（memoized getter）、支付（mTLS agent 构造期建）——每个都需要「配置变更 → 重建通道客户端」机制，是机制工作量的主体。
- **三层联动**：新测试端点 → API SDK 重生成 + MSW handler；管理页响应新增字段（掩码值/验证状态/依赖状态）→ 前端渲染；i18n 四语言。
- **存量部署零迁移**：.env 里的 MAIL_* 等继续作兜底层。
- **残留风险（已接受）**：通道凭据密文进入 pg_dump 备份（密钥不在备份里，无密钥的密文不可解）——这是推翻原原则的代价。

## 相关

- **ADR-0077** — profile 批量应用复用既有优先级链（D2 的活回落继承同一条链）
- **ADR-0079** — 安全模式审计证据链（测试动作审计承接其 CONFIG 类 `AuditAction`）
- **ADR-0055** — 日志监控运维方案（告警通道；`alertEmailFailEscalate` 是 D4「通道日后坏了」的兜底）
- `packages/backend/src/runtime-config/runtime-config.constants.ts` — 收录原则与 `RUNTIME_CONFIG_DEFINITIONS` 单一事实源
- `CONTEXT.md` — 「通道（Channel）」词条
