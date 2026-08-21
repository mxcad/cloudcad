# CloudCAD 代码库全景导航指南

> 面向新同事的完整项目导览：包结构、模块职责、编排流程、数据链路与 Code Review 指南。
> 本文档基于 2026-08-10 的代码库梳理（含一次全面 Code Review），文件路径均为仓库相对路径。

---

## 1. 项目定位与整体架构

CloudCAD 是一个**基于 Web 的 CAD 协作平台**：浏览器内在线编辑 DWG/DXF、团队协作、SVN 版本控制、项目/文件/权限/会员计费管理。公司：成都梦想凯德科技有限公司（mxdraw.com）。

### 1.1 服务拓扑

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  frontend    │    │  frontend_mobile │    │config-service│
│  React 19    │    │  Vue 3 (H5)      │    │ 运维控制面    │
│  :3000       │    │  (经 backend 代理)│    │  :3002        │
└──────┬───────┘    └────────┬─────────┘    └──────┬───────┘
       │  /api (SDK)         │  /api (SDK)         │ 改写 .env / frontend dist（运行时零耦合）
       ▼                     ▼                     ▼
┌──────────────────────────────┐        ┌──────────────────────┐
│  backend (NestJS 11) :3001   │◀───────│  impl-mx（私有认证扩展）│
│  全局 Guard/Interceptor/Filter│  IMPL=  └──────────────────────┘
│  ┌──────────┐ ┌────────────┐ │            │ @cloudcad/cont
│  │ PostgreSQL│ │ Redis      │ │        ┌──────────────────────┐
│  └──────────┘ └────────────┘ │◀───────│  @cloudcad/db         │
│  存储抽象: embedded/standalone│         │  Prisma schema 单一源 │
└──────┬───────────┬──────────┘         └──────────────────────┘
       │           │
  standalone 模式   │ embedded 模式（默认）
       ▼           ▼
┌──────────────┐ ┌──────────────────┐   ┌──────────────────────┐
│storage-service│ │ mxVersionTool    │   │conversion-service :3100│
│ 文件回源+SVN  │ │ (SVN CLI 包装器)  │   │ 转换引擎托管运行时     │
│ :3200         │ │                  │   │ mxcadassembly         │
└──────────────┘ └──────────────────┘   └──────────────────────┘
       └──────────── SVN 仓库（filesDataPath 工作副本 + file:// 仓库）────────┘
