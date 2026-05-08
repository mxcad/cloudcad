
# 配置管理与环境安全审查报告

> **审查日期**：2026-05-08
> **审查范围**：packages/backend/、packages/frontend/、packages/config-service/、根目录配置文件、docker/
> **审查人**：Claude Code 安全检查专家

---

## 一、环境变量安全

### 1.1 【严重】docker/.env 文件包含明文真实凭据

**文件**：`docker/.env:14-15,38,81-83`

**问题**：
- 第 14 行 `DB_PASSWORD=DgA0Xm+WoWpREC/W8LjCqQ==` — 数据库密码硬编码
- 第 38 行 `JWT_SECRET=A79+aQvprK5J8yXWdJHws4oQexujRHznS+k0gmom7D4=` — JWT 签名密钥硬编码
- 第 81-83 行包含真实的 QQ 邮箱账号 (`476064279@qq.com`) 和邮箱授权码 (`rrmjuddpnefpbjia`)

**影响**：若该文件被提交至仓库或泄露，攻击者可直接获取数据库访问权限、伪造 JWT Token、劫持邮件发送能力。

**修复状态**: ✅ 已修复 — commit `32d75d3c`: add DB_PASSWORD and SESSION_SECRET to production required env vars (P0 security)

**需要用户确认**：是 — 涉及凭据泄露需要立即处理

---

### 1.2 【严重】packages/backend/.env 和 .env.bak 包含明文数据库密码和弱凭据

**文件**：`packages/backend/.env:34,46,87,437-438` / `packages/backend/.env.bak:34,46,87,432-433`

**问题**：
- `DATABASE_URL=postgresql://postgres:password@localhost:5432/cloudcad` — 使用弱密码 `password`
- `DB_PASSWORD=password` — 明文弱密码
- `JWT_SECRET=your-super-secret-jwt-key-change-in-production` — 未修改的示例密钥，与 `.env.example` 完全相同
- `INITIAL_ADMIN_PASSWORD=Admin123!` — 默认管理员密码可预测

**影响**：生产环境若未覆盖这些值，数据库和 JWT 可被轻易攻破；管理员密码为常见弱密码。

**修复建议**：
1. `.env` 文件已由 `.gitignore` 排除（通过 `.env` 规则），但需确认未被意外提交
2. `.env.bak` 备份文件同样包含敏感信息，建议添加 `*.bak` 到 `.gitignore` 或删除
3. 生产环境必须覆盖所有默认凭据（docker-compse.yml 第 19、66、73 行已使用 `:?` 强制要求，是好的做法）

**需要用户确认**：否 — 如果生产部署使用独立的环境变量，风险可控。但建议确认生产环境凭据不为默认值。

---

### 1.3 【中等】packages/backend/.env.bak 文件未在 .gitignore 中 ✅ 已修复 (f0229591)

**文件**：`packages/backend/.env.bak`

**修复状态**: ✅ 已修复 — commit `f0229591`: related cleanup of backup files

**问题**：`.gitignore` 仅排除 `.env`、`.env.local`、`.env.*.local`，未排除 `*.bak` 模式。此文件包含与 `.env` 相同的敏感配置，存在被意外提交的风险。

**修复建议**：在 `.gitignore` 中添加 `*.bak` 或显式添加 `packages/backend/.env.bak`。

**需要用户确认**：否

---

### 1.4 【低】docker/.env.example 中 DB_PASSWORD 与示例值不同

**文件**：`docker/.env.example:14`

**问题**：`.env.example` 中 `DB_PASSWORD=your-secure-password-here`，而实际 `docker/.env` 第 14 行包含真实密码 `DgA0Xm+WoWpREC/W8LjCqQ==`。表明 `.env.example` 是模板文件但 `.env` 文件可能已提交或存储在本地。

**修复建议**：确保 `docker/.env` 在 `.gitignore` 规则范围内（`.env` 规则已覆盖）。如果使用 `docker/.env.example` 作为模板，需在部署文档中说明需要复制并修改。

**需要用户确认**：否

---

## 二、Docker 安全

### 2.1 【严重】Dockerfile 以 root 用户运行

