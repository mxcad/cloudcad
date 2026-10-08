# 0073 — 数据库 / Redis 密码重置走同一条带外运维通道，安全性质是「账本一致」

**Status**: accepted（2026-10-08）

## 背景

ADR-0072 补上了管理员密码的恢复通道，但同一台机器上还有两类凭据完全没有受控的变更通道，只有**一个 ADR-0071 之前的旧实现**：

- `packages/config-service/routes/system-config.js` 有 `POST /api/password/database` 与 `POST /api/password/redis`，挂在 3002 运维中心。而该文件同级的 `lib/ops.js` 文件头自己写着「禁止把 CLI 逻辑复制进来」——这是 ADR-0071 的 expand-contract 只扩未缩，双轨留在位。
- 该旧实现有四个真实缺陷：
  1. **密码暴露进程列表**：用 `redis-cli -a <旧密码>` 执行，`ps` 里可见。`runtime/scripts/redis-manager.js` 早已刻意回避这一点，说明这个坑是已知的。
  2. **持久化静默空转**：`CONFIG SET requirepass` 会让**发起该命令的客户端立刻失去认证**，而它把 `CONFIG REWRITE` 拆到下一次 `spawnSync`、还带着已失效的旧密码，所以永远回 `-NOAUTH` 且返回值被忽略。没暴露出来只是因为 `redis-manager` 每次拉起都会按 `.env` 重写 auth conf 兜住。
  3. **零审计**：改基础设施密码是这台机器上最该留痕的事，两条路由都不写审计行。
  4. **静默降级成「只改 .env」**：`psql`/`redis-cli` 缺失时只告警后继续写 `.env`，服务端与账本从此永久分叉。
- 排查中还有一个改变形状的发现：**嵌入式 PostgreSQL 是全仓库 `-A trust` 初始化**（`runtime/scripts/pg-manager.js` 的两处 `initdb`），且**全仓库没有任何一处写过 `pg_hba.conf`**。服务端根本不校验密码——`ALTER USER ... PASSWORD` 会成功写进 `pg_authid`，但没有任何认证入口读它。
- 另一条约束：`DATABASE_URL` 优先级高于 `DB_PASSWORD`（`packages/backend/src/database/database.service.ts`）。只改 `DB_PASSWORD`，Prisma 继续拿旧口令。

## 决策

数据库与 Redis 密码重置做成两条运维 CLI 命令，与 ADR-0072 的 `admin:reset-password` 同构：

```
cloudcad db:reset-password [--interactive] [--no-restart]
cloudcad redis:reset-password [--interactive] [--no-restart]
```

- **核心安全性质：先用新密码验证成功，才允许写 `.env`。** 这是防止服务端与账本静默分叉的唯一有效手段，两条命令共用同一模式：
  - **数据库**：`ALTER USER "..." WITH PASSWORD '<新>'`（维护库 `postgres` + 旧口令连接）→ 立刻用**新**口令 `psql -tAc "SELECT 1"` → 成功才 `updateEnvFile`。验证失败时服务端已改、`.env` 仍是旧值，此时**尽力用旧口令回滚并大声报错**，绝不静默继续。
  - **Redis**：`CONFIG SET requirepass` 走裸 RESP（不经 shell，故密码不进进程列表）→ 用**新**口令在独立连接上 `AUTH` 验证 → 成功才写 `.env` → `AUTH` + `CONFIG REWRITE` **同一次请求**内发出持久化（顺序原因见 `lib/redis-takeover.js` 注释；跨请求发恒回 `-NOAUTH`，正是缺陷 2）。