```

### 1.2 关键架构决策索引（docs/adr/）

| ADR | 主题 | 一句话 |
|---|---|---|
| 0002 | file-operations 解耦 | FileSystemService 门面已拆除，改为 FileSystemModule 模块聚合 |
| 0005 | mxcadManager 命令模式 | 前端 CAD 命令经 CommandRegistry 注册 |
| 0006 | IAuthProvider 策略 | OSS/Pro/TOB 认证策略可替换 |
| 0007 | 三层依赖约束 | Layer1 基础设施 ← Layer2 核心业务 ← Layer3 业务编排 |
| 0008 | strictNullChecks 增量开启 | 新接口目录单独开启，旧模块分批治理 |
| 0009 | OwnershipStrategy | 项目/个人空间/图库三路权限分支收拢 |
| 0010 | FileSystemNode 单表 | 不拆表，nodeType 区分六种节点 |
| 0011 | per-save backup + auto-restore | 保存原子性 |
| 0012 | 缓存架构简化 | 移除 L3 数据库缓存层 |
| 0013 | 可观测性 | pino + Prometheus RED + Sentry |
| 0014 | 转换引擎独立 | conversion-service 服务 |
| 0015 | Storage 与 SVN 分片 | storage-service 统一文件管理层 |
| 0016 | 三模式部署 | embedded / standalone / cloud FaaS |
| 0020 | 扩展点 vs 内部服务 | 接口+DI token 的边界判定 |
| 0021 | Contracts 与 Impl 分界 | impl-mx 只依赖 contracts |
| 0026 | 扩展机制总纲 | 三类扩展判断（新增扩展点前必读） |
| 0027 | @cloudcad/db 共享 Client | schema 单一源 + 数据层类型唯一出口 |
| 0028-0034 | 前端地基六篇 | 分层门禁 / Façade / 状态归属 / 可替换 / 样式 / 巨型文件 / fetch 治理 |

---

## 2. Monorepo 包总览

| 包 | 技术栈 | 端口 | 入口 | 一句话职责 |
|---|---|---|---|---|
| `packages/frontend` | React 19 + Vite 6 + Zustand + TanStack Query + Radix + mxcad-app | 3000 | `src/index.tsx` | PC 端 CAD 编辑器 + 管理后台 SPA |
| `packages/frontend_mobile` | Vue 3 + Vite 4 + vant + Pinia | — | `src/main.ts` | 移动端 H5 图纸查看/编辑 |
| `packages/backend` | NestJS 11 + Express 5 + Prisma 7 + PostgreSQL + Redis | 3001 | `src/main.ts` | API 编排中枢 |
| `packages/api-sdk` | @hey-api/openapi-ts 自动生成 | — | `src/index.ts` | 前端 HTTP 客户端（fetch-based，无 build 步骤，直接消费 TS 源码） |
| `packages/db` | Prisma 7 | — | `src/index.ts` | schema 单一源 + 共享 PrismaClient（`@cloudcad/db`） |
| `packages/contracts` | 纯 TS 类型 + DI token | — | `src/index.ts` | 跨包契约层（零框架依赖） |
| `packages/config-service` | 纯 Node http（0 外部依赖） | 3002 | `server.js` | 部署配置中心（改 .env / ini / 品牌 / PM2 编排） |
| `packages/storage-service` | 纯 Node http | 3200 | `server.js` | 统一文件回源 + SVN 代理（CDN/ESA 唯一回源源） |
| `packages/conversion-service` | 纯 Node http | 3100 | `server.js` | 转换引擎托管运行时（三模式部署） |
| `packages/impl-mx` | TypeScript（SWC 构建） | — | `src/auth/index.ts` | 私有 MX 实现包（经 IMPL 环境变量动态加载） |
| `packages/mxVersionTool` | CommonJS（无 build） | — | `mxcmd.js` | MX/SVN CLI 包装器 |

### 包间依赖方向（ADR-0007 三层）

```
L1 基础设施：@cloudcad/db、@cloudcad/contracts、@cloudcad/api-sdk、redis、database、common/*
L2 核心业务：auth、users、roles、permission、file-system 子服务、storage-provider、version-control、mxcad 各子模块
L3 业务编排：file-operations、mxcad-core、billing、batch-download、admin、share、vip
```

**铁律**：依赖箭头方向不可逆。可替换模块（OSS/Pro/TOB 有不同实现）用「接口 + DI token + @Optional()」，内部服务用 class-based DI。

---

## 3. 后端架构详解（packages/backend）

### 3.1 应用入口（src/main.ts）

启动流程：

1. `./env` 预加载 .env（必须在模块求值前，保证 `IMPL` 可见）
2. 全局未捕获异常兜底（unhandledRejection/uncaughtException → Sentry → exit(1)）
3. **原生 Express 中间件链**（在 NestFactory 创建前挂到基础 express 实例）：
   - Helmet（CSP 手动设置，`unsafe-inline`+`unsafe-eval`——mxcad WASM 需求）
   - multipart 跳过 JSON/URL 解析（防 Multer "Malformed part header"）
   - `express.json` 50mb（verify 捕获 rawBody 用于微信支付签名）
   - XML text parser（微信支付回调）
   - `express.urlencoded` 50mb
   - Redis session（connect-redis，前缀 `mxcad:sess:`，httpOnly）
   - cookieParser（读 refresh_token cookie）
4. NestFactory.create → 全局前缀 `api` + URI 版本化 `v1`
5. `useGlobalPipes(ValidationPipe)`（见 §3.3 问题①：与 APP_PIPE 叠加）
6. CORS（生产走 CORS_ORIGINS 白名单；暴露 X-Node-Id/X-Request-Id/X-Trace-Id）
7. 全局 CORP `cross-origin`（MxCAD-App SharedArrayBuffer 需要）
8. Swagger 挂载 `api/docs`（dev 环境启动时 `syncSwaggerAndSdk` 非阻塞刷新前端 SDK）
9. **协同代理**：`/api/cooperate` 运行时开关（collaborationEnabled）+ 认证（Session/JWT/cookie）→ 反向代理到 `config.cooperate.url`（WebSocket 3091）
10. Sentry 初始化（SENTRY_DSN 配置时）

### 3.2 全局 Guard / Interceptor / Pipe / Filter（执行顺序）

```
请求进入
  → GlobalExceptionFilter (APP_FILTER)         兜底捕获，敏感信息脱敏 [REDACTED]，i18n 翻译，≥500 记 Sentry
  → PrismaExceptionFilter (APP_FILTER)         Prisma 错误 → HTTP 映射
  → IpBlacklistGuard (APP_GUARD)               IP 黑名单全局拦截
  → RateLimitGuard (APP_GUARD)                 Redis 分布式限流（公开接口严格/认证接口中等，基于 IP）
  → JwtStrategyExecutor (APP_GUARD)            全局认证：JWT 优先 / Session 回退 / @Public / @OptionalAuth（见 §3.3）
  → CsrfGuard (APP_GUARD)                      double-submit cookie，仅对 @CsrfProtected() 端点生效
  → CustomValidationPipe (APP_PIPE)            DTO 校验（whitelist + forbidNonWhitelisted + transform）
  → [Controller Handler]
  → ResponseInterceptor (APP_INTERCEPTOR)      成功统一包装 { code:'SUCCESS', message, data, timestamp }
```

> **关键认知**：Controller 直接 `return xxx`，禁止手包 `{message, data}`（会形成双层嵌套，前端只解包一层 → 页面数据恒空）。

### 3.3 认证体系（src/auth/）

#### 模块结构

```
AuthModule.forRoot()（全局动态模块）
  └─ AuthController (@Controller('auth')) → 注入 IAUTH_FACADE token（AuthFacadeService）
       ├─ AUTHENTICATION_HANDLER  → 用户名/密码登录、注册
       ├─ SMS_AUTH_HANDLER        → 手机号登录/注册/验证
       ├─ OAUTH_HANDLER           → 微信登录
       ├─ ACCOUNT_BINDING_HANDLER → 绑定邮箱/手机并登录
       ├─ TOKEN_HANDLER           → refresh token 轮换
       └─ WECHAT_CALLBACK_SERVICE → 微信回调/轮询事务
  └─ DeviceAuthController (@Controller('device')) → 桌面 EXE 设备授权 OAuth
```

**可替换策略（ADR-0006/0021）**：`createDefaultAuthProviders()`（OSS 实现 `OssAuthProvider`）注册 6 个 handler token；`IMPL` 环境变量存在时，`packages/impl-mx/dist` 的 `createAuthProviders()` 后注册覆盖同 token。impl-mx 经 `@cloudcad/contracts` 的 DI token 注入 DB/EMAIL/CONFIG/SMS 等，不依赖具体类。

#### 登录链路（LoginService.login）

```
限流（AccountRateLimitService 账号维度）
→ USER_SYNC_HOOK.syncBeforeLogin（可选私有扩展，impl-mx 旧官网同步）
→ userRepo.findLoginUser(account)  →  防枚举：不存在/禁用/密码错误统一"账号或密码错误"
→ bcrypt.compare(password)
→ 运行时开关：requireEmailVerification / requirePhoneVerification 检查
→ 展平 membership → membershipTierLevel/membershipExpiresAt/isVip
→ AuthTokenService.generateTokens()：access(1h, payload{sub,email,username,role,type,jti}) + refresh(7d, 落库 RefreshToken 表)
→ 写 req.session + setAuthCookies（auth_token httpOnly path=/，refresh_token httpOnly path=/api/v1/auth/refresh）
→ 返回 { accessToken, refreshToken, user }
```

#### JWT 校验（JwtStrategyExecutor → JwtStrategy.validate）

- `@Public()` 直接放行；`@OptionalAuth()` token 无效时降级匿名
- token 来源：Authorization Bearer / `auth_token` cookie
- JWT 路径：校验 `type==='access'` → Redis token 黑名单 → 用户黑名单 → **DB 实时查 user.status + 实时角色**（降级立即生效）→ `RoleInheritanceService.getRolePermissions` 从 Redis 角色缓存取权限（0 DB 查询）
- 无 token → Redis session 回退：同样查黑名单 + DB 实时角色，角色变化时写回 session
- 全无 → 401

**文件速查**：`auth/strategies/jwt.strategy.ts`、`auth/jwt.strategy.executor.ts`、`auth/auth.controller.ts`、`auth/dto/auth.dto.ts`（DTO 校验示例）、`auth/impl/`（OSS 实现）、`auth/services/token-blacklist.service.ts`

### 3.4 权限体系（双层 RBAC）

| 层 | 守卫 | 判定来源 | 缓存 |
|---|---|---|---|
| 系统权限 | `PermissionsGuard`（@RequirePermissions，可挂类或方法） | `request.user.role.name` → `RoleInheritanceService`（含角色继承 parentId） | Redis 角色缓存（CACHE_TTL.SYSTEM_PERMISSION） |
| 项目权限 | `RequireProjectPermissionGuard`（@RequireProjectPermission，AND/OR 模式） | NodeContextResolver 解析节点上下文 → ProjectPermissionService | Redis 用户-项目权限缓存（成员变更时 clearUserCache） |

**NodeContextResolver 判定顺序**（require-project-permission.guard.ts:104-128）：
```
① 公共资源库公开访问（@LibraryPublicAccess + isLibraryContext）→ 放行
② 库节点 → 系统权限 LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE
③ 个人空间 → ownerId === userId
④ 有 nodeId 无 projectId → ownerId === userId
⑤ 无 projectId → @OptionalAuth 放行 / 否则 400
⑥ 项目访问 → isProjectOwner || checkPermissions（AND/OR）
```

**缓存失效**：`ProjectPermissionService.clearUserCache` 在成员增删/改角色/转让/项目删除时被调用（file-system/file-permission/file-system-permission.service.ts:300-402），TTL 兜底（5-10 分钟）。

### 3.5 文件系统（src/file-system/ + src/file-operations/）

**重要**：ADR-0002 的 FileSystemService 门面**已不存在**，门面角色由 `FileSystemModule` 承担（模块聚合 + 导出子服务）。唯一名为 FileSystemService 的类是 `mxcad/infra/file-system.service.ts`（本地磁盘 I/O 工具，勿混淆）。

```
FileSystemModule（聚合门面）
├── file-tree/        FileTreeService       节点创建/查询/路径解析/唯一名（createFileNode 内 $transaction）
├── file-permission/  FileSystemPermissionService  文件系统权限判定 + 成员管理 + 缓存失效
├── project-member/   ProjectMemberService  项目成员 CRUD/角色/转让
├── storage-quota/    StorageInfoService    容量统计与配额（updateNodeStorageQuota）
├── search/           SearchService（ISEARCH_SERVICE） 全文搜索（FtsQueryBuilder + pg_trgm GIN 索引）
├── file-hash/        FileHashService       MD5 计算
├── file-validation/  FileValidationService 类型/大小/MIME/魔数/文件名安全
└── file-download/    FileDownloadExportService + FileDownloadHandlerService + CrossNodeDownloadService
```

**Controller 分布**（前缀均为 `file-system`）：project.controller（projects/personal-space/quota）、node.controller（nodes/search/resolve-path/batch-*）、trash.controller、download.controller、member.controller、history.controller、batch-download.controller（download/batch-zip）。

**变更编排层**（`file-operations/`，无 Controller，被 file-system/mxcad 消费）：NodeUpdateService（移动/复制/删除/重命名）、NodeCopyMoveService、NodeTrashService（回收站）、NodeNameService、ProjectCrudService、NodeMutationGuard（变更端点保护）、NodeStatusTransitioner（状态流转）。

### 3.6 CAD 引擎模块（src/mxcad/，6 个子模块）

```
MxCadModule（聚合模块，导出 Conversion/Infra/Upload）
└─ MxcadCoreModule（叠加 Multer 配置、3 个对外 Controller）
   ├─ infra/       FileSystemService(本地I/O) + CacheManagerService + ThumbnailGenerationService(MxWebDwg2Jpg.exe)
   │               + LinuxInitService；mxcad-file-access.controller（GET filesData/*path 流式文件访问）+ thumbnail.controller
   ├─ node/        FileSystemNodeService（节点领域服务）
   ├─ conversion/  FileConversionService（MXCAD_CONVERSION_SERVICE）+ AsyncConversionService
   │               → 调 IFunctionExecutor（process-pool 默认 / conversion-service / cloud-faas）
   │               → conversion-status.controller（nodes/:nodeId/convert、status）
   ├─ save/        MxcadSaveService（MXCAD_SAVE_SERVICE，覆盖保存=SVN提交+版本历史）+ SaveAsService
   │               → save.controller（savemxweb/:nodeId、save-as）
   ├─ upload/      DrawingIngestService + ChunkUploadManagerService（分片上传，UploadSession 表）
   │               → mxcad-upload.controller（files/chunkisExist、files/fileisExist、files/uploadFiles，Multer diskStorage 按 hash/chunk 分目录）
   └─ external-ref/ ExternalRefFacadeService（对外仅暴露 I_EXTERNAL_REF_FACADE 单一 token）
                    → external-ref.controller（preloading/:nodeId、check-reference、refresh-external-references、up_ext_reference_dwg/image/:nodeId）
```

依赖方向：`infra ← node ← conversion/save/upload/external-ref ← core`。

### 3.7 版本控制（src/version-control/）—— MX = SVN

- `MxVersionControlProvider`（VERSION_CONTROL_TOKEN）：把 `filesDataPath` 当 SVN 工作副本，仓库为本地 `file:///<mxRepoPath>`
- `onModuleInit` 自举：无仓库 `mxadminCreate` 创建；filesData 空则 checkout，非空则 `mxImport` + checkout；URL 漂移 `mxSwitch --relocate`/`mxRelocate` 修复；`mxPropset` 设 global-ignores
- 全部命令经 `@cloudcad/mx-version-tool`（packages/mxVersionTool）promisify 调用，**无直接 CLI 子进程**
- 错误自愈：E155010 缺失文件循环修复（≤50 轮）、E200009 cleanup+update 重试、E170013/E180001 URL 修复、E155004 锁定 cleanup
- commit message 为 JSON `{type, message, userId, userName, timestamp}`；log XML 正则解析为 HistoryEntry[]

### 3.8 存储抽象（src/storage/ + src/storage-management/，SVN 归 version-control/）

| 层 | 模块 | 说明 |
|---|---|---|
| 存储抽象 | `storage/` | 唯一纯存储接口 `IStorageProvider`（token `'IStorageProvider'`，**不含 SVN 能力**）：`read/write/delete/exists/copy/move/listAll/deleteAll/getMetaData/getUrl/copyFromFs`；`STORAGE_MODE=embedded\|standalone` 分发 `FlydriveStorageProvider`（本地文件系统，基于 flydrive Disk API）/ `HttpStorageProvider`（HTTP 访问独立 storage-service）；`StorageService`（`IStorageService`）为上层门面；`UploadTokenService` 签发免鉴权预签 Token（#273 合并后已无 `storage-provider/` 双轨） |
| SVN 版本控制 | `version-control/` | `IVersionControl`（`VERSION_CONTROL_TOKEN`，`commitNodeDirectory`/`getFileHistory`/`getFileContentAtRevision` 等），同样由 `STORAGE_MODE` 分发 `MxVersionControlProvider` / `HttpVersionControlProvider`（#274） |

`storage-management/` 做物理层：StorageManager（目录分配/删除/拷贝）、DirectoryAllocator（YYYYMM_N 分片路径）、FileLockService、FileCopyService、DiskMonitorService、StorageCleanupService（磁盘水位清理）。

### 3.9 计费 / VIP / 限制引擎（src/billing/ + src/vip/）

```
billing:  PaymentGatewayFactory → WechatPayGateway / MockPaymentGateway
          BillingService（订单创建/支付回调/退款） + BillingCron（订单超时关闭）
          webhook.controller（微信支付 XML 回调，rawBody 验签）
vip:      VipTierService + DurationPricingService（时长定价）+ MembershipService（激活/延期，$transaction）
          RestrictionEngine（限制策略引擎）→ ProjectSizeStrategy / PersonalStorageStrategy / MaxProjectsStrategy
          ConfigKeyRegistryService（键值对配额配置注册表）
```

VIP 升级按价差折算延期（ADR-0025）。VipModule 是全局模块。

### 3.10 其他模块速览

| 模块 | Controller 前缀 | 职责 |
|---|---|---|
| users | `users` | 用户 CRUD/状态/密码/验证策略（BcryptPasswordHasher + 4 种验证策略） |
| roles | `roles` | 系统/项目角色 CRUD + PrismaPermissionStore（IPERMISSION_STORE） |
| permission | 无 | 权限查询/缓存/角色继承（Redis） |
| share | `shares` | 分享链接（FileShare，nanoid token） |
| notification | 无 | 邮件发送（Handlebars 模板）+ 邮箱验证码 |
| audit | `audit` | 审计日志（AuditLogger 集成 CLS，35 种 AuditAction；`/audit/export` CSV/Excel 导出，SYSTEM_ADMIN） |
| admin | `admin` | 管理端聚合（磁盘/存储清理） |
| ip-blacklist | `admin/ip-blacklist` | IP 黑名单 + 全局限流 Guard |
| library | `library` | 公共图库/块库（createDrawingLibraryProvider / createBlockLibraryProvider 工厂） |
| personal-space | 无 | 个人空间容量统计 |
| ownership | 无 | 三路所有权策略工厂（ADR-0009） |
| policy-engine | `policy-config` | 动态权限策略（时间/IP/设备） |
| batch-download | `file-system/batch-download` | 批量 ZIP（SSE 进度 + ConversionRunner + 清理） |
| alert | `alert` | 告警记录（查询 + `PATCH /alert/:id/resolve`，SYSTEM_MONITOR；webhook 适配器） |
| task-run | `admin/tasks` | 后台任务执行记录与控制（`GET runs` SYSTEM_MONITOR / `POST run` SYSTEM_ADMIN） |
| public-file | `public-file` | 免登录公开上传/下载（memoryStorage） |
| fonts | `font-management` | 字体管理 |
| health | `health` | Terminus 健康检查（版本中立路径）+ `queue/stats` 队列统计（SYSTEM_MONITOR） |
| metrics | `metrics` | Prometheus RED（`GET /metrics` 需 SYSTEM_MONITOR） |
| user-cleanup | `user-cleanup` | 注销用户数据清理 |
| runtime-config | `runtime-config` | 运行时配置（Redis/DB 双层缓存） |
| redis / cache-architecture / database / cls / schedulers / i18n | — | 基础设施 |

**定时任务**（common/schedulers/）：缓存清理、审计清理（保留 `AUDIT_LOG_RETENTION_DAYS=180` 天，旧名 `AUDIT_RETENTION_DAYS` 兼容回退）、存储清理、用户清理。

### 3.11 数据库通信链路（Controller → DTO → Service → Prisma）

```
① Prisma schema（packages/db/prisma/schema.prisma，单一源）
② prisma generate → @cloudcad/db 导出 PrismaClient + 全部模型类型/枚举/Prisma namespace
③ DatabaseService（backend/src/database/database.service.ts）extends PrismaClient
   ├─ @prisma/adapter-pg（PrismaPg 连接池：max/idleTimeout/connectionTimeout）
   ├─ dev 慢查询日志（>500ms）；onModuleInit $connect 带超时；healthCheck $queryRaw SELECT 1
④ DatabaseModule（@Global）—— 全局模块，业务模块无需重复 imports
⑤ Service 注入：constructor(private readonly prisma: DatabaseService)
   私有实现（impl-mx）用 contracts 的 DB token 别名（{ provide: DB, useExisting: DatabaseService }）
⑥ 事务：this.prisma.$transaction(async (tx) => {...})  交互式事务，tx 内所有查询走 tx
   （实例：createFileNode 同级查重、node-trash 批量删除、billing 订单/会员联动、refresh-token 轮换等 19 处）
```

**完整链路示例**（登录）：

```
POST /api/v1/auth/login
  → CsrfGuard（跳过，无 @CsrfProtected）→ JwtStrategyExecutor（@Public 放行）→ RateLimitGuard（公开接口限流）
  → CustomValidationPipe：LoginDto（account/password 非空校验）
  → AuthController.login(@Body() loginDto: LoginDto)
  → AuthFacadeService.login → LoginService.login（通过 USER_SERVICE token）
  → UserRepository.findLoginUser(account) → prisma.user.findUnique（@cloudcad/db 类型）
  → bcrypt.compare → AuthTokenService.generateTokens → RefreshToken 表落库
  → setAuthCookies → return AuthResponseDto（ResponseInterceptor 包装 {code:'SUCCESS',...,data}）
  → 前端 clientSetup.responseTransformer 解包 data
```

### 3.12 后端 i18n 与错误码

- nestjs-i18n（zh-CN/zh-TW/en-US/ko-KR YAML），`AcceptLanguageResolver` 按请求头语言
- 新增错误键**必须写 4 个语言文件**（backend-coding-standards 铁律）
- 错误响应体：`{ code: 'ERROR_CODE', message, timestamp, path, method }`，code 为业务枚举（如 `EMAIL_NOT_VERIFIED`、`QUOTA_EXCEEDED`）

---

## 4. 前端架构详解（packages/frontend）

### 4.1 入口与 Provider 链（src/index.tsx —— 注意不是 main.tsx）

```
VoerkaI18nProvider → ErrorBoundary → QueryClientProvider(staleTime 默认)
  → ThemeProvider → NotificationProvider → AuthProvider → App
App 内：BrandProvider → Router → RuntimeConfigProvider → TourProvider → AppContent
```

关键点：
- `AppInitializer` 预取品牌配置；移动设备访问 `/cad-editor` 时跳转 H5
- **CADEditorRouteGuard**：`/` 和 `/cad-editor` 路由的 CAD 编辑器**首次加载后永久驻留 DOM**（everLoadedRef），用 visibility+z-index 显隐——保护 WebGL 上下文与主题双向同步
- MSW 仅 `VITE_MSW=true` 时启动；Sentry 仅 `VITE_SENTRY_DSN` 时初始化

### 4.2 路由表（src/App.tsx，全部 React.lazy）

| 路径 | 页面 | 权限 |
|---|---|---|
| `/login` `/logo` `/register` `/verify-*` `/forgot-password` `/reset-password` `/device` | 认证公开页 | 公开 |
| `/cad-editor(/:fileId)` | CADEditorDirect（全局覆盖层） | 公开免登录 |
| `/dashboard` | Dashboard 工作台 | 登录 |
| `/projects(/:projectId/files(/:nodeId))` `/personal-space(/:nodeId)` | FileSystemManager | 登录 |
| `/users` `/roles` `/font-library` `/audit-logs` `/system-monitor` `/runtime-config` `/admin/ip-blacklist` `/admin/billing` | 管理页 | @RequirePermissions 对应系统权限 |
| `/library(/:libraryType)` | LibraryManager | LIBRARY_*_MANAGE |
| `/member-center` | MemberCenter | 登录 |

### 4.3 分层与门禁（ADR-0028~0034）

```
L1 基础设施：constants/ types/ utils/ lib/ languages/ config/ api-sdk/ styles/
L2 核心业务：services/ stores/ contexts/ hooks/（根）
L3 业务编排：pages/ components/
```

`.dependency-cruiser.cjs` 门禁：`layer1-no-upward`、`ui-no-business`、`layer2-no-upward`、`no-circular`（error）；pages 互引、Façade 深路径导入（warn）。`pnpm depcruise` 自检。

**Façade 入口（ADR-0029）**：`src/api-sdk/index.ts`、`src/services/mxcadManager/index.ts`、`src/hooks/file-system/index.ts`、`src/services/drawingSession/index.ts`、`src/components/export/index.ts`、`src/components/ui/index.ts` —— 外部禁止深路径导入。

### 4.4 API 调用链路（ADR-0034：禁裸 fetch，全部走 SDK）

```
页面/hook  import { nodeControllerGetNode } from '@/api-sdk'   （= export * from '@cloudcad/api-sdk'）
  → packages/api-sdk/src/sdk.gen.ts（@hey-api 生成的函数）
  → client.gen.ts createClient（fetch-based，非 axios）
  → src/config/clientSetup.ts 模块加载时 setConfig：
      ├─ baseUrl = getApiBaseUrl().origin（SDK 自带 /api/v1/ 前缀）
      ├─ responseTransformer：解包 {code,message,data}，code 为数字≠0 抛业务错误，成功返回 data
      ├─ request interceptor：注入 Bearer getValidToken() + Accept-Language
      ├─ 自定义 fetch：401 → tryRefreshToken() → 重放请求（auth 端点除外）
      ├─ response interceptor：4xx 仅 console.warn；5xx/429 全局 Toast
      └─ error interceptor：403 打 isPermissionError；QUOTA_EXCEEDED 全局弹窗（fire-and-forget 防 LoadingOverlay 死锁）
  → src/config/tokenRefresh.ts：单飞刷新（isRefreshing + refreshPromise）、60s 失败冷却、cookie 优先/body 兜底
```

**MSW**：`src/test/msw/handlers.ts` → `generated/handlers.ts`（msw-auto-mock 从 swagger_json.json 自动生成），`onUnhandledRequest: 'bypass'`。

**multipart 铁律**：body 传普通对象 `{ file, hash, ... } as never`（formDataBodySerializer 自动序列化），**禁止原生 FormData**。

### 4.5 状态管理（ADR-0030）

| 层 | 技术 | 内容 |
|---|---|---|
| Server 状态 | react-query（queryKey 走 `lib/queryKeys.ts` 工厂） | 所有 API 数据 |
| 全局 client 状态 | Zustand 7 个 store | useCADEditorStore（当前文件/权限/dirty/协同状态）、fileSystemStore（导航/选中/视图/分页，persist）、fileSystemClipboardStore、fileSystemUndoRedoStore、uiStore（全局 loading）、planSelectStore（套餐升级弹窗）、useBatchDownloadStore（批量下载任务，persist） |
| 子树共享 | React Context | Auth/Theme/Notification/Brand/RuntimeConfig/Tour |
| 组件私有 | useState | — |

**禁止模块级可变变量**。

### 4.6 CAD 编辑器集成（services/mxcadManager/）

- **单例门面**：`mxcadManager.ts` — `MxCADManager` 单例（getInstance），组合 MxCADContainerManager（容器显隐保 WebGL）+ MxCADInstanceManager（实例/打开/重载）
- **命令模式（ADR-0005）**：`cmd/` — CommandRegistry（Map）+ 12 个命令（ExportPDF/DWG/DXF、Save/SaveAs/SaveToCloud、OpenFile、InsertImage、ExportFile、SaveAsMxWeb），`MxFun.addCommand` 桥接引擎
- **协同 SDK**（mxcad 引擎 cooperate API）：`mxcadCollaboration.ts` getCooperate + `hooks/useCollabActions.ts`（createWork L188 / joinWork L306 手动、L431 分享自动加入 / exitWork L363）+ `useCollabWorks.ts`（getWorks 轮询分组）
- **会话总线**：`services/drawingSession/` — sessionBus 类型化事件总线（CAD_EVENTS.OPEN_COMPLETE）
- **9 个编辑专用 hook**（CADEditorDirect 组合）：useHomeInit、useCadFileLoader、useFileOpenGuard、useCadPermissions、useExternalRefCompletion、useCollabShare、useFileInsert、useExternalReferenceUpload、useFileDropToOpen

### 4.7 主题与 i18n

- 主题：`contexts/ThemeContext.tsx`（localStorage `mx-user-dark`）+ `src/styles/theme.css`（927 行 CSS 变量 token，ADR-0032 禁止新增 `--color-*`）+ 与 mxcad Vuetify 主题双向同步（react-theme-changed / mxcad-theme-changed 事件）
- i18n：VoerkaI18n 独立模式，4 语言；`t('文本', { vars })` 禁止 `.replace()` 插值；`translates/messages/default.json`（自动生成勿手编）+ `db-strings.json`（手维护）

---

## 5. 数据层（packages/db）

### 5.1 模型清单（24 个 model，表名 = @@map 值）

| 模型 | 表名 | 用途 | 关键关系 |
|---|---|---|---|
| User | users | 用户 | roleId→Role；membership 1:1；refreshTokens/share/orders/projectMembers/ownedNodes/auditLogs；软删 deletedAt |
| Role | roles | 系统/项目/自定义角色 | parentId 自关联（继承）；isSystem；category |
| RolePermission | role_permissions | 系统角色-权限 | @@unique([roleId, permission])，Cascade |
| FileSystemNode | file_system_nodes | **六种节点统一单表**：FILE/FOLDER/PROJECT/PERSONAL_SPACE/LIBRARY_DRAWING/LIBRARY_BLOCK | parentId 自关联；ownerId→User；projectId 自关联；searchVector tsvector |
| ProjectRole | project_roles | 项目角色 | @@unique([projectId, name]) |
| ProjectRolePermission | project_role_permissions | 项目角色-权限 | @@unique([projectRoleId, permission]) |
| ProjectMember | project_members | 项目成员 | @@unique([projectId, userId])，三外键 |
| Asset | assets | 图库资源 | category/path/thumbnail |
| Font | fonts | CAD 字体 | — |
| RefreshToken | refresh_tokens | 刷新令牌 | token 唯一，userId Cascade |
| AuditLog | audit_logs | 审计日志 | action(33)/resourceType/resourceId/userId/details/ipAddress |
| UploadSession | upload_sessions | 分片上传会话 | uploadId 唯一，status/totalParts/uploadedParts |
| PermissionPolicy | permission_policies | 动态权限策略 | type(PolicyType)/config Json/enabled/priority |
| PolicyPermission | policy_permissions | 策略-权限 | @@unique([policyId, permission]) |
| RuntimeConfig | runtime_configs | 运行时配置 | key 唯一，value/type/category/isPublic |
| RuntimeConfigLog | runtime_config_logs | 配置变更审计 | oldValue/newValue/operator |
| IpBlacklistEntry | ip_blacklist_entries | IP 黑名单 | source(MANUAL/AUTO)/expiresAt |
| FileShare | file_shares | 文件分享 | token 唯一(nanoid16)/usedCount/软删 |
| PaymentOrder | payment_orders | 支付订单 | orderNo 唯一/gateway(wechat_pay)/status |
| UserMembership | user_memberships | 会员 1:1 | tierLevel/expiresAt/metadata |
| BatchDownloadJob | batch_download_jobs | 批量下载 | fileList Json/zipPath/errors Json |
| VipTier | vip_tiers | VIP 等级 | baseMonthlyPrice/configs Json/isActive |
| DurationPricing | duration_pricings | 时长定价 | months 唯一/multiplierBps |
| ConfigKeyRegistry | config_key_registry | 配置键注册表 | key 唯一/defaultValue Json |

### 5.2 枚举（19 个）

`NodeType`、`BlacklistSource`、`UserStatus`、`Permission`（系统权限 25 项）、`ProjectPermission`（20 项）、`ProjectStatus`、`FileStatus`、`AssetStatus`、`FontStatus`、`AuditAction`（35 项）、`ResourceType`、`RoleCategory`、`OrderStatus`、`PolicyType`、`BatchJobStatus`、`AlertLevel`、`AlertStatus`、`TaskRunStatus`、`TaskRunTrigger`

### 5.3 注意事项

- **3 个 schema 未声明的 GIN 索引**（migration 20260729060604 创建，`prisma migrate diff` 会显示 drift，属正常）：searchVector GIN + name/description trgm
- **类型注意**：schema 变更后 Prisma 可能生成 `ModelNameOmit` 类型；枚举不可直接用于 `@ApiProperty`（需本地枚举显式转换）
- **migration 流程**：改 `packages/db/prisma/schema.prisma` → 在 backend 目录 `pnpm prisma migrate dev --name xxx`（**禁止 db push**）→ 提交 migrations/ → 生产 `prisma migrate deploy`；破坏性变更先加字段同步数据再删旧字段
- **类型获取**：数据层类型一律 `import from '@cloudcad/db'`，禁止 `@prisma/client`

---

## 6. API 契约（packages/contracts + api-sdk）

### 6.1 SDK 生成链路（契约先行）

```
后端修改 DTO/Controller
  → pnpm build（nest build/SWC + generate:swagger）或 dev 启动 syncSwaggerAndSdk（非阻塞）
  → scripts/generate-swagger.js → swagger_json.json（operationId = {controller}_{method}）
  → packages/api-sdk scripts/generate-sdk.cjs → openapi-ts（client='@hey-api/client-fetch', baseUrl:false）
  → 生成 src/{client.gen.ts, sdk.gen.ts, types.gen.ts} + client/ + core/
```

手动触发：根目录 `pnpm generate:api-types`。**勿手改 .gen.ts，修后端 DTO**。dev 环境 `scripts/vite-plugin.js` 提供 SDK 变更热刷新。

### 6.2 contracts DI Token（21+ 个，src/tokens.ts）

| 层级 | Token | 接口 |
|---|---|---|
| 基础设施 | DB / EMAIL / CONFIG / SMS / TOKEN_BLACKLIST | IDatabaseService(=PrismaClient) / IEmailVerificationService / IRuntimeConfigService / ISmsVerificationService / ITokenBlacklistService |
| 业务服务 | MEMBERSHIP_SERVICE / AUTH_TOKEN_SERVICE / USER_SERVICE | IMembershipService / IAuthTokenService / IUserService |
| 认证服务 | REGISTRATION_SERVICE / PASSWORD_SERVICE / ACCOUNT_BINDING_SERVICE / WECHAT_CALLBACK_SERVICE / IAUTH_FACADE | 对应接口 |
| 认证扩展点 | AUTH_PROVIDER / AUTHENTICATION_HANDLER / OAUTH_HANDLER / SMS_AUTH_HANDLER / PASSWORD_RESET_HANDLER / ACCOUNT_BINDING_HANDLER / TOKEN_HANDLER | IAuthProvider 聚合 6 handler |
| 扩展钩子 | USER_SYNC_HOOK（@Optional()） | IUserSyncHook（登录前同步） |
| 仓库 | USER_REPOSITORY / REFRESH_TOKEN_REPOSITORY / ROLE_REPOSITORY | 对应 repository 接口 |

### 6.3 三层一致性铁律（Code Review 必查）

```
前端 (packages/frontend) ←→ API SDK (packages/api-sdk) ←→ 后端 (packages/backend) ←→ DB (prisma schema + migration)
```

- 改 DTO → 必须重新生成 SDK（否则前端类型编译失败）
- 改后端/DB 关 issue 前必须确认前端/SDK 是否需联动
- 断言"某 API 没有调用者"前必须搜前端源码 + MSW handler

---

## 7. 辅助服务

### 7.1 config-service（:3002）— 部署运维控制面

- 零依赖 Node http + 原生 JS SPA 管理界面（INITIAL_ADMIN_PASSWORD，30min 会话，5 次锁定）
- 管理：backend/.env（CONFIG_GROUPS 分组，改 DB 自动合成 DATABASE_URL，JWT 密钥重生成、PM2 重启）、brand 资产（frontend/dist/brand/）、runtime 配置（myServerConfig.json 等）、ui 配置（myUiConfig.json）、PM2 服务编排
- **运行时零耦合**：backend/frontend 从不调用它

### 7.2 storage-service（:3200）— 统一文件管理层

- 管理所有 `data/` 目录（files/uploads/exports/conversion），CDN/ESA 唯一回源源
- SVN 目录组分片：StorageRouter 按 `config/storage-routing.json` 路由表（prefix YYYYMM[_N]）解析到节点 basePath
- 三层缓存：L1 浏览器（Cache-Control private 3600）/ L2 Nginx URL-key / L3 服务端 LRU（<10MB）
- 预签 Token：backend 签发自包含 JWT（userId/nodeId/path/exp，共享 BACKEND_JWT_SECRET），客户端直传 `PUT /v1/files/upload`，本地验签
- SVN 代理：SvnAgent spawn(`process.execPath`, [mxcmd.js, ...]) 防注入
- 批量 ZIP 由 backend 的 batch-download 模块负责（本服务只提供读写）

### 7.3 conversion-service（:3100）— 转换引擎托管运行时

- 任务状态权威源在 conversion-service 自身（PENDING→PROCESSING→COMPLETED/FAILED，最终一致性 + reconciler）
- 三种模式：Embedded（backend 进程池，默认）/ Standalone（HttpConversionExecutor → :3100）/ Cloud FaaS（deploy/faas/*.sh）
- worker-pool 三级信号量池（upload/export/thumbnail），按积压自动扩容
- 转换：exec(`mxcadassembly.exe "{json}"`)，JSON 单参契约
- 与 backend 集成：转换输出写回 `filesDataPath/YYYYMM/nodeId/src_file_md5/`，workflow 不可达时熔断 60s 回退进程内转换

### 7.4 impl-mx — 私有 MX 实现包

- 只含不能开源的逻辑（旧官网代理认证、用户/VIP 同步），通用认证在 backend `src/auth/impl/`（OSS）
- 加载：`IMPL=true/1` → `packages/impl-mx/dist`；`IMPL=/path` → 绝对路径；`createAuthProviders()` 后注册覆盖同 token
- 实际只注册 `USER_SYNC_HOOK` 一个扩展点（OldSiteUserSyncHook：checkuser/login/personal 代理验证 + 创建/更新本地用户 + 增量同步 VIP）——历史教训：早期覆盖 AUTHENTICATION_HANDLER 复刻整套登录是坏味道，已重构（ADR-0018/0021）

### 7.5 mxVersionTool — SVN CLI 包装器

- mxcmd.js 导出 16 命令 + checkMxAvailable + getPlatformInfo
- 密码经 `--password-from-env` + SVN_PASSWORD 环境变量传入，不存凭据
- 消费方：backend version-control、storage-service svn-agent、mxcad/infra/linux-init

### 7.6 frontend_mobile（Vue 3 H5）

- 单页 Home + 9 个弹窗组件；业务逻辑在 services/（save/upload/mobileUpload/extRef/export/thumbnail/check/permission/publicFile）+ composables/（15 个）
- **强制走 @cloudcad/api-sdk**（同 PC 端规则）；token 存 localStorage，支持 PC 登录后跳回
- 无计费/支付功能；协同经 useCooperate 封装（createWrok 自动加入、joinWork 自动加载、exitWork 回退）

---

## 8. 关键业务流程走查

### 8.1 登录（账号密码）

```
前端 Login 页 → authControllerLogin({account,password})（@/api-sdk）
  → clientSetup 注入 Bearer → backend:3001/api/v1/auth/login
  → [Guard 链] → AuthController.login → AuthFacadeService → LoginService
  → DB 查用户 → bcrypt → 签发双 token + session → httpOnly cookie
  → 前端 localStorage 存 accessToken（tokenUtils）+ AuthContext 更新用户
```

### 8.2 打开图纸（核心链路）

```
用户点击文件 → /cad-editor/:fileId（CADEditorDirect 驻留层）
  → useFileRouteParser 解析参数 → useCadFileLoader
  → mxcadManager.openFile（MxCADInstanceManager）
  → 后端 GET filesData/*path（mxcad-file-access.controller，@Res() 直出流，跳过 ResponseInterceptor）
  → MxCAD 引擎加载渲染
```

### 8.3 保存与 SVN 提交

```
前端 Ctrl+S / 保存命令（cmd/SaveToCloud）
  → MxcadSaveService.save（MXCAD_SAVE_SERVICE）
  → 文件写入 filesDataPath/YYYYMM/nodeId/ → per-save backup（ADR-0011）
  → VERSION_CONTROL_TOKEN.commitNodeDirectory（SVN 提交，JSON commit message）
  → 版本历史更新（version-control GET history）
```

### 8.4 上传与转换

```
前端上传（useUploadManager 队列 / 分片 ChunkUploadManagerService）
  → 后端 mxcad-upload（Multer diskStorage 按 hash 分目录，chunkisExist 断点续传）
  → 合并分片 → DrawingIngestService（hash 去重、SVN add）
  → FileConversionService → IFunctionExecutor（默认 process-pool）→ mxcadassembly 转换
  → 转换产物写回节点目录 + 缩略图（MxWebDwg2Jpg.exe）→ 状态流转 COMPLETED
  → 前端 conversion/useConversionPolling 轮询 /status
```

### 8.5 批量下载

```
前端勾选 → 创建 BatchDownloadJob（DB）
  → BatchDownloadOrchestrator 展开文件夹（FolderExpanderService）→ ConversionRunner
  → workflow 批量转换（batchConvert 聚合 + 轮询，熔断回退进程内）→ ArchiveWriter ZIP
  → SSE 进度（SseManager）→ 完成后前端轮询任务列表（useBatchDownloadStore）
```

### 8.6 分享

```
分享创建（ShareService）→ FileShare 记录（nanoid token）
  → 前端复制链接 → 未登录用户打开 → 免登录/匿名加载（useFileRouteParser shareToken）
  → GET filesData/*path?token=... 授权校验（mxcad-file-access）
```

### 8.7 外部参照（ExtRef）

```
打开图纸 → external-ref.controller preloading/:nodeId（ExtRefPreloadingService 预加载清单）
  → 校验引用（check-reference）→ 上传更新（up_ext_reference_dwg/image/:nodeId）
  → refresh-external-references 刷新
  → 路径约定 filesDataPath/YYYYMM/nodeId/src_file_md5/（ADR-0024 引擎耦合约束）
```

---

## 9. Code Review 指南

### 9.1 三层一致性检查清单（每个变更必过）

- [ ] 改后端 DTO/Controller 后，`pnpm generate:api-types` 重新生成 SDK？前端类型是否编译通过？
- [ ] 前端是否有组件/hook/页面消费该 API？调用的 DTO/response 字段是否匹配？
- [ ] 后端 Controller DTO / Service 逻辑 / Guard / Interceptor 是否对齐？
- [ ] Prisma schema 是否变更？是否生成 migration（非 db push）？存量数据是否需要迁移脚本？
- [ ] MSW handler 是否同步？（前端 dev 依赖 mock）

### 9.2 反模式速查（遇到即打回）

| ❌ 反模式 | ✅ 正确 |
|---|---|
| 前端裸 `fetch()` 调后端 | 走 `@/api-sdk` 生成函数 |
| 前端传原生 FormData | body 传普通对象（formDataBodySerializer 序列化） |
| Controller 手包 `{message, data}` | 直接 return（ResponseInterceptor 统一包装） |
| `import type { XService }`（NestJS） | `import { XService }`（装饰器元数据） |
| schema 改完只 db push | 生成 migration 并提交 |
| Prisma 枚举直接 @ApiProperty | 本地枚举 + 显式转换 |
| `import from '@prisma/client'` | `@cloudcad/db` |
| 模块级可变变量（前端） | Zustand store |
| 自己写 Modal/Table | 复用 `src/components/ui/` |
| Controller 写业务逻辑 | 逻辑放 Service |
| console.log | NestJS Logger |
| t('...').replace() 插值 | t('...', {vars}) |

### 9.3 文件定位速查

| 想找什么 | 去哪个文件 |
|---|---|
| 后端路由入口 | `packages/backend/src/main.ts` + `app.module.ts` |
| 全局 Guard/Pipe/Interceptor | `packages/backend/src/app.module.ts:144-178` |
| 认证 | `packages/backend/src/auth/`（auth.controller / strategies / jwt.strategy.executor / dto） |
| 权限守卫 | `packages/backend/src/common/guards/permissions.guard.ts` + `require-project-permission.guard.ts` |
| 文件系统 | `packages/backend/src/file-system/`（8 子模块）+ `file-operations/` |
| CAD 模块 | `packages/backend/src/mxcad/`（infra/node/conversion/save/upload/external-ref/core） |
| SVN 版本控制 | `packages/backend/src/version-control/` + `packages/mxVersionTool/mxcmd.js` |
| 存储抽象 | `packages/backend/src/storage/` + `storage-management/`（SVN 归 `version-control/`，见 3.8） |
| 数据库 schema | `packages/db/prisma/schema.prisma`；migration 在 `packages/backend/prisma/migrations/` |
| 数据库客户端 | `packages/backend/src/database/database.service.ts` |
| DI token 契约 | `packages/contracts/src/tokens.ts` |
| SDK 生成 | 根目录 `swagger_json.json` + `packages/api-sdk/` |
| 前端入口/路由 | `packages/frontend/src/index.tsx` + `App.tsx` |
| 前端 HTTP client | `packages/frontend/src/config/clientSetup.ts` + `tokenRefresh.ts` |
| CAD 单例 | `packages/frontend/src/services/mxcadManager/` |
| 前端状态 | `packages/frontend/src/stores/` + `lib/queryKeys.ts` |
| 协同 | `packages/frontend/src/hooks/useCollabActions.ts` + `useCollabWorks.ts` |

### 9.4 验证命令

```bash
pnpm check                    # lint + format + type-check（全仓库）
pnpm generate:api-types       # 重新生成 SDK
pnpm depcruise                # 前端分层门禁（frontend 目录）
cd packages/backend && pnpm test:unit   # 后端单元测试
cd packages/backend && pnpm verify      # check:fix → test → build
```

---

## 10. 本次 Code Review 发现的问题

> 严重问题已提交 GitHub issue（见下），轻微问题列于此供后续治理。

### 已提交 issue

1. **[auth] logout 未清除 refresh_token cookie** — `auth.controller.ts:202-205` 只 clear sessionName + auth_token；而 `setRefreshCookie`（line 933-938）用 `path: '/api/v1/auth/refresh'` 写入。登出后 refresh_token cookie 残留 7 天，虽服务端记录已删不会造成越权，但属于明确缺陷（登出不干净、多账号切换时 cookie 干扰）。
2. **[backend] 双重全局 ValidationPipe** — `main.ts:237-243`（forbidNonWhitelisted: false）+ `app.module.ts:159-161` APP_PIPE CustomValidationPipe（forbidNonWhitelisted: true, enableImplicitConversion: true）叠加，每个请求体被验证/转换两次，@Transform 回调双执行，且 forbid 行为不一致。应二选一。
3. **[tooling] api-sdk 生成频繁失败（Windows ENOTEMPTY）** — `packages/api-sdk/` 下 31 个 `openapi-ts-error-*.log`，均为 `ENOTEMPTY: directory not empty, rmdir src/client`。dev 模式 swagger-sync 失败仅打日志不阻断 → SDK 可能陈旧而无人察觉。生成脚本应先清理输出目录（或对 rimraf 失败重试）。
4. ~~**[security] 协同代理 JWT 校验不完整**~~ — **已修复（#221，9f285c0e）**：新增 `cooperate/cooperate-auth.service.ts`，校验与 `JwtStrategy.validate` 对齐——仅接受 `type==='access'` 的 token、查 token 黑名单、查用户黑名单、校验用户状态（禁用/删除拒绝）。另 `9be4b18a`（#300）在协同代理挂载 `fixRequestBody`，解决 body-parser 消费后 POST body 丢失导致 createWork/joinWork 挂起。
5. **[permission] 策略配置变更后缓存不清除** — `policy-engine/services/policy-config.service.ts:448-452` `clearCache()` 空实现，写操作后旧配置/评估结果残留最长 10 分钟（cacheTTL.policy 默认 600s），禁用/收紧策略无法即时生效，存在安全窗口。
6. **[audit] 审计归档未实现** — `common/schedulers/audit-cleanup.scheduler.ts:66-86` `archiveOldLogs()` 仅 TODO，`AUDIT_ARCHIVE_ENABLED=true` 时日志仍被直接删除，无归档产物。

### 轻量问题（暂不提交）

| 问题 | 位置 | 说明 |
|---|---|---|
| JwtStrategyExecutor 每请求打 info 日志 | `auth/jwt.strategy.executor.ts:46-48` | dev 日志噪音大；生产 pino level=warn 可过滤 |
| 审计归档未实现 | ~~`common/schedulers/audit-cleanup.scheduler.ts:72`~~ | **已升级 issue #223** |
| 权限缓存全量清除 TODO | `file-system/file-permission/file-system-permission.service.ts:400` | clearUserCache 无 projectId 时无法清全项目缓存（调用方均传 projectId，风险低） |
| 策略配置缓存清除 TODO | ~~`policy-engine/services/policy-config.service.ts:449`~~ | **已升级 issue #222** |
| 端口文档过时 | storage-service README 3004（实际 3200）、conversion-service README 3003（实际 3100） | 文档与代码不一致 |
| CSP 含 unsafe-inline + unsafe-eval | `main.ts:291-293` | mxcad WASM 需求，XSS 防护弱化，安全团队评估 |
| 项目权限缓存 TTL 5-10 分钟 | `roles/project-permission.service.ts` | 成员变更已主动清缓存，TTL 仅兜底，可接受 |
| CSRF Guard 覆盖面 | `auth/guards/csrf.guard.ts` | 仅 @CsrfProtected() 端点生效，需确认变更端点是否全部标记 |

---

## 11. 常用命令速查

```bash
# 根目录
pnpm dev                      # 并行启动所有 dev server
pnpm build                    # 构建所有包
pnpm check                    # lint → format:check → type-check
pnpm generate:api-types       # 为 @cloudcad/api-sdk 生成 API SDK

# 后端（packages/backend）
pnpm dev                      # 启动 dev（dev 启动时自动刷新 swagger + SDK）
pnpm test:unit / test:integration / test:permission
pnpm prisma migrate dev --name <描述>   # 创建 migration（禁止 db push）
pnpm db:seed                  # 种子数据
pnpm verify                   # check:fix → test → build

# 前端（packages/frontend）
pnpm dev / test / type-check / depcruise / i18n:extract / i18n:compile

# 数据/部署工具
scripts/pack-linux-deploy.js  # Linux 部署包
scripts/pack-offline.js       # 离线包
deploy/helm/cloudcad/         # Helm Chart（mode: embedded|standalone）
```

---

*本文档由代码库系统性梳理生成（2026-08-10）。如果代码发生重大重构（ADR 变化、模块迁移），请同步更新本文档。*
