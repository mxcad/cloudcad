# 后端安全审查报告 — CloudCAD Backend (Round 1)

> 审查日期：2026-05-08  
> 审查范围：`packages/backend/src/**/*.ts`  
> 审查维度：认证与授权、注入攻击、敏感数据泄露、CSRF/CORS、输入验证

---

## 1. 认证与授权 (Authentication & Authorization)

### 1.1 【严重】Session 创建接口为公开端点，可伪造任意用户身份 ✅ 已修复 (45591717)

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/session.controller.ts:30, 40-76` |
| 严重程度 | **严重** |
| 问题描述 | `SessionController` 使用 `@Public()` 装饰器，其中的 `POST /session/create` 端点接受客户端传入的 `{ user: { id, email, username, role } }` 并直接存入 Session。**攻击者无需任何认证即可伪造任意用户身份**（包括 admin 角色），后续请求将通过 `JwtStrategyExecutor` 的 Session 认证分支（`session.controller.ts` 与 `jwt-auth.guard.ts` 均有 Session 回退逻辑），从而获得该伪造身份的全部权限。 |
| 修复状态 | ✅ 已修复 — commit `45591717`: remove @Public() from SessionController, require JWT authentication to prevent identity forgery |
| 修复建议 | 1. 立即移除 `@Public()` 装饰器或删除 `POST /session/create` 端点；2. Session 创建必须仅在登录验证成功后的服务端代码中执行，绝不可暴露为公开 API。 |
| 需要用户确认 | **是** — 需确认此端点是否为调试用途遗留代码，如是应立即删除。 |

### 1.2 【高】Session 认证绕过 JWT 验证

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/guards/jwt-auth.guard.ts:69-78` |
| 严重程度 | **高** |
| 问题描述 | 当请求不含 JWT Token 但 Session 中存在 `userId` 时，Guard 直接构造 `request.user` 对象（含 `id`、`role`、`email`），**跳过了 JWT 签名验证、过期检查、Token 黑名单检查**。结合 1.1 的公开 Session 创建端点，攻击者可实现完整的身份伪造链路。 |
| 代码片段 | `request.user = { id: request.session.userId, role: request.session.userRole, email: request.session.userEmail }` |
| 修复建议 | 1. Session 认证至少应验证 Session 签名（express-session 已内置）；2. 对 Session 认证也执行用户状态检查（查询数据库确认用户状态为 ACTIVE）；3. 确认 Session 中存储的 `userRole` 不可被客户端修改。 |
| 需要用户确认 | 是 — 需确认 Session 中存储的 `userRole` 是否在登录时正确设置且不可被客户端修改。 |

### 1.3 【高】Tus 认证中间件存在硬编码 fallback 密钥 ✅ 已修复 (5202a0c7)

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/mxcad/tus/tus-auth.middleware.ts:34` |
| 严重程度 | **高** |
| 问题描述 | TusAuthMiddleware 从 ConfigService 获取 JWT 密钥失败时回退到硬编码字符串 `'your-secret-key'`，与 `configuration.ts` 中的默认值一致。若生产环境未正确设置 `JWT_SECRET` 环境变量，攻击者可自行签发有效的 JWT Token 绕过认证。 |
| 修复状态 | ✅ 已修复 — commit `5202a0c7`: 移除配置文件中硬编码默认密钥（P0 安全修复） |
| 修复建议 | 移除硬编码 fallback，改为抛出明确错误，阻止应用启动或拒绝所有认证请求。 |
| 需要用户确认 | 否 |

### 1.4 【低】CsrfGuard 仅做 Token 长度校验，未验证 Token 内容

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/guards/csrf.guard.ts:52-61` |
| 严重程度 | **低** |
| 问题描述 | CSRF Guard 检查 Bearer Token 或 X-CSRF-Token 时只验证了长度（Bearer 16-1024 字符，CSRF 16-256 字符），未验证 Token 的有效性（签名/过期）。CSRF Token 应有服务端存储的对应值进行比对验证。 |
| 修复建议 | 实现 CSRF Token 的"存-验"机制：服务端生成 CSRF Token 存入 Redis（与 Session 关联），验证时比对请求头中的 Token 与服务端存储值是否一致。 |
| 需要用户确认 | 是 — 需确认 CSRF Token 的完整生命周期是否已在 Controller 层单独实现。 |