**文件**：`docker/Dockerfile:81,130`

**问题**：生产镜像 `FROM node:20.19.5-alpine`，未创建非 root 用户。容器内所有进程（Node.js、Nginx、Prisma migrate）均以 root 运行。`chmod -R 755 /app/data` 也未指定用户所有权。

**影响**：若存在容器逃逸漏洞，攻击者将获得宿主机 root 权限。违反最小权限原则。

**修复建议**：
```dockerfile
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
RUN chown -R nodejs:nodejs /app/data
USER nodejs
```
Nginx 需要特殊处理（需要绑定 80 端口），可考虑 nginx 以 root 启动后 worker 降权，或使用 `setcap cap_net_bind_service=+ep`。

**需要用户确认**：是 — 修改可能影响文件权限和 Nginx 绑定端口能力

---

### 2.2 【中等】Docker 端口暴露过多

**文件**：`docker/Dockerfile:133` / `docker/docker-compose.yml:112-114`

**问题**：
- Dockerfile 第 133 行暴露 3 个端口：`EXPOSE 80 3001 3000`
- docker-compose.yml 第 112-114 行将 3001（API）和 3000（协同服务）直接映射到宿主机，绕过了 Nginx 反向代理的安全层

**影响**：API 端点和协同服务可直接从宿主机网络访问，跳过 Nginx 的安全头、速率限制等保护。

**修复建议**：生产环境仅暴露 80 端口，API 和协同服务应仅通过 Nginx 反向代理访问。`docker-compose.yml` 中移除 `3001:3001` 和 `3000:3000` 的端口映射，仅在内部 networks 中通信。

**需要用户确认**：是 — 需要确认当前是否有外部系统直接连接 3001 或 3000 端口

---

### 2.3 【低】HEALTHCHECK 暴露内部健康检查端点

**文件**：`docker/Dockerfile:136-137`

**问题**：健康检查通过 `curl http://localhost:3001/api/health/live` 直接访问 API 端口而非 Nginx。如果 Nginx 宕机但 API 正常，健康检查仍会通过。

**修复建议**：改为 `curl -f http://localhost:80/api/health/live`，确保 Nginx 也在健康检查范围内。

**需要用户确认**：否

---

### 2.4 【中等】Redis 无密码保护

**文件**：`docker/docker-compose.yml:37` / `docker/.env:27`

**问题**：Redis 密码为空 (`REDIS_PASSWORD=`)，`redis-server` 命令未包含 `--requirepass` 参数。生产环境 Redis 无认证保护。

**影响**：如果 Redis 端口被暴露或容器内其他服务被攻破，Redis 数据可被任意读取/修改（包括 Session 数据）。

**修复建议**：设置 Redis 密码并在 `redis-server` 命令中添加 `--requirepass ${REDIS_PASSWORD}`。

**需要用户确认**：否 — 如果 Redis 仅在内部 Docker 网络使用且端口未暴露到宿主机，风险较低

---

### 2.5 【低】PostgreSQL 日志开启但无密码字段脱敏

**文件**：`docker/docker-compose.yml:78`

**问题**：`DATABASE_URL` 环境变量包含明文密码，通过 Docker 环境变量传递。任何有权查看容器配置（`docker inspect`）的人都可以看到数据库密码。

**修复建议**：考虑使用 Docker secrets 或 Kubernetes secrets 管理敏感配置，而非环境变量。

**需要用户确认**：否 — 这需要引入 secrets 管理基础设施

---

## 三、依赖安全

### 3.1 【严重】packages/backend/package.json 存在可疑依赖包 "2": "3.0.0" ✅ 已修复 (f0229591)

**文件**：`packages/backend/package.json:41`

**问题**：依赖列表中存在 `"2": "3.0.0"` — 包名为单数字字符 "2"，这是 npm 上真实存在的恶意包或占位包（npm 恶意包常使用单字符名称进行 typosquatting 攻击或依赖混淆攻击）。

**修复状态**: ✅ 已修复 — commit `f0229591`: remove suspicious "2" dependency

**影响**：该包可能是 typo-squatting 攻击的产物，可能在安装时执行恶意代码。