- **不索取旧密码**：旧密码只记录在 `.env`，能执行本命令的人本来就能读到它，校验它不构成边界（ADR-0072 同一理由）。空值时自动生成强随机口令，只在终端显示一次。
- **成对改 `.env`**：`DB_PASSWORD` 与 `DATABASE_URL` 必须一起写（`DATABASE_URL` 优先，密码 `encodeURIComponent`——含 `#` 的口令会被当 URL 片段静默截断，是记录在案的历史事故）。`REDIS_PASSWORD` 是单一事实源。
- **凭据副本同步**：刷新 `DEPLOY-PASSWORDS.txt`（复用 `lib/credentials.js` 的 `saveCredentialBackup`），否则该文件从此是错的。刻意不动 `docker/.env`——那是 Docker 形态的独立部署，走不同入口，本 CLI 在那套形态下不会跑。
- **审计**：新增 `DB_PASSWORD_RESET` / `REDIS_PASSWORD_RESET`（`resourceType=SYSTEM`，`params.source=ops_cli`，`resourceName` 记被改对象如 `postgres@127.0.0.1`）。`audit_logs.userId` 是 NOT NULL 带外键，故取一条真实 ADMIN 作归属；无管理员时跳过审计并如实说明。审计失败不回滚，与 ADR-0072 / mfa.js 一致。
- **重启集合（即「使用到的地方」的真问题）**：数据库 → `backend`（PG 不需重启，`ALTER USER` 即时生效）；Redis → `redis` → `backend` → `conversion`（只重启确实注册过的 app，`pm2 jlist` 状态为 `unknown` 的跳过）。**明确不重启** `cooperate`（零 Redis，HTTP 代理）、`config-service`（禁止自重启）、`frontend`（不连 Redis）。
- **ADR-0071 收尾**：3002 的两条路由改成薄壳——`lib/ops.js` 新增 `runDbPasswordReset` / `runRedisPasswordReset` 桥接（对齐既有 `runMfaUnbind` 的 `{ confirmed: true }` 写法），路由层只保留 ADR-0071 明确允许的**输入校验**（旧密码核对，网页表单带该字段，是防误改的人机确认），改密逻辑整体委托 CLI。新增 `test/system-config-password.test.js` 用一个源码扫描断言锁住「路由层不再自己拼 psql/redis-cli/CONFIG REWRITE/PM2」，防双轨回归。
- **ADR-0072 的通道也进 3002（`/api/password/admin-user` + `/api/password/admin-users`）**：CLI 菜单把三条恢复命令归成一节，运维中心也应有同一入口。新增 `runAdminUserPasswordReset` / `listAdminUsers` 桥接，走 ADR-0072 早已备好但从未有人调用的 `nonInteractive` 通道。三条关键差异：
  - **不索取旧密码**（数据库/Redis 保留核对）。理由不同：基础设施密码的核对是「你确认知道当前值」的防误改确认；而管理员密码重置的**整个存在理由就是不知道旧密码**。
  - **用户名必须显式点名**：网页无法交互询问，故先暴露只读的候选列表（`queryAdminCandidates`，本就存在，只是没导出）。
  - **回传 `totpEnabled` / `unbindTotp`**：该管理员启用 TOTP 而重置时未一并解绑，登录后仍会被动态码挡住——网页必须把这个后果说出来，否则用户会把「登录仍被挡」误判成重置失败。