### 1.5 【中】`@RequireProjectPermission` 从多处提取 nodeId 可能被操纵

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/common/guards/require-project-permission.guard.ts:149-163` |
| 严重程度 | **中** |
| 问题描述 | `extractNodeId()` 方法从 `params` → `body` → `query` 中依次提取 `nodeId` 或 `parentId`。如果攻击者同时在多个位置传入不同的 nodeId（如 params 中是一个节点，body 中是另一个），可能导致权限检查使用错误的节点。Guard 优先使用 params，如果 params 中的 nodeId 属于一个有权限但不同的节点，而实际操作在 body 中的无权限节点上进行，可能导致越权。 |
| 修复建议 | 统一 nodeId 的提取来源优先级策略，并确保与 Controller 层实际操作使用的 nodeId 一致。如果路由参数中有 nodeId，应优先且仅从路由参数中获取。 |
| 需要用户确认 | 是 — 需确认 Controller 层具体使用的 nodeId 来源是否与 Guard 一致。 |

### 1.6 【中】搜索接口无权限控制

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/file-system/file-system.controller.ts:909-929` |
| 严重程度 | **中** |
| 问题描述 | 搜索接口 `GET /file-system/search` 没有 `@RequirePermissions` 或 `@RequireProjectPermission` 装饰器。虽在类级别使用了 `@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard, PermissionsGuard)`，但没有指定具体的权限要求，任何已认证用户均可调用搜索，可能泄露超出其权限范围的文件信息。 |
| 修复建议 | 为搜索接口添加明确的权限要求，或在 Service 层严格按用户的项目权限过滤搜索结果。 |
| 需要用户确认 | 是 — 需确认 SearchService 内部是否已按用户权限过滤结果。 |

---

## 2. 注入攻击 (Injection Attacks)

### 2.1 【中】ProcessRunnerService.runSync() 命令字符串拼接

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/conversion/process-runner.service.ts:303-304` |
| 严重程度 | **中** |
| 问题描述 | `runSync()` 方法使用 `execSync()` 执行命令，通过字符串模板构建命令：`` `"${binaryPath}" ${args.map((a) => `"${a}"`).join(' ')}` ``。虽然 args 被双引号包裹，但 `binaryPath` 来自配置（非直接用户输入），加之 `execSync` 将整条命令传给 shell 解析。同文件的 `executeOnce()` 正确使用了 `spawn(binaryPath, options.args)` 的数组形式。 |
| 修复建议 | 将 `runSync()` 也改为使用 `spawnSync()` 并传入参数数组，避免 shell 解析命令行字符串。 |
| 需要用户确认 | 否 |

### 2.2 【低】DiskMonitorService WMIC 命令注入风险

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/common/services/disk-monitor.service.ts:112-113` |
| 严重程度 | **低** |
| 问题描述 | Windows 下使用 WMIC 查询磁盘信息时，将 `deviceId` 拼接到命令字符串中：`` `wmic logicaldisk where "DeviceID='${deviceId}'" get FreeSpace,Size /value` ``。虽然 `deviceId` 来自 `path.parse(drivePath).root` 的结果，不是直接的用户输入，但如未来该方法被扩展接受用户输入的路径参数，则存在命令注入风险。 |
| 修复建议 | 优先使用 Node.js 内置 API 或第三方库（如 `node-disk-info`）获取磁盘信息，避免调用系统命令。如果必须使用命令，应使用 `execFile` 而不是用字符串拼接参数。 |
| 需要用户确认 | 否 |