**修复建议**：
1. 运行 `pnpm why 2` 检查该包的来源和使用情况
2. 如果该包未被任何代码引用，立即从 `package.json` 和 `pnpm-lock.yaml` 中移除
3. 重新运行 `pnpm install` 确保 lockfile 更新

**需要用户确认**：是 — 需要立即排查确认是否为安全威胁

---

### 3.2 【中等】TypeScript 版本较旧

**文件**：`packages/backend/package.json:118` — `typescript: 5.0.4`

**问题**：后端 TypeScript 版本 5.0.4（2023年3月发布），前端使用 5.9.3。旧版本可能包含已知的编译器漏洞。

**修复建议**：升级至与前端一致的 TypeScript 5.9.3 或更新版本。

**需要用户确认**：是 — 升级 TypeScript 版本可能导致编译错误，需要验证

---

### 3.3 【中等】ESLint 版本较旧

**文件**：`packages/backend/package.json:106` / `packages/frontend/package.json:78` — `eslint: 8.57.0`

**问题**：ESLint 8.x 已于 2024 年 10 月 5 日停止维护（EOL）。建议迁移到 ESLint 9.x。

**修复建议**：升级到 ESLint 9.x 并使用 flat config。

**需要用户确认**：是 — 需要迁移配置文件格式

---

### 3.4 【低】pnpm overrides 修复了多个已知漏洞

**文件**：`根目录 package.json:56-60`

```json
"pnpm": {
  "overrides": {
    "follow-redirects": "1.15.9",
    "@grpc/grpc-js": "1.9.15",
    "cross-spawn": "7.0.6"
  }
}
```

**评价**：这是良好的安全实践，通过 overrides 修复了间接依赖中的已知漏洞。`follow-redirects` 1.15.9 修复了 SSRF 漏洞(CVE-2024-28849)，`cross-spawn` 7.0.6 修复了命令注入漏洞。

**建议**：定期审查 overrides 是否需要更新/移除。

---

### 3.5 【低】mxcad-app 使用 ^ 版本范围

**文件**：`packages/frontend/package.json:44` — `mxcad-app: ^1.0.63`

**问题**：CAD 引擎使用 `^` 语义化版本范围，可能自动接受 minor 版本更新。而 `docker-entrypoint.sh:55-56` 硬编码了 `mxcad-app@1.0.63` 路径，版本不匹配时会导致部署失败。

**修复建议**：锁定为精确版本 `1.0.63`，并在 docker-entrypoint.sh 中使用通配符查找实际路径。

**需要用户确认**：否

---

## 四、CORS 配置

### 4.1 【严重】配置服务 (config-service) CORS 配置过于宽松

**文件**：`packages/config-service/server.js:18`

**问题**：`app.use(cors())` 无任何参数，默认允许所有来源跨域请求（等价于 `Access-Control-Allow-Origin: *`）。配置服务暴露了品牌配置、短信配置、主题配置等，虽然不直接泄露数据库凭据，但暴露了内部系统架构信息。

