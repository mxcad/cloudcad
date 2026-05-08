
# API 端点安全审查报告

**审查日期**: 2026-05-08  
**审查范围**: `packages/backend/src` 下所有 Controller（21 个）  
**审查人员**: API 端点安全审查专家（AI）

---

## 1. 端点暴露面

### 1.1 @Public 装饰器使用的端点一览

通过搜索 `@Public` 装饰器，共发现 **38 个**公开端点，分布在以下控制器中：

#### auth.controller.ts (18 个公开端点)

| 行号 | 路由 | HTTP方法 | 说明 |
|------|------|----------|------|
| 91 | `POST /api/auth/register` | POST | 用户注册 |
| 111 | `POST /api/auth/login` | POST | 用户登录 |
| 139 | `POST /api/auth/refresh` | POST | 刷新 Token |
| 185 | `POST /api/auth/send-verification` | POST | 发送邮箱验证码 |
| 202 | `POST /api/auth/verify-email` | POST | 验证邮箱 |
| 228 | `POST /api/auth/verify-email-and-register-phone` | POST | 验证邮箱并完成手机号注册 |
| 271 | `POST /api/auth/resend-verification` | POST | 重发验证码 |
| 288 | `POST /api/auth/bind-email-and-login` | POST | 绑定邮箱并登录 |
| 313 | `POST /api/auth/bind-phone-and-login` | POST | 绑定手机号并登录 |
| 338 | `POST /api/auth/verify-phone` | POST | 验证手机号 |
| 358 | `POST /api/auth/forgot-password` | POST | 忘记密码 |
| 375 | `POST /api/auth/reset-password` | POST | 重置密码 |
| 503 | `POST /api/auth/send-sms-code` | POST | 发送短信验证码 |
| 533 | `POST /api/auth/verify-sms-code` | POST | 验证短信验证码 |
| 551 | `POST /api/auth/register-phone` | POST | 手机号注册 |
| 574 | `POST /api/auth/login-phone` | POST | 手机号验证码登录 |
| 678 | `POST /api/auth/check-field` | POST | 检查字段唯一性（用户名/邮箱/手机号）|
| 705 | `GET /api/auth/wechat/login` | GET | 获取微信授权 URL |
| 735 | `GET /api/auth/wechat/callback` | GET | 微信授权回调 |

**分析**: 所有公开的 auth 端点均为必要的认证/注册流程端点，属合理公开。

#### library.controller.ts (10 个公开端点)

| 行号 | 路由 | 说明 |
|------|------|------|
| 104 | `GET /api/library/drawing` | 获取图纸库详情 |
| 119 | `GET /api/library/drawing/children/:nodeId` | 获取图纸库子节点 |
| 142 | `GET /api/library/drawing/all-files/:nodeId` | 递归获取图纸库所有文件 |
| 171 | `GET /api/library/drawing/filesData/*path` | 图纸库文件访问 |
| 190 | `GET /api/library/drawing/nodes/:nodeId` | 图纸库节点详情 |
| 228 | `GET /api/library/drawing/nodes/:nodeId/thumbnail` | 图纸库缩略图 |
| 359 | `GET /api/library/block` | 获取图块库详情 |
| 374 | `GET /api/library/block/children/:nodeId` | 获取图块库子节点 |
| 397 | `GET /api/library/block/all-files/:nodeId` | 递归获取图块库所有文件 |
| 426 | `GET /api/library/block/filesData/*path` | 图块库文件访问 |
| 460 | `GET /api/library/block/nodes/:nodeId` | 图块库节点详情 |
| 498 | `GET /api/library/block/nodes/:nodeId/thumbnail` | 图块库缩略图 |

**分析**: 资源库读操作公开访问属设计意图；写操作有权限保护（需要 `LIBRARY_DRAWING_MANAGE` / `LIBRARY_BLOCK_MANAGE`）。

#### 其他公开端点

