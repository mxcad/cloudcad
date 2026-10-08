# 0072 — 管理员密码恢复走带外运维 CLI，不做任何认证内找回入口

**Status**: accepted（2026-10-08）

## 背景

管理员密码一旦忘记就永久失去后台访问能力，没有任何找回或重置通道。排查确认这是一组结构性缺口叠加：

- 管理员就是 `users` 表里 `roleId → roles.name='ADMIN'` 的一行，与普通用户共用表；管理员登录唯一入口 `POST /admin/auth/login`（ADMIN 角色 + IP 白名单 + 可选 TOTP），普通 `/auth/login` 对 ADMIN 恒返 401（对称防御，防账号枚举）。
- **admin 命名空间下零找回/重置端点**：后端 10 个 `@Controller('admin*')`、api-sdk 43 条 `/api/v1/admin/**` 路由、前端 `AdminLogin/index.tsx`、MSW handler 全部零命中。
- `INITIAL_ADMIN_PASSWORD` 只在 `user.count() === 0` 时被读一次用于创建初始管理员（`initialization.service`），**运行期零读取点**——忘掉了这条 env 就永久失效。
- 普通用户的找回密码链路技术上对管理员账号也通（`PasswordService` 全函数无 role 判断），但三个前提通常都不成立：`mailEnabled`/`smsEnabled` 运行时开关**默认 false**（全关只回「联系客服」文案）、初始管理员默认邮箱 `admin@example.com` 不可达、初始 `phone=null`。
- 运维侧文档已承诺一个**不存在的功能**：`部署说明-*.txt` 的 FAQ 写着「运行 cloudcad → 密码向导重置」，但 CLI 菜单里根本没有这一项（`setup-wizard` 是首次部署配置，只写 `.env`，而 `INITIAL_ADMIN_PASSWORD` 运行期不被读取）。

即：这不是「少一个按钮」，而是恢复通道整层缺失，且文档已经向客户承诺了一个落空的入口。

## 决策

管理员密码恢复做成**带外运维 CLI 命令**，与既有的 `mfa:totp-unbind` 完全同构：

```
cloudcad admin:reset-password [<username>] [--interactive] [--also-unbind-totp]
```

- **信任边界**：凭据是「能连上部署机 + 有 shell 权限」，不走任何网络面。锁死的本质是「手里没有任何有效凭据」，因此恢复通道必须落在认证体系之外——任何 HTTP 端点都要求先有一个凭据，在完全锁死时不可能工作。
- **实现复用**：复用 `db-backup.js` 的 `getDbEnv`/`getPsqlPath`（离线 runtime psql + `.env` 凭据），纯 SQL 操作，runtime 保持零外部依赖哲学；bcrypt 哈希从 backend 的 `bcryptjs` 加载（pnpm 与 npm 扁平化两种布局都试），成本因子固定 12 与后端 `password.service` 一致。
- **语义对齐**：`UPDATE users SET password=<bcrypt>, passwordChangedAt=now()` 与 `DELETE FROM refresh_tokens` **同一事务原子提交**——对齐 `resetPassword` 的「重置密码 = 全量撤销既有会话」，否则泄漏场景下旧 refresh token 最长 7 天仍有效。
- **口令来源**：默认生成强随机口令（复用 `setup-wizard` 的 `generateStrongPassword`，16 位四类全覆盖）并只在终端显示一次；`--interactive` 改为掩码输入二次确认（运维常需把客户指定的口令交给他）。两者都断言与后端同口径的口令策略（长度下限读 `PASSWORD_POLICY_MIN_LENGTH` + 四类至少三类）。
- **目标定位**：缺省参数时列出全部 ADMIN 供选择，给了用户名则精确校验。管理员可以有多个，且客户往往连用户名都记不全。
- **留痕**：写 `ADMIN_PASSWORD_RESET` 审计（`params.source='ops_cli'` 区分运维通道与界面自助改密），沿用 mfa.js 的「审计失败不回滚、仅告警」语义。
- **兑现文档**：CLI 菜单新增 [重置管理员密码] 项，两份部署说明的 FAQ 改为真实命令；`cloudcad.bat` 补 `%*` 参数透传（原先不透传，子命令形式在 Windows 上是死的，而 `cloudcad.sh` 本就有 `"$@"`）。

## 否决方案

- **HTTP 应急端点 + 应急恢复码**：需要一个「永远在线的免密改密面」+ 密钥生成/存储/轮转。安全收益最差、工作量最大，且引入一个此前不存在的长期攻击面。
- **复用普通找回链路（管理员登录页加「忘记密码」链接）**：技术上通，但依赖真实邮件通道与可达邮箱——两个前提在私有化部署里通常都不成立，链接永远不可用只会制造挫败感。已在文档里写清「若真实启用了邮件通道且管理员邮箱可达，可走普通找回流程，重置后到管理员登录页登录」，不做 UI 入口。
- **运维中心 3002 加一个改密按钮**：ADR-0071 明确两层 UI 各自独立登录是特性，且产品 DB 的改密不该经运维中心的 `.env` 凭据面。CLI 函数级复用留了未来接入的口子（`options.confirmed` 已支持非交互调用）。
- **只写运维 runbook（psql + 自己拼 bcrypt hash）**：运维得自己算哈希（要懂 cost=12 与 `$2b$` 前缀语义），不可行也不安全；且把恢复能力留在运维个人能力上，不随产品交付。

## 后果（非显然约束）

- **新增 `AuditAction.ADMIN_PASSWORD_RESET`** 需要 Prisma 迁移（`20261008000001`，`ALTER TYPE ADD VALUE`，在线变更不锁表）。**迁移未应用的部署上，密码重置仍会成功，但审计插入会失败并告警**——恢复能力本身不依赖新枚举值，审计只是留痕。
- **刻意不做 Redis session 清理**：session value 里才是 `userId`，按用户清理需 SCAN + 逐条反序列化，而 runtime 脚本刻意零外部依赖（无 redis client）。真实恢复场景里被锁死的管理员根本没有 session；access token 最多 1h 自然过期、refresh 已清空无法续期，暴露窗口 ≤1h。与 mfa.js 解绑行为一致。
- **刻意不校验弱口令黑名单**：黑名单在 backend 的 TS 模块里，runtime 无法解析；且它只在「设置口令」入口生效、不影响登录。生成器产出 16 位四类随机口令，命中概率可忽略。
- **多语句事务不带换行**：`BEGIN;UPDATE ...;DELETE ...;COMMIT;` 仅用分号分隔——分号已足够，换行经 shell 引号传递有二次转义风险（已实测验证：`\n` 经 `JSON.stringify` 会变成字面两个字符）。
- **TOTP 叠加场景**：密码重置不自动解绑 TOTP。若管理员验证器也丢了，需加 `--also-unbind-totp` 或先跑 `mfa:totp-unbind`；命令输出会主动提示该情况，避免「密码重置了却仍登不上」的二次挫败。
- **无「至少保留一名管理员」保护**：与既有现状一致（`PATCH /users/:id` 本就能删掉最后一个 ADMIN），本 ADR 不扩大该缺口也不在此处补上——恢复通道里加该约束没有意义，它属于用户管理端点的独立议题。
- **菜单总数断言随之调整**：恢复项无 `scope`/`platform` 标记，四种部署形态全可见——恢复入口绝不能只在开发机出现，`menu.test.js` 已把两项管理员恢复通道列入「核心项在所有环境都可见」断言锁定。