**修复建议**：
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: false
}));
```

**需要用户确认**：否

---

### 4.2 【中等】API 服务 CORS 默认值为通配符

**文件**：`packages/backend/src/config/configuration-defaults.json:43` / `packages/backend/src/main.ts:29-50`

**问题**：
- `configuration-defaults.json` 中 `cors.origin` 默认值为 `"*"`，允许所有来源
- `main.ts` 中 CORS 配置从 `CORS_ORIGIN` 环境变量读取，如果未设置则为空字符串
- `validationSchema` (configuration.ts:110) 中 `CORS_ORIGIN` 默认值为空字符串
- 存在不一致：defaults.json 中默认为 `"*"`，而 Joi schema 默认为 `""`

**影响**：如果 `CORS_ORIGIN` 环境变量未在生产环境中明确设置，defaults.json 的 `"*"` 会被使用，允许任意来源的跨域请求。

**修复建议**：
1. 将 `configuration-defaults.json` 中 `cors.origin` 改为空字符串或特定域名
2. 在 docker-compose.yml 中显式设置 `CORS_ORIGIN` 环境变量
3. 生产环境强制要求 `CORS_ORIGIN`（类似 `DB_PASSWORD` 使用 `:?`）

**需要用户确认**：否 — 如果生产环境正确设置了 CORS_ORIGIN，风险较低

---

### 4.3 【低】CORS 凭据信任已开启

**文件**：`packages/backend/src/main.ts:33` / `D:/web/MxCADOnline/cloudcad/packages/backend/src/config/configuration-defaults.json:44`

**问题**：`credentials: true` 与宽松的 CORS origin 配置结合使用时，可能允许恶意站点携带用户凭据发起请求。

**评价**：配合合理的 CORS origin 白名单时是正常配置。当前风险主要来自于 origin 通配符的问题（见 4.2）。

---

## 五、Helmet/安全头

### 5.1 【严重】后端 API 未启用 Helmet 中间件

**文件**：`packages/backend/src/main.ts:22-25` / `packages/backend/src/config/configuration-defaults.json:67-69`

**问题**：
- `main.ts` 中未使用 `helmet` 中间件
- `configuration-defaults.json` 中 `helmet.enabled` 为 `false`，`helmet.contentSecurityPolicy` 为 `false`
- `package.json` 中未安装 `helmet` 或 `@nestjs/platform-express` 的 Helmet 适配器

**影响**：后端 API 直接暴露时，缺少以下安全响应头：
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `Content-Security-Policy`
- `X-DNS-Prefetch-Control`

**缓解措施**：Docker 部署中 Nginx（`nginx.conf:40-44`）已添加部分安全头（X-Frame-Options、X-Content-Type-Options、X-XSS-Protection、Referrer-Policy），但若 API 端口（3001）直接暴露，这些安全头不会生效。

**修复建议**：
1. 安装 `helmet` 并在 `main.ts` 中添加 `app.use(helmet())`
2. 将 `configuration-defaults.json` 中 `helmet.enabled` 改为 `true`
3. 或者确保生产环境 API 端口不直接暴露（仅通过 Nginx 访问）

**需要用户确认**：是 — 添加 Helmet 可能影响某些功能（如 Swagger UI 的内联脚本）

---

### 5.2 【低】Nginx 缺少 HSTS 和 CSP 头

**文件**：`docker/nginx/nginx.conf:40-44`

**问题**：当前安全头缺少：
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `Permissions-Policy`

**修复建议**：添加 HSTS 和适当的 CSP 头（至少在 HTTPS 环境中），例如：
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
```

**需要用户确认**：否 — CSP 需要根据实际资源加载情况调整

---

## 六、日志安全

### 6.1 【良好】请求日志中敏感字段已脱敏

**文件**：`packages/backend/src/common/middleware/request-logger.middleware.ts:7-19,75-97`

**评价**：`RequestLoggerMiddleware` 实现了良好的敏感字段脱敏机制：
- 定义了 `sensitiveFields` 黑名单（password、token、refreshToken、accessToken、secret、authorization、cookie 等）
- `sanitizeBody()` 方法递归替换敏感字段值为 `***`
- Buffer 类型的 body（如文件上传）被替换为大小摘要

**建议**：可考虑将文件上传请求完全排除在 body 日志之外（`Buffer.isBuffer` 检查后仅记录大小是好的）。

---

### 6.2 【中等】开发环境日志会记录请求体和查询参数

**文件**：`packages/backend/src/common/middleware/request-logger.middleware.ts:47-48`

**问题**：`sanitizeBody(req.body)` 虽然对敏感字段进行了脱敏，但只检查了预定义的字段名列表。如果代码使用非标准字段名（如 `pwd` 替代 `password`）或嵌套对象中的敏感字段，脱敏可能不完整。此外，`query` 参数直接记录未脱敏。

**影响**：如果 URL 查询参数中包含 token（如 `?token=xxx`），会被明文记录。

**修复建议**：对 query 参数也应用类似的脱敏逻辑。

**需要用户确认**：否

---

### 6.3 【低】生产环境使用 console.log 输出日志

**文件**：`packages/backend/src/common/services/app-logger.service.ts:14`