### 2.3 【低】LinuxInitService 使用系统命令

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/mxcad/infra/linux-init.service.ts` |
| 严重程度 | **低** |
| 问题描述 | 使用 `chmod`、`mkdir`、`cp` 等系统命令来初始化 Linux 环境。所有路径来源于配置文件（`mxcadAssemblyDir`），不直接来自用户输入。但如果配置文件被篡改，可能导致命令执行任意操作。 |
| 修复建议 | 优先使用 Node.js 的 `fs.chmod`、`fs.mkdir`、`fs.cp` 等内置 API 替代 shell 命令调用。 |
| 需要用户确认 | 否 |

### 2.4 【中】SVN 操作通过外部包执行系统命令

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/version-control/providers/svn-version-control.provider.ts`（全文件）<br>`src/version-control/version-control.service.ts:666, 674` |
| 严重程度 | **中** |
| 问题描述 | 所有 SVN 操作委托给 `@cloudcad/svn-version-tool` 外部包，该包内部会执行 SVN 命令行操作。`nodeId`、`filePath`、`directoryPath` 参数从 Controller 传入，在如 `getFileHistory` (line 666) 中用于构建 `repoUrl`：`` `file:///${this.svnRepoPath}/${directoryPath}` ``。如果外部包未对参数做充分的命令行注入防护，攻击者可能通过构造特殊的参数注入命令。 |
| 修复建议 | 1. 审查 `@cloudcad/svn-version-tool` 包内部的命令构建方式，确保使用 `execFile`/`spawn` 数组形式而非字符串拼接；2. 在 Provider 层面增加参数校验（确保 nodeId 符合 UUID 格式，filePath 不包含 shell 特殊字符）。 |
| 需要用户确认 | 是 — 需确认 `@cloudcad/svn-version-tool` 内部是否已做命令注入防护。 |

---

## 3. 敏感数据泄露 (Sensitive Data Exposure)

### 3.1 【严重】配置文件中存在多个硬编码默认密钥 ✅ 已修复 (5202a0c7)

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/config/configuration.ts:104, 113, 169-171` |
| 严重程度 | **严重** |
| 问题描述 | 多个敏感配置项存在硬编码的 fallback 默认值，若生产环境未设置对应环境变量，将使用这些不安全的值：<br>- `jwt.secret`: `'your-secret-key'`<br>- `database.password`: `'password'`<br>- `session.secret`: `'mxcad-session-secret-key-change-in-production'` |
| 修复状态 | ✅ 已修复 — commit `5202a0c7`: 移除配置文件中硬编码默认密钥（P0 安全修复） |
| 修复建议 | 1. 生产环境强制要求 `JWT_SECRET`、`DB_PASSWORD`、`SESSION_SECRET` 环境变量必须设置（已有部分校验但不够严格）；2. 将默认值改为随机值或直接抛错阻止启动；3. 至少应使用 `crypto.randomBytes(64).toString('hex')` 在首次启动时生成并持久化。 |
| 需要用户确认 | 是 — 需确认生产部署是否确保这些环境变量已正确设置。 |

### 3.2 【高】文件下载签名密钥存在硬编码 fallback ✅ 已修复 (5202a0c7)

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/file-system/file-download-handler.service.ts:67` |
| 严重程度 | **高** |
| 问题描述 | 文件下载预签名 URL 使用 `FILE_DOWNLOAD_SIGN_SECRET` 环境变量，fallback 为 `'default-sign-secret'`。若生产环境未设置此环境变量，攻击者可以自行构造有效的签名 URL 绕过权限下载任意文件。 |
| 修复状态 | ✅ 已修复 — commit `5202a0c7`: 移除配置文件中硬编码默认密钥（P0 安全修复） |
| 修复建议 | 与 JWT_SECRET 同样处理：生产环境强制要求设置此环境变量，移除硬编码 fallback。 |
| 需要用户确认 | 否 |

