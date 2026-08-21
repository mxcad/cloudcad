# API Server

服务端业务逻辑层，提供认证、文件系统、权限、计费、协同协调、存储抽象等 API 能力。

## Language

**FileSystemNode**:
File system 中所有实体的统一节点模型。通过 NodeType 区分 FILE、FOLDER、PROJECT、PERSONAL_SPACE、LIBRARY_DRAWING、LIBRARY_BLOCK。
_Avoid_: File, Folder（当需要区分时）

**PermissionPolicy**:
对基础 RBAC 权限叠加额外约束的规则（基于时间、IP、设备）。
_Avoid_: 策略规则、约束

**AuditAction**:
记录在 AuditLog 中的原子操作标识，覆盖权限变更、角色变更、文件操作、系统配置修改等。
_Avoid_: 操作类型、事件名

**Membership / UserMembership**:
用户的订阅层级记录（Prisma: `UserMembership`）。`tierLevel` 整数（0=VIP0, 1=VIP1, 2=VIP2, 3=VIP3...），含 `expiresAt` 过期时间。VIP0 永不过期，高级别过期后降级为 VIP0。通过 `VipTier` + `DurationPricing` 定义定价方案，通过 `PaymentOrder` 管理支付生命周期。
_Avoid_: 套餐、会员等级

**MembershipPlan（已废弃）**:
旧版定价方案模型。已被 `VipTier` + `DurationPricing` 正交模型取代，Prisma schema 中此表将删除。
_Avoid_: 套餐方案

**PaymentOrder**:
支付订单。记录 userId、vipTierId（FK）、months、amount、status（OrderStatus 枚举：PENDING/SUCCESS/FAILED/REFUNDING/REFUNDED）、gatewayOrderId。支付成功后触发 `MembershipService.activate()` 创建或续期 UserMembership。退款后重新计算会员层级。
_Avoid_: 订单、交易记录

**ChunkUpload**:
大文件自实现分片上传协议。切分后逐片上传，全部到达后触发合并。替代了已移除的 Tus 协议。
_Avoid_: 分块上传、Tus

**StorageProvider**:
存储后端抽象接口，支持 LocalStorageProvider（本地文件系统）和 FlydriveStorageProvider（S3 兼容对象存储）。
_Avoid_: 磁盘、存储后端

**AuthProvider**:
认证能力提供者接口体系。由 6 个子接口组成：
- `IAuthenticationHandler` — 密码登录/注册/Token 刷新
- `IOAuthHandler` — OAuth 认证（获取 URL、回调处理、绑定解绑）
- `ISmsAuthHandler` — 短信认证（发送/验证验证码、短信登录/注册）
- `IPasswordResetHandler` — 密码重置（忘记/重置密码）
- `IAccountBindingHandler` — 账号绑定（邮箱/手机号绑定解绑换绑）
- `ITokenHandler` — Token 管理（生成、刷新、吊销、登出）
Provider 通过 DI 注册，Controller 和 Facade 只依赖接口。
_Avoid_: 认证插件、认证适配器

**OssAuthProvider**:
开源的认证参考实现。覆盖全部 6 个子接口，包含密码登录注册、微信登录、短信验证、邮箱绑定等功能。由 `LocalAuthProvider` 更名而来。可被 `ProAuthProvider` 或 TOB 自定义 provider 完整替换。
_Avoid_: LocalAuthProvider（旧称）

**mxVersionTool**:
SVN CLi 包装器（`packages/mxVersionTool`），通过子进程调用 mx.exe/svn 进行文件版本控制。不是独立 bounded context，而是 API Server 的基础设施适配器。
_Avoid_: Version Control context、SVN 服务

**VIP Tier（VIP 等级）**:
用户的订阅等级标识，为线性等级体系（VIP0 → VIP1 → VIP2 → VIP3...），高级别拥有低级别的全部权限。每级存完整的扁平配置快照。VIP0 为默认兜底等级，永久有效；高级别有过期时间，过期后降级为 VIP0。
_Avoid_: 会员等级、套餐等级

**TierConfig（等级配置）**:
VIP 等级绑定的键值对权限/限制集合。通用 Key-Value 结构，后端维护 `ConfigKeyRegistry` 映射（key → 显示名/类型/多语言），前端通过 API 获取 registry 渲染配置界面。典型 Key：`quota.personal_storage_mb`、`quota.conversion_window_count`、`quota.conversion_window_hours`、`quota.project_size_mb`、`quota.max_projects`。
_Avoid_: 固定字段配置

**ConfigKeyRegistry**:
后端维护的配置项元数据注册表，定义每个配置 Key 的类型、默认值、显示名（支持多语言）。前端和管理后台通过 API 获取 registry 动态渲染配置表单，新增配置项无需修改前端代码。
_Avoid_: 前端硬编码配置映射

**TierPricing（等级定价）**:
VIP 等级的月基础定价。产品价格由「等级月基础价 × 时长倍率 × 月数」正交计算。时长倍率按月数线性递减（1月1.0 → 12月0.7），支持 1~12 月任意整数月购买，与等级定义解耦。
_Avoid_: 套餐定价、方案定价

**RestrictionEngine（限制引擎）**:
策略管道引擎，通过 DI multi-provider 收集所有 `RestrictionStrategy`。`evaluate(ctx: RestrictionContext): Promise<void>` — fail-fast，任一策略拒绝即抛 `InsufficientQuotaException`。引擎统一查一次用户 tierConfig 传给所有策略，策略纯计算无状态。
_Avoid_: 配额引擎、检查引擎