- **顺手堵住一个越权口子：`admin-reset-password` 过去不限角色**。`queryAdminByUsername` 原用 `LEFT JOIN` 且不带角色条件，`cloudcad admin:reset-password <任意用户名>` 能重置非管理员账号。既然要把这个能力做成**网页按钮**，就必须先收敛口径——现在与 `queryAdminCandidates` 同一角色条件，失败信息改为「用户不存在或不是管理员」。这改变了 CLI 既有行为（此前能重置非管理员），是刻意的：命令名与 ADR-0072 的语义都是「管理员」。
- **审计来源分层：CLI 是 `ops_cli`，3002 是 `ops_web`**。四条恢复命令原先把 `params.source` 与 `userAgent` 硬编码为 CLI 值，网页入口上线后若不改，从网页改密码会被记成终端操作——审计追溯会指错地方。故四条命令都支持 `options.source` / `options.userAgent` 覆盖（默认仍是 CLI 值，CLI 行为与既有测试不变），桥接层统一展开 `WEB_SOURCE`。
- **顺带修一处静默失效**：`runtime/scripts/commands/migrate.js` 的 `getDatabaseSize` 用 `process.env.DB_PASSWORD`（shell 环境）取口令，而调用方按 `.env` 解析其余连接参数——部署机 shell 里没有这个变量，`pg_database_size` 恒连不上、恒报 0 字节。改为走 `getDbEnv()`。
- **psql 与审计写入收敛到唯一出口**：`lib/psql.js` 的 `run` 支持 `{ database, password }` 连接覆盖，`writeAudit` 支持 `resourceType`/`userId`，新增 `auditorId()`。四条恢复通道（`mfa:totp-unbind` / `admin:reset-password` / `db:reset-password` / `redis:reset-password`）共用它，本次未产生第二份 psql builder。
- **落地过程中发现并修掉一个更深的缺陷：psql 执行器一直把 SQL 经 shell 传递。** `run` 原先拼命令串 + `shell: true`，而这里的 SQL 全是双引号包裹的驼峰标识符（`"resourceType"` / `"roleId"` / `"totpSecret"`）——shell 吃掉双引号，PostgreSQL 把标识符折叠成小写，每一句都报 `column "resourcetype" does not exist`。**溯源：shell 调用方式与带引号的驼峰标识符在 `mfa.js` 里从一开始就同时存在**（早于 `35b2e59`，见 `465f488` 快照），`35b2e59` 把它逐字收敛进 `lib/psql.js`、未改变行为，随后它成为所有恢复通道的唯一出口，于是 `66ce67b`（ADR-0072）的 `admin:reset-password` 一并继承。后果是：
  - **运维审计一条都没写进去过**（审计失败按设计只告警不中断，所以没人看见）；
  - `auditorId()` 恒返回空串；
  - **ADR-0072 的 `admin:reset-password` 与 `mfa:totp-unbind` 两条带外恢复通道从未真正可用**——读不到管理员（SELECT 失败）、也改不动任何行（UPDATE 零命中）。

  已改为参数数组 + 不启用 shell，并用 `lib/psql.test.js` 的「SQL 不得拼进命令串」断言锁死防回归。对照实验：同一条 UPDATE 去掉引号精确报 `column "totpsecret" of relation "users" does not exist`，加回引号则真跑在驼峰列上（返回 `UPDATE 0`，0 行只因测试用的 id 不存在）。

## 否决方案

- **顺手把 pg_hba 硬加固（`host 127.0.0.1/32 → scram-sha-256` + reload）**：这是仓库里完全不存在的能力，会把整个部署的失败模式从「怎么连都能连」翻成「密码错谁都连不上」。**而密码重置命令恰恰是你被锁死时才跑的那条——把逃生舱弄坏是最坏的失败模式。** 该硬加固需独立 ADR + 灰度 + 回滚预案，单独排票。本 ADR 做的是「账本一致」：在 Docker 形态（官方 postgres 镜像真校验 `POSTGRES_PASSWORD`）与系统 PG 回退形态下它已经是真门禁，嵌入式形态下它保证 `.env` 与服务端不漂移。
- **保留 3002 的旧实现，只让 CLI 调用它**：那 4 个缺陷会继续留在位，且方向与 ADR-0071「CLI 是单一事实源」相反。
- **做消费者热重载**：本架构里不存在按消费者的凭据热注入——`app.module.ts` 的 `ConfigModule.forRoot` 无 `isCacheable:false`、无 watcher，`.env` + 重启**就是**这套协议的传输机制。加热重载要倒转分层（运维脚本反向影响应用启动期烘焙），且与「TTL 收紧需 fs watcher 才成立」的既有裁定同类。
- **让 3002 直接读取后端凭据面而不是 CLI**：ADR-0071 已把「产品 DB 的改密不该经运维中心的 `.env` 凭据面」列为否决项。
- **保留旧路由的 `oldPassword` 服务端校验为安全边界**：那是假边界——能上 3002 的人本来就能读 `.env`。但 3002 侧**保留**该核对（路由层的输入校验，网页表单有该字段），因为它是「你确认知道当前值」的防误改确认，而真正的逃生舱是 CLI（不索取旧密码）。