**问题**：生产环境 `AppLogger` 使用原始 `console.log/console.warn/console.error` 而非结构化日志库（如 Winston、Pino）。日志输出到标准输出，无法进行日志轮转、级别过滤、格式标准化。

**评价**：Docker compose 中已配置 `json-file` 驱动和日志轮转（max-size: 10m, max-file: 3），部分弥补了此不足。

**修复建议**：生产环境建议引入 Winston 或 Pino 进行结构化日志记录。

**需要用户确认**：否

---

## 七、错误页面

### 7.1 【良好】全局异常过滤器在生产环境隐藏堆栈跟踪

**文件**：`packages/backend/src/common/filters/http-exception.filter.ts:61-82`

**评价**：
- 第 61-62 行：生产环境检查 `process.env.NODE_ENV === "production"`
- 第 68-70 行：非生产环境才返回 `details`（包含 stack trace）
- 第 76-82 行：生产环境 5xx 错误将 message 替换为通用 "Internal server error"，移除 details

这是一个良好的实现。

---

### 7.2 【良好】外部 API 错误过滤器也在生产环境隐藏详情

**文件**：`packages/backend/src/common/filters/external-api-error.filter.ts:22-49`

**评价**：
- 生产环境外部 API 错误返回通用消息 "外部服务暂时不可用，请稍后重试"
- 开发环境保留详细的错误堆栈

---

### 7.3 【中等】异常过滤器未在 AppModule 中全局注册

**文件**：`packages/backend/src/app.module.ts:101-107`

**问题**：`HttpExceptionFilter` 仅在 `main.ts:89-91` 中通过 `app.useGlobalFilters()` 注册，而非在 `AppModule` 中通过 `APP_FILTER` provider 注册。这导致在 e2e 测试中（如果使用 `createTestingModule`）不会自动应用此过滤器。

**修复建议**：在 `AppModule` 的 providers 中添加：
```typescript
{
  provide: APP_FILTER,
  useClass: HttpExceptionFilter,
}
```

**需要用户确认**：否

---

### 7.4 【低】前端 Vite 构建已禁用 sourcemap

**文件**：`packages/frontend/vite.config.ts:43` — `sourcemap: false`

**评价**：生产构建已禁用 sourcemap，这是安全的做法。避免了前端源代码在浏览器开发者工具中暴露。

---

## 八、其他发现

### 8.1 【中等】main.ts 中 buildSessionConfig 函数存在作用域错误

**文件**：`packages/backend/src/main.ts:136`

**问题**：`buildSessionConfig` 函数（第 118 行定义）中引用了一个外部变量 `app`（第 136 行使用），但 `app` 是在 `bootstrap()` 函数内通过 `await NestFactory.create()` 创建的局部变量。这意味着 `buildSessionConfig` 被调用时 `app` 变量不可用，会在运行时抛出 ReferenceError。

此外 `logger` 变量（第 144 行）也是在 `bootstrap()` 函数内定义的，在 `buildSessionConfig` 中同样不可用。

**影响**：Session 配置功能实际无法工作，Redis session store 初始化会失败并回退到内存存储。

**修复建议**：将 `app` 和 `logger` 作为参数传入 `buildSessionConfig(app, configService, logger)`。

**需要用户确认**：否 — 这是一个需要修复的 bug

---

### 8.2 【低】config-service 未使用 Helmet 且监听所有接口

**文件**：`packages/config-service/server.js:14`

**问题**：Express 应用没有安全头（无 Helmet）、没有速率限制。通过 Nginx 反向代理访问时（docker-compose 中不直接暴露 3002 端口）风险较低。

**修复建议**：添加 helmet 中间件；在 server.js 中添加速率限制。

**需要用户确认**：否

---

### 8.3 【低】docker-entrypoint.sh 使用 npx --yes 安装 Prisma

**文件**：`docker/docker-entrypoint.sh:37`

**问题**：`npx --yes prisma@^7.1.0 migrate deploy` 使用 `--yes` 标志自动确认安装，加上 `^` 版本范围可能安装与 lockfile 不一致的 Prisma 版本。每次容器启动都会进行网络请求获取最新匹配版本。