| 文件:行号 | 路由 | 说明 |
|-----------|------|------|
| app.controller.ts:22 | `GET /api/` | 根路由欢迎页 |
| health.controller.ts:42 | `GET /api/health/live` | Docker 存活检查 |
| health.controller.ts:83 | `GET /api/health` | 服务健康检查（公开）|
| session.controller.ts:30 | 整个类 `@Public()` | **高风险：Session 控制器完全公开** |
| public-file.controller.ts:57 | `GET /api/public-file/access/:hash/:filename` | 公开文件访问 |
| public-file.controller.ts:116 | `POST /api/public-file/ext-reference/upload` | **公开上传接口（无需认证）** |
| public-file.controller.ts:166 | `GET /api/public-file/ext-reference/check` | 检查外部参照文件 |
| public-file.controller.ts:213 | `GET /api/public-file/preloading/:hash` | 预加载数据 |
| runtime-config.controller.ts:53 | `GET /api/runtime-config/public` | 公开运行时配置 |

---

### 1.2 发现的问题

#### 问题 1.1: session.controller.ts 整个类完全公开 — 无任何认证保护

- **文件**: `packages/backend/src/auth/session.controller.ts:30`
- **严重程度**: 🔴 **严重**
- **问题描述**: `SessionController` 整个类使用了 `@Public()` 装饰器，包含 3 个端点：
  - `POST /api/session/create` — 创建 Session，仅需传入任意用户信息即可创建会话
  - `GET /api/session/user` — 获取当前 Session 用户信息
  - `POST /api/session/destroy` — 销毁 Session
- **风险**: 攻击者可以通过 `POST /api/session/create` 传入构造的 `body.user` 对象（id, email, username, role），直接创建一个有效的服务端 Session，从而绕过正常登录流程。这个端点没有做任何认证校验，完全信任客户端传入的数据。
- **修复建议**: 
  1. `POST /api/session/create` 不应为公开端点，应要求 JWT 认证
  2. 或者至少验证 `body.user` 信息的真实性（通过数据库查询或 token 验证）
  3. `GET /api/session/user` 在无有效 session 时已返回 `{success: false}`，但如果攻击者先调用 create 创建了 session，则能通过此端点获取伪造的用户信息
- **需要用户确认**: ✅ 是 — 需要确认 session/create 是否仅用于开发/测试环境，生产环境是否已通过其他方式保护

#### 问题 1.2: public-file/ext-reference/upload 公开上传接口

- **文件**: `packages/backend/src/public-file/public-file.controller.ts:116`
- **严重程度**: 🟡 **中等**
- **问题描述**: `POST /api/public-file/ext-reference/upload` 是公开的（`@Public()`），无需认证即可上传外部参照文件。使用 `memoryStorage()` 将文件存在内存中，没有任何大小限制（Multer级别）。
- **风险**: 
  - 攻击者可滥用此端点上传大量文件消耗服务器内存（memoryStorage）
  - 虽然没有直接文件系统写入风险（存内存），但缺少文件大小限制可能导致 DoS
  - 缺少恶意文件检测（如 polyglot 文件）
- **修复建议**: 
  1. 添加 Multer 文件大小限制（`limits: { fileSize: 10 * 1024 * 1024 }`）
  2. 考虑添加请求签名或临时 token 验证（如基于 hash 的签名）
  3. 添加文件内容魔数校验确保上传的是合法 CAD 文件
- **需要用户确认**: ✅ 是 — 确认该接口是否需要保持公开，以及外部参照上传的业务场景

#### 问题 1.3: check-field 端点可用于用户枚举

- **文件**: `packages/backend/src/auth/auth.controller.ts:678`
- **严重程度**: 🟡 **中等**
- **问题描述**: `POST /api/auth/check-field` 公开端点返回各字段（username、email、phone）是否存在，可被攻击者用于批量枚举已注册用户。
- **风险**: 用户枚举攻击，攻击者可通过此接口批量探测有效的用户名/邮箱/手机号，为进一步的凭证填充攻击或钓鱼攻击提供目标列表。
- **修复建议**: 
  1. 对此端点添加严格的速率限制（当前 RateLimitGuard 对公开接口每分钟 6000 次仍过于宽松）
  2. 考虑仅在实际注册/登录流程中检查（需要先完成验证码验证），而非单独暴露
