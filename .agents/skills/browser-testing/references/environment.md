# 服务环境与测试账号

## 服务端口

| 服务 | 端口 | 启动 | 何时需要 |
|---|---|---|---|
| frontend (Vite dev, PC) | 8000 | `cd packages/frontend && pnpm dev` | 测 PC 端（桌面浏览器） |
| frontend_mobile (Vite dev, 移动端) | 7001 | `cd packages/frontend_mobile && pnpm dev` | 测移动端（`agent-browser set device` 模拟手机） |
| backend (NestJS) | 3001 | `cd packages/backend && node dist/main`（或 `pnpm dev`） | 一切真实登录 / 数据 |
| config-service | 3002 | 随 dev | 运行时配置 |
| PostgreSQL | 5433 | 本机 `runtime/windows/postgresql` | 一切数据 |
| Redis | 6380 | 本机 `runtime/windows/redis` | 会话 / 缓存 |
| conversion-service | 3100 | 按需 | **仅** CAD 文件转换 / 协同；登录 / 普通页面不需要 |

> 本机 dev 的 PG 在 5433、Redis 在 6380（非默认 5432 / 6379）。

## 测试账号

`cd packages/backend && node --import tsx scripts/ensure-e2e-accounts.ts`（幂等，复用后端真实 bcrypt 12 轮 + PII 加密 / HMAC 路径，零漂移）。

| 账号 | 密码 | 角色 |
|---|---|---|
| e2e-admin@example.com | E2eAdmin!2026 | ADMIN |
| e2e-user-a@example.com | E2eUser!2026 | USER |
| e2e-user-b@example.com | E2eUser!2026 | USER |

脚本对每个账号：`bcrypt.hash(pw, 12)`、`emailEnc = encryptPii`、`emailHmac = hmacIndex(normalizeEmail(email))`，按 email upsert，置 `status=ACTIVE / emailVerified=true / provider=LOCAL / totpEnabled=false`。

## 登录接口

`POST /api/v1/auth/login`，body `{ account, password }`（account = 邮箱 / 用户名 / 手机号）。
- 查询走 `emailHmac`（PII HMAC 索引），非明文邮箱。
- 门禁：`status` 须 `ACTIVE`；`mailEnabled && requireEmailVerification` 时须 `emailVerified`。

## curl 打 API 的编码坑（中文 Windows Git Bash，2026-10-30 实测定案）

**中文 Windows Git Bash 终端里，`curl` 命令字面量中的中文（JSON body / URL）会被按 GBK 编码发送**，后端按 UTF-8 解码 → `U+FFFD`（�）腐坏字节落库 → 后续功能（文件名、分享链接）看似「乱码」→ **极易误判为产品 bug**。

- **判据**：腐坏字符是 `�`（U+FFFD）；改用 ASCII 参数不复现；DB 字段确实坏字节。真实浏览器恒发 UTF-8，不会腐坏。
- **解法**：发多字节参数**一律显式 UTF-8**——把 JSON 写进临时 `.json` 文件，`curl --data-binary @file.json`（curl 读文件字节原样，不经终端编码）；或改用 Node 脚本发（`execFileSync` + `buf.toString('utf8')`）。
- **推论**：下「编码 / 乱码 / 文件名」类产品缺陷结论前，必须用真实浏览器或 UTF-8 显式请求复核一次，排除环境因素。详见 SKILL.md「十三、E2E 发现判读」。

## 数据访问（PG / Redis）

测认证 / 验证码分支常需直接读写 PG / Redis（拿 mock 码、改验证状态）。本机 dev 连接信息：

| 库 | 连接 | 说明 |
|---|---|---|
| PostgreSQL | `psql -h localhost -p 5433 -U postgres -d cloudcad`（密码 `wdx123456`，先 `export PGPASSWORD=wdx123456`） | 用户表 `users`：`email`/`phone` 明文列 + `emailEnc`/`emailHmac`/`phoneEnc`/`phoneHmac` PII 加密列 + `emailVerified`/`phoneVerified` 布尔 |
| Redis | `redis-cli -p 6380 -a wdx123456 --no-auth-warning` | 验证码 / 会话 / 缓存 |

> psql 用 `-d cloudcad` 指定库，**别把 `postgresql://...` 连接串当第一个参数**（会被当库名，后面的 `-c` 全被忽略）。`redis-cli` 必须带 `-a <密码>`，否则 `NOAUTH`。
>
> **后台脚本（`bash xxx.sh` / `run_in_background`）里 `psql`/`redis-cli` 不在 PATH**（交互 shell 有 profile 注入，子进程没继承）——脚本里必须用**全路径**：`<repo>/runtime/windows/postgresql/pgsql/bin/psql.exe` 与 `<repo>/runtime/windows/redis/redis-cli.exe`。跑长脚本前先 `command -v` 或全路径探活一次，别等 90s 才发现工具没找到。
>
> **枚举/删 Redis 键用 `KEYS 'pattern'`，别用 `--scan --pattern`**：本机 redis-cli 的 `--scan --pattern 'runtime_config:*'` 会**静默返回空**（键明明存在），导致「清缓存」实际没删到、后端继续读陈旧值。`KEYS 'runtime_config:*'` 才可靠。

## 验证码 / 认证分支测试（纯 API，不走浏览器）

认证模块分支（登录 / 注册 / 验证码 / 拦截）用 **curl 直接打后端 API** 最快，无需浏览器：