### 3.3 【中】JWT 策略中 select 了 password 字段

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/strategies/jwt.strategy.ts:99` |
| 严重程度 | **低** |
| 问题描述 | JWT validate 方法中 `select: { password: true }` 查询了密码哈希字段用于判断"是否设置了密码"。虽在返回前通过解构移除（第137行），但如果未来代码变更忘记解构，可能导致密码哈希泄露。 |
| 修复建议 | 建议只取 `password` 用于内部判断，但不要将其包含在返回对象中。可考虑使用 `!!user.password` 提前判断后，单独返回 `hasPassword` 而不将 password 字段纳入 select 结果。 |
| 需要用户确认 | 否 |

### 3.4 【低】日志中 Token 截断打印

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/guards/jwt-auth.guard.ts:59` |
| 严重程度 | **低** |
| 问题描述 | `logger.debug` 中打印 Token 的前 20 个字符（`token.substring(0, 20)`）。虽然调试环境下有助于排查问题，但若日志未被妥善保护，可能导致 Token 部分泄露。 |
| 修复建议 | 减少打印长度（如前 8 个字符）。确认生产环境 `logger.levels` 仅为 `['error', 'warn']`，debug 日志不会被输出。 |
| 需要用户确认 | 否 |

### 3.5 【低】ValidationPipe 中打印完整验证错误

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/common/pipes/validation.pipe.ts:28` |
| 严重程度 | **低** |
| 问题描述 | `logger.error` 中使用 `JSON.stringify(validationErrors, null, 2)` 打印完整验证错误。若用户输入中包含了敏感信息（如密码被错误地放在了额外字段中），可能被记录到日志。 |
| 修复建议 | 在日志打印前过滤敏感字段名（如 `password`、`token`、`secret`）。 |
| 需要用户确认 | 否 |

### 3.6 【良好实践】全局异常过滤器已实现敏感信息过滤

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/common/filters/exception.filter.ts:28-45, 142-156` |
| 严重程度 | **正面发现** |
| 问题描述 | `GlobalExceptionFilter` 包含 `sensitivePatterns` 正则数组和 `sanitizeMessage()` 方法，用于过滤异常消息中的路径、数据库连接字符串、环境变量等敏感信息。同时限制消息长度不超过 500 字符。 |
| 修复建议 | 无 |

### 3.7 【良好实践】用户服务查询使用 Prisma 参数化查询

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/users/users.service.ts:138-143` |
| 严重程度 | **正面发现** |
| 问题描述 | 用户查询使用 Prisma ORM 的 `where` 对象，所有查询条件通过 Prisma 参数化，不存在 SQL 注入风险。 |
| 修复建议 | 无 |

---

## 4. CSRF / CORS 安全

### 4.1 【良好实践】CORS 配置合理

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/main.ts:171-193` |
| 严重程度 | **正面发现** |
| 问题描述 | 生产环境通过 `CORS_ORIGINS` 环境变量白名单控制，支持逗号分隔多个域名；开发环境允许 localhost 常用端口。设置 `credentials: true` 支持跨域携带 Cookie。 |
| 修复建议 | 考虑将 `CORS_ORIGINS` 的默认值从 `http://localhost:3000` 改为空/无默认值，生产环境强制要求配置。 |

### 4.2 【良好实践】安全响应头设置全面

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/main.ts:197-213` |
| 严重程度 | **正面发现** |
| 问题描述 | 设置了 `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`X-XSS-Protection: 1; mode=block`、`Referrer-Policy`、`HSTS`（HTTPS 环境）和 `Content-Security-Policy`。 |
| 修复建议 | CSP 中 `script-src 'unsafe-inline' 'unsafe-eval'` 削弱了防护效果。如果可行，考虑逐步收紧 CSP 策略。 |