- **需要用户确认**: 否 — 标准的速率限制即可缓解

---

## 2. 速率限制

### 2.1 现状分析

系统有一层全局 `RateLimitGuard`（`common/guards/rate-limit.guard.ts`）：

| 接口类型 | 时间窗口 | 最大请求数 |
|----------|----------|-----------|
| 公开接口 (`@Public`) | 60秒 | 6000 |
| 认证接口 | 60秒 | 1500 |

使用**内存存储**（`Map<string, RateLimitRecord>`），每 5 分钟清理一次过期记录。

#### 发现的问题

#### 问题 2.1: RateLimitGuard 使用内存存储，多实例部署时失效

- **文件**: `packages/backend/src/common/guards/rate-limit.guard.ts:47`
- **严重程度**: 🟡 **中等**
- **问题描述**: `RateLimitGuard` 使用 `Map` 存储在 Node.js 进程内存中。如果后端水平扩展运行多个实例，每个实例有独立的限流计数器，攻击者可通过轮询不同实例绕过限流。
- **修复建议**: 将限流计数器迁移到 Redis，使用滑动窗口算法（Redis sorted set 或 Lua 脚本实现）。
- **需要用户确认**: ✅ 是 — 需确认是否为单实例部署，是否有水平扩展计划

#### 问题 2.2: 公开接口速率限制过于宽松

- **文件**: `packages/backend/src/common/guards/rate-limit.guard.ts:51-53`
- **严重程度**: 🟡 **中等**
- **问题描述**: 公开接口的限流为每分钟 6000 次（即每秒 100 次），对于登录/注册/验证码等敏感端点来说过于宽松。注释中写的是"最多3000次"但实际代码是 6000。
- **风险**: 
  - 暴力破解登录：6000次/分钟足够进行字典攻击
  - 短信/邮箱轰炸：`send-sms-code` 和 `send-verification` 端点在应用层有独立的 Redis 限流（60秒1次），但全局限流过于宽松
  - 用户枚举：`check-field` 端点可被高速扫描
- **修复建议**: 
  1. 代码注释与实现不一致（注释说 3000，实际是 6000），需要修正
  2. 对登录/注册/密码重置端点设置更严格的限流（例如 10次/分钟）
  3. 使用 `@Throttle` 装饰器对特定端点进行细粒度控制
- **需要用户确认**: 否 — 修复注释与代码的一致性，配置化限流参数

#### 问题 2.3: 仅有内存限流，无 Redis 分布式限流

- **文件**: `packages/backend/src/auth/services/email-verification.service.ts:62-74`、`sms-verification.service.ts:216-255`
- **严重程度**: ℹ️ **信息**
- **问题描述**: 邮箱/短信验证码在应用层有独立的 Redis 限流（每 60 秒一次），这是好的实践。但全局 `RateLimitGuard` 仍只使用内存，验证码端点的全局限流是内存级别的 6000次/分钟。
- **正面评价**: 验证码发送已有双重保护（应用层 Redis 限流 + 全局内存限流），设计合理。

#### 问题 2.4: runtime-config 端点有独立限流，其他公开端点缺少

- **文件**: `packages/backend/src/runtime-config/runtime-config.controller.ts:55`
- **严重程度**: ℹ️ **信息**
- **问题描述**: `GET /api/runtime-config/public` 使用了 `@Throttle({ default: { limit: 60, ttl: 60000 } })` 独立限流（每分钟 60 次）。但 `@nestjs/throttler` 的限流也是内存级别的，同样存在多实例问题。其他多数公开端点未设置专门的 `@Throttle` 限流。

---

## 3. 敏感操作审计

### 3.1 现状分析

系统有独立的审计日志模块：
- `audit-log.controller.ts` — 审计日志查询 API（需要 `SYSTEM_ADMIN` 权限）
- `audit-log.service.ts` — 审计日志写入服务
- `project-member.service.ts` — 成员管理操作已记录审计日志