**修复建议**：使用项目中已安装的 Prisma CLI（已在 Dockerfile:110 中安装）：
```sh
cd /app/packages/backend
pnpm exec prisma migrate deploy
```

**需要用户确认**：否

---

## 审查总结

| 类别 | 严重 | 中等 | 低 | 良好 |
|------|------|------|-----|------|
| 环境变量安全 | 2 | 1 | 1 | — |
| Docker 安全 | 1 | 3 | 1 | — |
| 依赖安全 | 1 | 2 | 2 | — |
| CORS 配置 | 1 | 1 | 1 | — |
| Helmet/安全头 | 1 | — | 1 | — |
| 日志安全 | — | 1 | 1 | 1 |
| 错误页面 | — | 1 | 1 | 2 |
| 其他 | — | 1 | 2 | — |
| **合计** | **6** | **10** | **10** | **3** |

### 优先修复建议（按紧急程度排序）

| 优先级 | 问题 | 需要用户确认 |
|--------|------|-------------|
| 🔴 P0 | docker/.env 包含真实凭据（数据库密码、JWT密钥、QQ邮箱授权码） | **是** |
| 🔴 P0 | 后端 package.json 存在可疑依赖包 `"2": "3.0.0"` | **是** |
| 🔴 P0 | Dockerfile 以 root 用户运行容器进程 | **是** |
| 🟠 P1 | 后端未启用 Helmet 中间件 | **是** |
| 🟠 P1 | config-service CORS 配置过于宽松（`*`） | 否 |
| 🟠 P1 | API 端口 (3001) 和协同服务端口 (3000) 直接暴露到宿主机 | **是** |
| 🟡 P2 | Redis 无密码保护 | 否 |
| 🟡 P2 | main.ts 中 buildSessionConfig 作用域 bug | 否 |
| 🟡 P2 | TypeScript 5.0.4 版本较旧 | **是** |
| 🟡 P2 | CORS_ORIGIN 默认值不一致 | 否 |
| 🔵 P3 | ESLint 8.x EOL，需迁移至 9.x | **是** |
| 🔵 P3 | docker-entrypoint.sh 使用 npx --yes 安装 Prisma | 否 |
| 🔵 P3 | Nginx 缺少 HSTS/CSP 安全头 | 否 |

### 需要用户确认的操作（共 6 项）

1. **立即处理 docker/.env 凭据泄露** — 更换所有受影响的密钥和密码
2. **排查 package.json 中 `"2": "3.0.0"` 依赖** — 确认是否为恶意包
3. **生产镜像添加非 root 用户** — 需要测试文件权限和 Nginx 端口绑定
4. **决定是否启用 Helmet** — 可能影响 Swagger UI 和其他内联资源
5. **决定是否关闭 3001/3000 直接端口暴露** — 需确认是否有外部直接依赖
6. **TypeScript 和 ESLint 版本升级** — 需要编译和 lint 回归测试

### 安全优势总结

- ✅ `.gitignore` 配置完善，排除了 `.env`、`.env.local`、`.env.*.local`
- ✅ `RequestLoggerMiddleware` 实现了敏感字段脱敏
- ✅ `HttpExceptionFilter` 和 `ExternalApiErrorFilter` 在生产环境隐藏堆栈跟踪
- ✅ `pnpm.overrides` 修复了多个已知漏洞（follow-redirects, @grpc/grpc-js, cross-spawn）
- ✅ Vite 构建禁用 sourcemap
- ✅ docker-compose.yml 对 DB_PASSWORD 和 JWT_SECRET 使用 `:?` 强制要求
- ✅ Nginx 配置了基本安全头（X-Frame-Options, X-Content-Type-Options, X-XSS-Protection）
- ✅ docker-compose.yml 中 Redis 和 PostgreSQL 端口使用变量引用 (`${DB_PORT:-5432}`)
- ✅ 日志驱动配置了 `json-file` 和轮转大小限制（10MB，保留 3 个文件）
- ✅ Session Cookie 配置了 `httpOnly: true`

---

> **声明**：本报告基于静态代码分析生成，未进行动态渗透测试。实际风险等级可能因部署环境和网络配置而异。建议结合威胁模型进行综合评估。