**RestrictionContext（限制上下文）**:
传递给策略的上下文对象，包含 `userId`、`projectId?`、`incrementBytes?`、`tierLevel`、`tierConfig`（引擎统一查一次）、`metadata?`。`type`（`upload | save | convert | create_project`）由各策略自行推断。
_Avoid_: 请求上下文、检查参数

**RestrictionResult（限制结果）**:
策略检查结果对象：`{ allowed: boolean; key?: string; message?: string }`。`allowed=false` 时引擎抛 `InsufficientQuotaException`，`key` 标识触发的配额项。
_Avoid_: 检查结果、错误信息

**RestrictionStrategy（限制策略）**:
实现 `check(tierConfig, context)` 接口的独立策略类。通过 NestJS DI `multi: true` 注册：
- `ProjectSizeStrategy` — `quota.project_size_mb`
- `PersonalStorageStrategy` — `quota.personal_storage_mb`
- `ConversionFrequencyStrategy` — `quota.conversion_window_count` / `quota.conversion_window_hours`（窗口频率限制，见 ADR-0043）
新增限制类型只需新增策略类 + 注册到模块。
_Avoid_: 检查器、限制器

**OldSiteApiClient（旧官网客户端）**:
HTTP 客户端封装，调用旧官网三个端点：`POST /app/checkuser`（检查手机号是否注册）、`POST /app/login`（密码验证）、`POST /app/personal`（获取用户信息+VIP）。form-urlencoded 格式，超时 10s。仅 `@cloudcad/impl-mx` 中可用。
_Avoid_: 旧官网 HTTP 服务

**OldSiteUserSyncService（旧官网用户同步服务）**:
处理从旧官网同步用户信息和 VIP 权益的核心逻辑。由 `OldSiteUserSyncHook` 调用，作为 `USER_SYNC_HOOK` 登录同步扩展点——先代理认证，再创建/更新本地用户，最后增量同步 VIP。处理冲突策略（手机号已存在时不覆盖密码）。不接管认证主流程（密码校验、token 生成由 OSS `LoginService` 完成）。
_Avoid_: 用户同步、账号合并

**IMPL 环境变量**:
指向私有覆盖层包的路径。取值：`true`/`1` 走默认路径 `packages/impl-mx/dist`，其他值为任意绝对/相对路径。OSS 认证始终由 `createDefaultAuthProviders()` 注册（开箱可用，不返回 503）；`IMPL` 存在时 backend `AuthModule.forRoot()` 把 impl-mx 覆盖层**叠加**到 providers 尾部（NestJS 同 token 后注册者胜出）。私有层通过注册**可选扩展点 token**（如 `USER_SYNC_HOOK`）插入 OSS 流程，`AUTHENTICATION_HANDLER` 等核心认证 token 不再被覆盖。已从原 `AUTH_IMPL` 更名。
_Avoid_: AUTH_IMPL（旧称）

**IFunctionExecutor（函数执行器）**:
转换引擎抽象接口：`invoke(task)` + `getTaskStatus(taskId)`。三种实现：`ProcessPoolExecutor`（embedded 子进程池）、`HttpConversionExecutor`（standalone HTTP）、`CloudFaaSExecutor`（云函数 HTTP）。
_Avoid_: 转换执行器

**IStorageProvider（存储提供者）**:
纯存储抽象接口：`read/write/delete/exists/copy/move/listAll/deleteAll/getMetaData/getUrl/copyFromFs`（无 SVN 能力，#273）。两种实现：`FlydriveStorageProvider`（embedded 本地文件）、`HttpStorageProvider`（standalone HTTP）。SVN 操作由 **IVersionControl**（`VERSION_CONTROL_TOKEN`，`version-control/` 模块）承担：`MxVersionControlProvider`（embedded）/ `HttpVersionControlProvider`（standalone，代理 storage-service 3200）。
_Avoid_: 文件存储

**上传预签名 Token**:
JWT Token 鉴权上传。Backend 签发（含 userId/nodeId/path）→ 客户端 PUT 到 Storage Service → Storage Service 本地校验。共享 secret 通过 `STORAGE_INTERNAL_SECRET` 配置。
_Avoid_: 上传凭证

**三级优先队列**:
Level 1（上传转换）> Level 2（导出/PDF）> Level 3（缩略图/批量）。各级独立信号量池，默认并发分别 `min(CPU,4)`/`min(CPU,2)`/`min(CPU,2)`。由 `FUNCTION_EXECUTOR` 环境变量控制模式。
_Avoid_: 转换队列

**URL 缓存失效**:
`?t=updatedAt&v=version` — 文件更新时 URL 变化，浏览器/CDN 自动回源。无显式 PURGE。L1 浏览器缓存 1h，L2 Nginx/CDN URL-key，L3 Storage Service 内存 LRU（<10MB）。
_Avoid_: PURGE 操作

**额度守卫（Quota Enforcement）**:
已由 `RestrictionEngine` + `RestrictionStrategy` 策略管道取代。覆盖上传、粘贴、移动、复制、另存为等增加项目体积的行为。检查规则：`项目当前总大小 + 增量 ≤ 用户的 quota.project_size_mb`。个人空间单独使用 `quota.personal_storage_mb`。转换操作按「转换频率限制（Conversion Frequency Limit，ADR-0043）」窗口计数（登录用户 `quota.conversion_window_count` / 游客运行时配置，均每 N 小时窗口）。不足时返回 `InsufficientQuotaException`。
_Avoid_: 被动检查、事后拒绝