审计日志记录的操作包括（从 `audit.enum.ts`）：
- `FILE_UPLOAD`、`FILE_DOWNLOAD`、`FILE_DELETE` 等文件操作
- 成员添加/移除/角色变更
- 项目创建/删除

#### 发现的问题

#### 问题 3.1: 多处敏感写操作未发现审计日志记录

- **文件**: 涉及多个文件
- **严重程度**: 🟡 **中等**
- **问题描述**: 以下敏感操作在 controller 层面未见审计日志记录：
  
  | 操作 | 文件:行号 | 风险 |
  |------|-----------|------|
  | 删除角色 | roles.controller.ts:150 | 角色变更无审计 |
  | 角色权限分配/移除 | roles.controller.ts:93,108 | 权限变更无审计 |
  | 更新运行时配置 | runtime-config.controller.ts:134 | 配置变更虽传了 userId 和 ip，但未见写入审计日志 |
  | 强制删除用户 | users.controller.ts:288 | 用户立即删除无审计 |
  | 字体上传/删除 | fonts.controller.ts:96,139 | 字体管理操作无审计 |
  | SVN 历史版本访问 | version-control.controller.ts:72 | 虽为读操作，但历史版本查看应记录 |
  | 缓存清理 | cache-monitor.controller.ts:202,210,222,239 | 清空全部缓存是危险操作，但无审计 |
  
- **修复建议**: 
  1. 对所有状态变更操作（角色/权限/配置/用户删除）统一写入审计日志
  2. 对危险管理操作（缓存清空、字体管理）添加审计记录
  3. 缓存清空操作添加二次确认机制
- **需要用户确认**: ✅ 是 — 需要确认哪些操作必须纳入审计范围

#### 问题 3.2: 删除操作缺少二次确认机制

- **文件**: 多个文件（library.controller.ts:288, 558; file-system.controller.ts:350; users.controller.ts:268）
- **严重程度**: 🟡 **中等**
- **问题描述**: 
  - 资源库节点删除（`DELETE /api/library/drawing/nodes/:nodeId`）默认为永久删除（`permanently ?? true`）
  - 用户注销（`DELETE /api/users/:id`）和立即删除（`POST /api/users/:id/delete-immediately`）没有确认步骤
  - 缓存清空（`POST /api/cache-monitor/cleanup`）可以直接清空所有缓存
- **风险**: 管理员误操作或 CSRF 攻击可能造成不可逆的数据丢失。
- **修复建议**:
  1. 永久删除操作要求额外确认参数（如 `confirm=YES` 或二次认证）
  2. 资源库删除默认为软删除（移到回收站）而非永久删除
  3. 缓存清空操作添加二次确认
- **需要用户确认**: ✅ 是 — 需确认资源库删除默认行为是否应改为软删除

---

## 4. 批量操作风险

### 4.1 发现的批量操作端点

#### 问题 4.1: 回收站批量操作

- **文件**: `packages/backend/src/file-system/file-system.controller.ts:193,210,224`
- **严重程度**: ℹ️ **信息**
- **问题描述**: 
  - `POST /api/file-system/trash/restore` 接收 `body.itemIds: string[]` 批量恢复
  - `DELETE /api/file-system/trash/items` 接收 `body.itemIds: string[]` 批量永久删除
  - `DELETE /api/file-system/trash` 清空整个回收站
- **正面评价**: 这些端点都有 `@CsrfProtected()` 保护和相应的权限要求（`FILE_TRASH_MANAGE`）。

#### 问题 4.2: users/search 端点用于成员搜索可能泄露用户列表

- **文件**: `packages/backend/src/users/users.controller.ts:118-131`
- **严重程度**: 🟡 **中等**
- **问题描述**: `GET /api/users/search` 用于"搜索用户（用于添加项目成员）"，虽然需要认证但没有 `SYSTEM_USER_READ` 权限要求。任何已登录用户都可以通过此端点搜索系统内所有用户，结合分页可以枚举全部用户列表。
- **风险**: 已认证用户可以枚举所有用户信息（邮箱、用户名等），用于社工或信息收集。
- **修复建议**: 
  1. 限制搜索结果数量（设置最大 limit）
  2. 仅返回必要字段（姓名、头像），不返回邮箱等敏感信息
  3. 添加频率限制防止批量枚举