## 后果（非显然约束）

- **新增两个 `AuditAction` 枚举值** 需要 Prisma 迁移（`20261008000002`，两行 `ALTER TYPE ADD VALUE`，在线变更不锁表）。**迁移未应用的部署上，密码重置仍会成功，但审计插入会失败并告警**——恢复能力本身不依赖新枚举值。
- **升级后运维审计会「凭空开始」**：psql 缺陷修复前，`audit_logs` 里没有任何一条 `params.source=ops_cli` 的行。部署升级后第一段时间出现运维审计行、或 `admin:reset-password` / `mfa:totp-unbind` 第一次真正生效，都是预期的，不是新 bug。反之，若升级后这两条命令仍报「找不到管理员」，说明 shell 缺陷以另一种形式复发，应先查 `lib/psql.test.js` 是否被改动。
- **数据库密码重置在嵌入式形态下不是安全门禁**，是账本一致性操作。这一点必须对运维明说：`-A trust` 下任何人只要能连到本机 5432 就不需要密码。真正的加固见否决方案第一条。
- **`Redis CONFIG REWRITE` 失败不算错**：实例由命令行参数启动（我们的 `redis-manager` 走 `--requirepass`）时没有配置文件，REWRITE 返回 `ERR The server is running without a config file`，只告警不中止——下一轮重启会按 `.env` 重新注入。
- **不设空 Redis 密码**：后端对 `REDIS_PASSWORD` 是生产 fail-fast，设空会让后端起不来，命令直接拒绝。
- **不要求旧密码、但拒绝「新密码等于当前密码」**：两者不同——前者是恢复通道的性质，后者是防无意义写入。
- **口令策略比旧路由严**：统一走 `assertPasswordPolicy`（长度下限读 `PASSWORD_POLICY_MIN_LENGTH`，默认 10，四类至少三类），旧路由只查 `≥8`。3002 表单的客户端校验仍是 `≥8`，8–9 位的输入会过客户端、被 CLI 的策略校验拒绝并把原因回传到表单错误区。
- **菜单总数断言随之调整**：两条恢复命令无 `scope`/`platform` 标记，四种部署形态全可见（恢复入口绝不能只在开发机出现），`menu.test.js` 已把两项列入「核心项在所有环境都可见」断言锁定。
- **`test/system-config-password.test.js` 用 `require.cache` 注入 mock**：该文件在 `node --test` 下独立进程执行，注入不影响其他测试文件；断言的是委托边界而非真实改密（真实路径的单测在 `runtime/scripts/commands/*-reset-password.test.js`，用 deps 注入覆盖「验证前不写账本」「失败回滚」）。

## 单独排票（本 ADR 不做）

- **pg_hba 硬加固**：`host 127.0.0.1/32 → scram-sha-256` + `pg_ctl reload`，需独立 ADR + 灰度 + 回滚预案。
- **`packages/conversion-service/services/task-store.ts`**：硬编码 `DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0'` 兜底，且认证失败**静默回退内存队列**——改错 Redis 密码不会让服务报错，只丢队列。跨包行为变更，需单独评估。
- **`packages/config-service/routes/database.js` 的 `/api/test/redis`**：TCP 探测不带 AUTH，密码错了探测仍显绿灯。
- **收掉剩余的 3 处 shell 字符串式 psql 调用**：`commands/db-backup.js` 两处（`checkDatabaseExists` 连维护库 `postgres`）与 `commands/migrate.js` 一处（`repairMigrationRecords` 的 `_prisma_migrations` / `information_schema` 只读查询）。它们**不是活 bug**——SQL 里没有双引号包裹的驼峰标识符，所以 shell 吃引号不会伤到它们——但同属「绕过 `lib/psql` 唯一出口的第二份 psql builder」这一类，日后有人往这些查询里加驼峰列名就会复发。收敛需分别验证备份与迁移修复路径（都要构造真实故障态），不宜夹在本次改动里做。