- **mock 短信验证码从 Redis 拿**（mock provider 只打 NestJS 日志、不进可访问的 app.log）：key = `sms_verification:code:+86<手机号>`（`+86` 前缀，如 `+8613800000000`），`redis-cli ... GET <key>` 拿 6 位码。
- **验证码验证分支**（`POST /auth/verify-sms-code`）：用 Redis `SET`/`DEL` 控制 `code` 与 `verify_attempts:+86<phone>:<UTC日期>` 两个 key 的状态再调 API 触发——正确→`valid`、错答→`wrong`（剩余 4→0 递减）、第 6 次错→`exhausted`、无码/过期→`expired`。
- **未验证邮箱登录拦截**（`mailEnabled && requireEmailVerification` 时）：改 `users.emailVerified`——有邮箱未验证→401 `EMAIL_NOT_VERIFIED`；清空 `email`/`emailEnc`/`emailHmac`→401 `EMAIL_REQUIRED`+tempToken。**改 PII 列必须 trap 恢复**（备份原值，脚本 EXIT 时写回）。
- **60s 发送冷却**：同一手机号 60s 内只能 `send-sms-code` 一次，测多分支要**换手机号**或 `sleep 65` 等冷却。
- **手机号验证码登录**（`POST /auth/login-phone`）：未注册手机号+正确码→412 `PHONE_NOT_REGISTERED`（`allowAutoRegisterOnPhoneLogin=false` 时）；已注册手机号先 `register-phone`（phone+code+username+password）建号再 login。
- **login-phone「已注册登录成功」分支最省事测法 = 直建 PII 用户，绕开所有配置门禁**：login-phone 成功路径只校验「码有效 + 用户存在 + 发 token」，**不查 `smsEnabled`/`requireEmailVerification`**；而 `send-sms-code` 走 Mock provider，`smsEnabled=false` 也能发码。所以不必去开 `smsEnabled`（`register-phone` 才需要它）——直接往 `users` 插一个 `phone`/`phoneVerified=true` 的用户即可。PII 列复用后端纯函数零漂移：`phoneHmac = hmacIndex(normalizePhone(phone), PII_HMAC_KEY)`、`phoneEnc = encryptPii(phone, PII_ENCRYPTION_KEY)`（`enc:v1:<iv>:<ct>:<tag>` 均 base64），密钥在 `packages/backend/.env`；`normalizePhone` = 去空白去 `+86`。参考 `scripts/ensure-e2e-accounts.ts` 的建号模式（`@cloudcad/db` PrismaClient + bcrypt 12 轮），改写成 phone 用户即可。测完删用户（`refresh_tokens` 外键级联，删 `users` 行即可）+ 清 `sms_verification:*<phone>*`。
- **运行时配置改动不生效 = Redis 缓存陈旧**：`runtimeConfigService.getValue` 先读 Redis `runtime_config:<key>`（命中即返回，`CACHE_TTL` 内），外部直接 `UPDATE runtime_configs` 改 DB **不会**刷新缓存，须同时 `DEL` 对应 Redis 键（或走 API `PUT /runtime-config/:key` 触发 `invalidateCacheKeys`）。**已知 bug**：`PUT /runtime-config/smsEnabled` 报 500 `P2022`（upsert 更新路径找不到记录），无法经 API 开 `smsEnabled`——这也是为何上面 login-phone 成功分支要绕开 `smsEnabled` 直建用户。

## 卡点解法细节

- **装 chromium（慢，后台跑）**：`cd packages/frontend && npx playwright install chromium`。报 `Executable doesn't exist at ...chromium_headless_shell-...` 就是没装。
- **起服务**：见上表。白屏先查前端 8000 是否还活着（看 dev server 日志 / 探活）。
- **慢卡点后台跑**：用后台任务起装浏览器 / 起服务，前台继续探路，别干等。
- **后端重建（改后端代码后要重启才生效，2026-10-30 实测三坑）**：
  1. **Windows 上 `pnpm build` 报 ENOTEMPTY = dist 被锁**：后端正从 `dist` 运行时（`node dist/main`），构建无法覆盖被占用文件。**必须先停后端进程**再 `pnpm build`；停不了就 `taskkill /F /PID <pid>`（`netstat -ano | findstr :3001` 拿 PID）。
  2. **重启后要等 Swagger + api-sdk 重新生成**（约 1-2 分钟）：后端启动会重新生成 Swagger + 触发 api-sdk，期间 3001 可能探活通过但 `/api/v1/...` 接口 404 / 旧契约——**以接口返回为准**，别以端口探活为准。
  3. **类型检查用 `pnpm type-check`，别用 `npx tsc`**：`npx tsc` 会命中占位包（「这不是你要找的 tsc 命令」），静默给错结果。根目录或 `packages/backend` / `packages/frontend` 下 `pnpm type-check` 才对。
- **测试数据清理（真实测试写 DB，测后必清，2026-10-30 实测定案）**：真实 API / 浏览器测试写进 DB 的行必须清理，否则污染下一轮（残留分享影响列表、残留黑名单影响后续登录验证、残留项目影响列表分页）。原则 = 每个真实写库测试脚本带**收尾清理**（trap EXIT 写回备份值 / 删测试条目）。常见清理点：分享 → 删 `file_shares` 行（或 `DELETE /api/v1/shares/:id`）；IP 黑名单 → 删 `ip_blacklists` 测试条目；项目 → 按模块约定软删/真删；用户 → 删 `users` 行（`refresh_tokens` 级联）。