- **需要用户确认**: 否

#### 问题 4.3: 字段唯一性检查端点天然存在枚举风险

- **文件**: `packages/backend/src/auth/auth.controller.ts:678`
- **严重程度**: 🟡 **中等**
- **问题描述**: `POST /api/auth/check-field` 可以一次检查 username、email、phone 三个字段，虽然是公开接口，但结合问题 2.2 的宽松限流，可被用于用户枚举。
- **修复建议**: 添加严格的验证码前置要求或 IP 级别的 Redis 限流。

---

## 5. 文件上传安全

### 5.1 上传端点汇总

| 端点 | 文件 | 认证 | 权限 | 文件大小限制 |
|------|------|------|------|-------------|
| `POST /api/library/drawing/save/:nodeId` | library.controller.ts:241 | JWT | LIBRARY_DRAWING_MANAGE | Multer 500MB，无控制器级校验 |
| `POST /api/library/block/save/:nodeId` | library.controller.ts:511 | JWT | LIBRARY_BLOCK_MANAGE | Multer 500MB，无控制器级校验 |
| `POST /api/mxcad/savemxweb/:nodeId` | save.controller.ts:64 | JWT | CAD_SAVE | 无 Multer 限制 |
| `POST /api/mxcad/save-as` | save.controller.ts:113 | JWT | 无全局权限，内部校验 | 无 Multer 限制 |
| `POST /api/mxcad/up_ext_reference_dwg/:nodeId` | mxcad.controller.ts:305 | JWT | CAD_EXTERNAL_REFERENCE | 内部 validateFileSize 100MB |
| `POST /api/mxcad/up_ext_reference_image` | mxcad.controller.ts:456 | JWT | CAD_EXTERNAL_REFERENCE | 内部 validateFileSize 100MB |
| `POST /api/public-file/ext-reference/upload` | public-file.controller.ts:115 | 无 | 无 | memoryStorage，无大小限制 |
| `POST /api/font-management/upload` | fonts.controller.ts:96 | JWT | SYSTEM_FONT_UPLOAD | 无 Multer 限制 |
| `POST /api/mxcad/thumbnail/:nodeId` | thumbnail.controller.ts:94 | JWT | 无全局权限，内部校验 | 无 Multer 限制 |

### 5.2 配置分析

`configuration.ts` 中的上传配置：
- `upload.maxSize`: 500MB（Multer 中间件层上限）
- `upload.allowedTypes`: `.dwg`, `.dxf`, `.pdf`, `.png`, `.jpg`, `.jpeg`
- `upload.blockedExtensions`: `.exe`, `.bat`, `.sh`, `.cmd`, `.ps1`
- `upload.maxFilesPerUpload`: 10
- `fileExtensions.forbidden`: `.exe`, `.bat`, `.sh`, `.cmd`, `.ps1`, `.scr`, `.vbs`

#### 发现的问题

#### 问题 5.1: save.controller.ts 的两个上传端点没有 Multer 文件大小限制

- **文件**: `packages/backend/src/mxcad/save/save.controller.ts:68,116`
- **严重程度**: 🔴 **严重**
- **问题描述**: `POST /api/mxcad/savemxweb/:nodeId` 和 `POST /api/mxcad/save-as` 虽然使用了 `FileInterceptor('file')`，但没有传入 `limits` 配置（如 `fileSize`），也未设置 `storage`。这意味着默认依赖全局 Multer 配置（如果有的话），或者在 NestJS 中可能没有默认大小限制。
- **风险**: 攻击者可上传超大文件消耗磁盘空间或造成 DoS。
- **修复建议**: 在使用 `FileInterceptor` 时显式设置 `{ limits: { fileSize: 500 * 1024 * 1024 } }`。
- **需要用户确认**: 否

#### 问题 5.2: public-file/ext-reference/upload 使用 memoryStorage 无大小限制