### 4.3 【中】文件下载端点手动设置 CORS 头绕过全局策略

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/file-system/file-system.controller.ts:618-636, 732-742` |
| 严重程度 | **中** |
| 问题描述 | `downloadNodeOptions` 和 `downloadNodeWithFormat` 端点手动设置了 CORS 响应头，其中 `Access-Control-Allow-Origin` 使用了请求中的 `origin` 头的值或 fallback 到 `*`。这**绕过了** `main.ts` 中配置的 CORS 白名单，允许任意来源发起跨域下载请求。 |
| 修复建议 | 移除手动设置的 CORS 头，依赖全局 CORS 配置。如需特殊处理，应在全局 CORS 中间件中统一配置而非在 Controller 中覆盖。 |
| 需要用户确认 | 否 |

---

## 5. 输入验证 (Input Validation)

### 5.1 【中】RefreshTokenDto 缺少 class-validator 验证

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/dto/auth.dto.ts:61-64` |
| 严重程度 | **中** |
| 问题描述 | `RefreshTokenDto` 仅声明了 `refreshToken: string` 但没有使用 `@IsString()`、`@IsNotEmpty()` 等验证装饰器。攻击者可以发送空字符串或非字符串类型的 refreshToken。 |
| 修复建议 | 添加 `@IsString()` 和 `@IsNotEmpty()` 装饰器，并限制最小长度。 |
| 需要用户确认 | 否 |

### 5.2 【中】多个认证端点使用内联类型绕过 DTO 验证

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/auth.controller.ts:195, 240-248, 298, 323, 470, 490, 585, 609` |
| 严重程度 | **中** |
| 问题描述 | 多个认证接口使用内联类型 `{ email: string }`、`{ phone: string; code: string }` 等，未通过 DTO 验证。`sendVerification` 缺少 `@IsEmail()` 验证，`loginByPhone` 缺少 phone 格式和 code 长度校验，`bindEmailAndLogin` 缺少 tempToken 格式校验。各接口也缺少 `@MaxLength()` 限制以防止过量数据提交。 |
| 修复建议 | 为每个接口创建专用 DTO 并添加适当的 class-validator 装饰器。 |
| 需要用户确认 | 否 |

### 5.3 【良好实践】全局 ValidationPipe 配置完善

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/common/pipes/validation.pipe.ts:20-22` |
| 严重程度 | **正面发现** |
| 问题描述 | `CustomValidationPipe` 设置了 `whitelist: true` 和 `forbidNonWhitelisted: true`，可自动过滤 DTO 中未定义的字段，防止参数污染攻击。 |
| 修复建议 | 无 |

### 5.4 【良好实践】RegisterDto 密码验证规则合理

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/dto/auth.dto.ts:24-46` |
| 严重程度 | **正面发现** |
| 问题描述 | `RegisterDto` 对用户名（3-20 字符，仅字母数字下划线）、邮箱（`@IsEmail`）、密码（8-72 字符）都设置了合理的验证规则。密码使用 `@MinLength(8)` + `@MaxLength(72)`（bcrypt 的最大输入长度）。 |
| 修复建议 | 无 |

---

## 6. 路径遍历 (Path Traversal)

### 6.1 【良好实践】文件下载实现了路径遍历防护

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/file-system/file-download-handler.service.ts:143-153` |
| 严重程度 | **正面发现** |
| 问题描述 | 下载文件时对 `storagePath` 进行 `path.normalize()` 规范化，然后检查是否以 `FILES_DATA_PATH` 开头。如果路径不在允许目录内，返回 403 错误并记录 "路径遍历攻击检测" 日志。 |
| 修复建议 | 无 |

---

## 7. 其他发现

### 7.1 【良好实践】bcrypt 使用安全的轮数

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/services/password.service.ts:6` |
| 严重程度 | **正面发现** |
| 问题描述 | 密码哈希使用 bcrypt 12 轮（`SALT_ROUNDS = 12`），这符合当前安全实践（OWASP 推荐 10+ 轮）。 |
| 修复建议 | 无 |

### 7.2 【低】SMS IP 采集依赖客户端可控头

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/auth/auth.controller.ts:519-524` |
| 严重程度 | **低** |
| 问题描述 | SMS 验证码接口通过 `x-forwarded-for` 头采集客户端 IP，用于频率限制。但 `x-forwarded-for` 可被客户端伪造。`trust proxy` 已设置为 `true`，在正确部署时应使用最左侧的 IP。但对于直接连接场景，攻击者可伪造此头。 |
| 修复建议 | 确认反向代理已正确设置并覆盖 `x-forwarded-for` 头，或使用 `request.ip`（NestJS 会根据 trust proxy 设置自动从最右侧提取）。 |
| 需要用户确认 | 是 — 需确认生产环境反向代理是否过滤/覆盖 `x-forwarded-for`。 |