- **文件**: `packages/backend/src/public-file/public-file.controller.ts:132`
- **严重程度**: 🔴 **严重**
- **问题描述**: 该端点使用 `FileInterceptor('file', { storage: memoryStorage() })`（将文件完整加载到内存），无任何大小限制，且是公开端点（无需认证）。
- **风险**: 
  - 内存耗尽攻击：攻击者发送大文件直接导致 OOM
  - 结合无认证特性，是极易被利用的 DoS 向量
- **修复建议**: 
  1. 添加 `limits: { fileSize: 10 * 1024 * 1024 }`（限制 10MB）
  2. 或将 memoryStorage 改为磁盘存储
  3. 添加认证要求
- **需要用户确认**: ✅ 是 — 需确认外部参照上传的大小需求

#### 问题 5.3: 缩略图上传缺少文件大小和类型校验

- **文件**: `packages/backend/src/mxcad/infra/thumbnail.controller.ts:96`
- **严重程度**: 🟡 **中等**
- **问题描述**: `POST /api/mxcad/thumbnail/:nodeId` 使用 `FileInterceptor('file')` 无 `limits` 配置，虽然内部有格式验证（仅支持 png/jpg/jpeg/webp），但这是在上传完成之后才做的。恶意大文件会在校验前被写入磁盘。
- **修复建议**: 在 FileInterceptor 中设置 `{ limits: { fileSize: 10 * 1024 * 1024 } }`。
- **需要用户确认**: 否

#### 问题 5.4: 字体上传缺少 Multer 级别的大小限制和类型校验

- **文件**: `packages/backend/src/fonts/fonts.controller.ts:102`
- **严重程度**: 🟡 **中等**
- **问题描述**: `POST /api/font-management/upload` 仅使用 `FileInterceptor('file')`，没有 `limits` 配置，也没有在控制器层做文件类型校验。字体文件通常较小，但仍应有保护。
- **修复建议**: 
  1. 添加 `limits: { fileSize: 20 * 1024 * 1024 }`（20MB 上限）
  2. 添加文件扩展名校验（仅允许 .ttf/.otf/.woff/.woff2/.shx 等字体格式）
- **需要用户确认**: 否

#### 问题 5.5: 配置中的 `allowedTypes` 和 `allowedExtensions` 未被上传端点引用

- **文件**: `packages/backend/src/config/configuration.ts:141-153`
- **严重程度**: 🟡 **中等**
- **问题描述**: 配置文件定义了 `upload.allowedTypes` 和 `upload.blockedExtensions`，但搜索代码发现这些配置并未在控制器的上传端点中被实际校验。文件类型校验主要依赖各端点内部的 `validateFileType` 方法（仅在 mxcad.controller.ts 中使用）。
- **风险**: 配置文件中的安全策略实际上是"死代码"，未产生实际的安全防护效果。
- **修复建议**: 创建全局的 Multer 配置工厂函数或文件验证 guard/interceptor，统一应用 `allowedTypes` 和 `blockedExtensions` 规则。
- **需要用户确认**: 否

---

## 6. WebSocket 安全

### 6.1 现状

- 项目中**未发现任何 `.gateway.ts` 文件**，即当前不使用 NestJS WebSocket Gateway。
- 代码中有一个 `cooperate.url` 配置（指向 `http://localhost:3091`），协同编辑功能似乎由独立服务提供，不在当前后端代码中。

### 6.2 结论

**无 WebSocket 安全风险**，无需进一步分析。

---

## 7. CSRF 保护

### 7.1 `@CsrfProtected` 使用情况

共发现 **15 处** `@CsrfProtected()` 使用，全部在 `file-system.controller.ts` 中的写操作端点：

| 行号 | 端点 |
|------|------|
| 126 | `POST /api/file-system/projects` — 创建项目 |
| 195 | `POST /api/file-system/trash/restore` — 恢复回收站 |
| 212 | `DELETE /api/file-system/trash/items` — 永久删除 |
| 226 | `DELETE /api/file-system/trash` — 清空回收站 |
| 240 | `POST /api/file-system/nodes` — 创建节点 |
| 260 | `POST /api/file-system/nodes/:parentId/folders` — 创建文件夹 |
| 287 | `POST /api/file-system/nodes/:nodeId/restore` — 恢复节点 |
| 335 | `PATCH /api/file-system/nodes/:nodeId` — 更新节点 |
| 352 | `DELETE /api/file-system/nodes/:nodeId` — 删除节点 |
| 372 | `POST /api/file-system/nodes/:nodeId/move` — 移动节点 |
| 386 | `POST /api/file-system/nodes/:nodeId/copy` — 复制节点 |
| 414 | `POST /api/file-system/quota/update` — 更新配额 |
| 446 | `POST /api/file-system/projects/:projectId/members` — 添加成员 |
| 473 | `PATCH /api/file-system/projects/:projectId/members/:userId` — 更新成员 |
| 504 | `DELETE /api/file-system/projects/:projectId/members/:userId` — 移除成员 |

#### 发现的问题

#### 问题 7.1: 其他控制器的写操作端点缺少 CSRF 保护

- **文件**: roles.controller.ts, users.controller.ts, library.controller.ts, runtime-config.controller.ts 等
- **严重程度**: 🟡 **中等**
- **问题描述**: 以下写操作端点没有 `@CsrfProtected` 装饰器：
  - 角色管理：`POST/PATCH/DELETE /api/roles/*` (roles.controller.ts)
  - 用户管理：`POST/PATCH/DELETE /api/users/*` (users.controller.ts)
  - 运行时配置：`PUT /api/runtime-config/:key`, `POST /api/runtime-config/:key/reset` (runtime-config.controller.ts)
  - 资源库写操作：`POST/DELETE/PATCH /api/library/drawing/*`, `/api/library/block/*` (library.controller.ts)
  - 字体管理：`POST /api/font-management/upload`, `DELETE /api/font-management/:fileName` (fonts.controller.ts)
  - 缓存管理：`POST/DELETE /api/cache-monitor/*` (cache-monitor.controller.ts)
  - 用户清理：`POST /api/user-cleanup/trigger` (user-cleanup.controller.ts)
  - 存储清理：`POST /api/admin/storage/cleanup` (admin.controller.ts)
  - MxCAD 保存：`POST /api/mxcad/savemxweb/:nodeId`, `POST /api/mxcad/save-as` (save.controller.ts)

- **风险**: 如果前端使用 Cookie 认证，攻击者可通过 CSRF 攻击利用已登录管理员的会话执行敏感操作（删除角色、修改配置、清空缓存等）。
- **修复建议**: 
  1. 对所有状态变更的写操作端点统一添加 `@CsrfProtected()` 装饰器
  2. 或使用全局 CSRF 中间件
- **需要用户确认**: ✅ 是 — 需确认前端认证方式（纯 Bearer Token vs Cookie），纯 Bearer Token 的话 CSRF 风险较低

---

## 8. 其他发现

### 问题 8.1: health/full 端点返回详细系统信息

- **文件**: `packages/backend/src/health/health.controller.ts:129`
- **严重程度**: ℹ️ **信息（低风险）**
- **问题描述**: `GET /api/health/full` 返回详细的健康检查信息（数据库状态、存储状态），需要 `SYSTEM_MONITOR` 权限。但 `live` 和基本 health 检查返回了数据库和 Redis 连接状态，可能暴露基础设施架构信息。
- **修复建议**: 公开 health 端点只返回 `ok/degraded`，不暴露组件名称和状态详情。

### 问题 8.2: mxcad/filesData HEAD 端点无认证