### 7.3 【信息】`downloadNodeWithFormat` 使用 Session 回退认证

| 属性 | 内容 |
|------|------|
| 文件路径 | `src/file-system/file-system.controller.ts:702-704` |
| 严重程度 | **低** |
| 问题描述 | `downloadNodeWithFormat` 在获取 userId 时除了从 `req.user` 获取外，还回退到 `req.session?.userId`：`(req.user as { id?: string })?.id || (req.session as { userId?: string })?.userId`。这与 1.2 中描述的 Session 认证绕过问题一致，可能存在风险。 |
| 修复建议 | 统一认证方式，不应在业务代码中单独回退到 Session。依赖 Guard 层已完成的认证结果（`req.user`）。 |
| 需要用户确认 | 否 |

---

## 8. 总结表格

### 漏洞数量统计

| 严重程度 | 数量 | 关键发现 |
|----------|------|----------|
| 严重 | 2 | Session 创建端点为公开 API 可伪造身份、配置文件中硬编码多个默认密钥 |
| 高 | 3 | 文件签名密钥硬编码、Tus 中间件硬编码密钥、Session 认证绕过 JWT 验证 |
| 中 | 10 | 下载端点绕过 CORS 白名单、命令注入风险、SVN 参数验证缺失、DTO 验证不完整、搜索接口无权限控制、nodeId 多来源提取等 |
| 低 | 7 | 日志 Token 截断、CSRF Token 验证不完整、IP 采集依赖代理头等 |
| 正面发现 | 8 | 异常过滤器敏感信息过滤、CORS 白名单、安全响应头、路径遍历防护、bcrypt 配置、ValidationPipe whitelist、RegisterDto 验证、参数化查询 |

### 按维度汇总

| 维度 | 评价 | 主要风险 |
|------|------|----------|
| 认证与授权 | 🔴 高风险 | **公开的 Session 创建端点可伪造身份**、硬编码 fallback 密钥、Session 认证绕过 |
| 注入攻击 | ⚠️ 中等风险 | execSync 字符串拼接、SVN 参数未校验 |
| 敏感数据泄露 | ⚠️ 中等风险 | 多处硬编码默认密钥/密码、Debug 日志打印 Token 片段 |
| CSRF/CORS | ⚠️ 中等风险 | **下载端点手动 CORS 绕过全局白名单**、CSRF 验证不完整 |
| 输入验证 | ⚠️ 中等风险 | 多个端点使用内联类型绕过 DTO 验证 |
| 路径遍历 | ✅ 较安全 | 文件下载有规范化+目录检查防护 |
| 密码存储 | ✅ 较安全 | bcrypt 12 轮，密码哈希从响应中剥离 |

### 优先修复建议

1. **【严重-立即修复】** 删除 `POST /session/create` 公开端点或移除其 `@Public()` 装饰器
2. **【严重-立即修复】** 移除 `configuration.ts` 中的所有硬编码默认密钥，生产环境强制要求设置环境变量
3. **【高-尽快修复】** 移除 `file-download-handler.service.ts` 和 `tus-auth.middleware.ts` 中的硬编码 fallback 密钥
4. **【高-尽快修复】** 移除下载端点中手动设置的 CORS 头，统一使用全局 CORS 配置
5. **【中-本迭代】** 审查 Session 认证机制，增加数据库用户状态验证
6. **【中-本迭代】** 为 `RefreshTokenDto`、`loginByPhone` 等内联类型创建专用 DTO
7. **【中-本迭代】** 审计 `@cloudcad/svn-version-tool` 包的命令注入防护
8. **【低-持续改进】** 收紧 CSP 策略、改进 CSRF Token 验证机制、减少日志中的敏感信息

---

> **审查声明**：本报告基于静态代码审查，不对动态运行时行为做断言。标记为"需要用户确认"的项目需开发团队根据业务上下文进行最终判断。