- **文件**: `packages/backend/src/mxcad/core/mxcad.controller.ts:705-718`
- **严重程度**: 🟡 **中等**
- **问题描述**: `HEAD /api/mxcad/filesData/*path` 没有任何 `@UseGuards(JwtAuthGuard)` 保护（而对应的 GET 请求有认证）。注释说明"MxCAD 库内部发送的 HEAD 请求无法自定义请求头"。
- **风险**: 虽然 HEAD 不返回文件内容，但攻击者可以通过 HEAD 请求探测文件是否存在（文件枚举），结合路径推测可以遍历文件系统。
- **修复建议**: 
  1. 如果技术可行，寻找让 MxCAD 库发送认证头的方法
  2. 至少添加速率限制防止批量探测
  3. 考虑使用签名 URL（临时 token）方式验证 HEAD 请求
- **需要用户确认**: ✅ 是 — 需确认 MxCAD 库是否支持自定义请求头

---

## 总结表格

| 编号 | 问题 | 严重程度 | 文件位置 | 需要确认 |
|------|------|----------|----------|----------|
| 1.1 | Session 控制器完全公开（session/create 可伪造会话） | 🔴 严重 | session.controller.ts:30 | ✅ |
| 1.2 | 公开上传接口（内存存储、无大小限制） | 🟡 中等 | public-file.controller.ts:116 | ✅ |
| 1.3 | check-field 端点可用于用户枚举 | 🟡 中等 | auth.controller.ts:678 | — |
| 2.1 | RateLimitGuard 使用内存存储，多实例失效 | 🟡 中等 | rate-limit.guard.ts:47 | ✅ |
| 2.2 | 公开接口限流过于宽松（6000次/分钟） | 🟡 中等 | rate-limit.guard.ts:51 | — |
| 2.3 | 仅有内存限流，无 Redis 分布式限流 | ℹ️ 信息 | rate-limit.guard.ts | — |
| 2.4 | 多数公开端点缺少细粒度 Throttle | ℹ️ 信息 | 多个控制器 | — |
| 3.1 | 多处敏感写操作未记录审计日志 | 🟡 中等 | roles, runtime-config, fonts, cache-monitor 等 | ✅ |
| 3.2 | 删除操作缺少二次确认机制 | 🟡 中等 | library, file-system, users 控制器 | ✅ |
| 4.1 | 回收站批量操作（已有充分保护） | ℹ️ 信息 | file-system.controller.ts | — |
| 4.2 | users/search 可枚举所有用户（无 SYSTEM_USER_READ 权限要求） | 🟡 中等 | users.controller.ts:118 | — |
| 4.3 | 字段唯一性检查天然支持枚举 | 🟡 中等 | auth.controller.ts:678 | — |
| 5.1 | save.controller.ts 上传端点无 Multer 大小限制 | 🔴 严重 | save.controller.ts:68,116 | — |
| 5.2 | 公开上传使用 memoryStorage 无大小限制 | 🔴 严重 | public-file.controller.ts:132 | ✅ |
| 5.3 | 缩略图上传缺少 Multer 大小限制 | 🟡 中等 | thumbnail.controller.ts:96 | — |
| 5.4 | 字体上传无大小限制和类型校验 | 🟡 中等 | fonts.controller.ts:102 | — |
| 5.5 | allowedTypes/allowedExtensions 配置未被控制器使用 | 🟡 中等 | configuration.ts:141-153 | — |
| 6.x | 无 WebSocket，无相关风险 | ✅ 通过 | — | — |
| 7.1 | 多个写操作控制器缺少 CSRF 保护 | 🟡 中等 | roles, users, library, runtime-config 等 | ✅ |
| 8.1 | 公开 health 端点暴露基础设施组件状态 | ℹ️ 信息 | health.controller.ts | — |
| 8.2 | mxcad/filesData HEAD 端点无认证 | 🟡 中等 | mxcad.controller.ts:705 | ✅ |

### 统计

| 严重程度 | 数量 |
|----------|------|
| 🔴 严重 | 3 |
| 🟡 中等 | 12 |
| ℹ️ 信息 | 4 |
| ✅ 通过 | 1 |

**严重问题需要立即修复**:
1. Session 控制器完全公开 (`session.controller.ts:30`)
2. save.controller.ts 上传端点无 Multer 大小限制 (`save.controller.ts:68,116`)
3. 公开上传使用 memoryStorage 无大小限制 (`public-file.controller.ts:132`)
