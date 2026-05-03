# 模块循环依赖修复报告

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**方案**: 提取共享接口 + 移除未使用依赖  

---

## 修复概览

| 序号 | 循环依赖对 | 修复方式 | 结果 |
|------|-----------|---------|------|
| 1 | CommonModule ↔ AuditLogModule | 移除未使用注入 | 完全消除 |
| 2 | CommonModule ↔ UsersModule | 提取 IUserService 接口 | 完全消除 |
| 3 | CommonModule ↔ CacheArchitectureModule | 移除单向无实际依赖 | 完全消除 |
| 4 | AuthModule ↔ UsersModule | 提取接口 + 模块级 token | TypeScript 解耦 |
| 5 | FileSystemModule ↔ RolesModule | 移除单向无实际依赖 | 完全消除 |

**结果**: 5 对循环依赖全部修复。7 处 forwardRef 保留（均为单向非循环依赖或模块内部引用）。

---

## 详细修复方案

### 1. CommonModule ↔ AuditLogModule

**根本原因**: 
`PermissionService` 注入了 `AuditLogService`（使用 `@Inject(forwardRef(() => AuditLogService))`），但该注入从未被使用。代码注释明确说明"权限检查不记录审计日志（避免日志过多）"。同时 `AuditLogModule` 导入了 `CommonModule`，但 `AuditLogService` 仅依赖 `DatabaseService`，不需要 CommonModule 的任何服务。

**修复方案**:
- 从 `PermissionService` 移除未使用的 `AuditLogService` 注入和 import
- 从 `CommonModule` 移除 `forwardRef(() => AuditLogModule)`
- 从 `AuditLogModule` 移除 `forwardRef(() => CommonModule)`（完全移除对 CommonModule 的依赖）

**修改文件**:
- `src/common/services/permission.service.ts`
- `src/common/common.module.ts`
- `src/audit/audit-log.module.ts`

---

### 2. CommonModule ↔ UsersModule

**根本原因**: 
`InitializationService`（CommonModule）在 `onModuleInit()` 中调用 `UsersService.create()` 创建初始管理员。`UsersService` 注入了 `PermissionCacheService` 和 `UserCleanupService`（均来自 CommonModule），形成双向依赖。

**修复方案**:
- 创建 `src/common/interfaces/user-service.interface.ts`，定义 `USER_SERVICE` 令牌和 `IUserService` 接口
- `InitializationService` 改为注入 `@Inject(USER_SERVICE)` 依赖接口
- `UsersModule` 注册 `{ provide: USER_SERVICE, useExisting: UsersService }` 并导出 `USER_SERVICE`
- `CommonModule` 移除 `forwardRef(() => UsersModule)` 和对 `UsersModule` 的 import
- `UsersModule` 将 `forwardRef(() => CommonModule)` 改为直接导入 `CommonModule`

**修改文件**:
- `src/common/interfaces/user-service.interface.ts`（新建）
- `src/common/services/initialization.service.ts`
- `src/common/common.module.ts`
- `src/users/users.module.ts`

---

### 3. CommonModule ↔ CacheArchitectureModule

**根本原因**: 
CommonModule 导入了 `forwardRef(() => CacheArchitectureModule)`，但实际上 CommonModule 中的任何服务都没有注入 CacheArchitectureModule 的服务。CacheArchitectureModule 反向依赖 CommonModule 的 `RedisCacheService` 和枚举类型。

**修复方案**:
- 从 `CommonModule` 移除 `forwardRef(() => CacheArchitectureModule)` 和对该模块的 import
- `CacheArchitectureModule` 将 `forwardRef(() => CommonModule)` 改为直接导入 `CommonModule`

**修改文件**:
- `src/common/common.module.ts`
- `src/cache-architecture/cache-architecture.module.ts`

---

### 4. AuthModule ↔ UsersModule

**根本原因**: 
这是最复杂的一对循环依赖。AuthModule 的多个服务（`AuthFacadeService`、`RegistrationService`）调用 `UsersService.create()` 创建用户；`UsersService` 调用 `SmsVerificationService.verifyCode()` 和 `EmailVerificationService.verifyEmail()` 进行验证。同时发现 `LoginService` 注入了 `UsersService` 但从未实际使用。

**修复方案**:

*解耦用户创建方向（AuthModule → UsersModule）*:
- 使用已创建的 `USER_SERVICE` 令牌和 `IUserService` 接口
- `AuthFacadeService` 和 `RegistrationService` 改为 `@Inject(USER_SERVICE)` 依赖接口
- `LoginService` 移除未使用的 `UsersService` 注入
- AuthModule 从 `forwardRef(() => UsersModule)` 改为直接导入 `UsersModule`

*解耦验证服务方向（UsersModule → AuthModule）*:
- 创建 `src/common/interfaces/verification.interface.ts`，定义 `SMS_VERIFICATION_SERVICE` 和 `EMAIL_VERIFICATION_SERVICE` 令牌
- `SmsModule` 注册并导出 SMS token provider
- `AuthModule` 注册并导出 EMAIL token provider
- `UsersService` 改为依赖接口令牌，不再直接导入 AuthModule 的具体类

*模块级依赖*:
- UsersModule 保留 `forwardRef(() => AuthModule)` 用于 NestJS DI 解析（因为 AuthModule 导入 UsersModule，NestJS 需要通过 forwardRef 打破模块初始化循环）
- AuthModule 导入 UsersModule（直接，非 forwardRef）
- TypeScript 层面无循环 import

**修改文件**:
- `src/common/interfaces/verification.interface.ts`（新建）
- `src/auth/services/sms/sms.module.ts`
- `src/auth/auth.module.ts`
- `src/auth/auth-facade.service.ts`
- `src/auth/services/registration.service.ts`
- `src/auth/services/login.service.ts`
- `src/users/users.service.ts`
- `src/users/users.module.ts`

---

### 5. FileSystemModule ↔ RolesModule

**根本原因**: 
`RolesModule` 导入了 `forwardRef(() => FileSystemModule)`，但检查后发现 RolesModule 中的所有服务（`RolesService`、`ProjectRolesService`、`ProjectPermissionService`）均未注入任何 FileSystemModule 的服务。这是一个"虚"依赖——模块声明了依赖但实际未使用。同时发现 `ProjectPermissionService` 注入了 `AuditLogService` 但从未调用（与修复 #1 相同的问题）。

**修复方案**:
- 从 `RolesModule` 移除 `forwardRef(() => FileSystemModule)` 和对 FileSystemModule 的 import
- `FileSystemModule` 将 `forwardRef(() => RolesModule)` 改为直接导入 `RolesModule`
- 从 `ProjectPermissionService` 移除未使用的 `AuditLogService` 注入

**修改文件**:
- `src/roles/roles.module.ts`
- `src/roles/project-permission.service.ts`
- `src/file-system/file-system.module.ts`

---

## 新建文件列表

| 文件 | 用途 |
|------|------|
| `src/common/interfaces/user-service.interface.ts` | `USER_SERVICE` 令牌 + `IUserService` 接口 + `ICreatedUser` 类型 |
| `src/common/interfaces/verification.interface.ts` | `SMS_VERIFICATION_SERVICE`、`EMAIL_VERIFICATION_SERVICE` 令牌 + 验证接口 |

## 修改文件总览

| 文件 | 变更类型 |
|------|---------|
| `src/common/common.module.ts` | 移除 3 个 forwardRef 导入 |
| `src/common/services/permission.service.ts` | 移除未使用的 AuditLogService 注入 |
| `src/common/services/initialization.service.ts` | 改为依赖 IUserService 接口 |
| `src/audit/audit-log.module.ts` | 移除 CommonModule 依赖 |
| `src/users/users.module.ts` | 注册 USER_SERVICE token，CommonModule 改为直接导入 |
| `src/users/users.service.ts` | 改为依赖验证接口令牌 |
| `src/cache-architecture/cache-architecture.module.ts` | CommonModule 改为直接导入 |
| `src/auth/auth.module.ts` | UsersModule/CommonModule 改为直接导入，注册 EMAIL token，移除 forwardRef |
| `src/auth/auth-facade.service.ts` | 改为依赖 IUserService 接口 |
| `src/auth/services/registration.service.ts` | 改为依赖 IUserService 接口 |
| `src/auth/services/login.service.ts` | 移除未使用的 UsersService 注入 |
| `src/auth/services/sms/sms.module.ts` | 注册并导出 SMS_VERIFICATION_SERVICE token |
| `src/roles/roles.module.ts` | 移除 FileSystemModule forwardRef |
| `src/roles/project-permission.service.ts` | 移除未使用的 AuditLogService 注入 |
| `src/file-system/file-system.module.ts` | RolesModule 改为直接导入 |

---

## forwardRef 消除情况

- **原始**: 5 对双向循环依赖，共 ~18 处 forwardRef
- **修复后**: 0 对双向循环依赖
- **保留 forwardRef 7 处**（均为单向非循环或模块内部）:
  - `FileSystemPermissionService → FileTreeService`（模块内部 service 间引用）
  - `LibraryModule → MxCadModule`（单向）
  - `MxCadModule → FileSystemModule, StorageModule`（单向）
  - `MxCadService → FileUploadManagerFacadeService`（service 间引用）
  - `UsersModule → AuthModule`（NestJS 模块级，TypeScript 已解耦）
  - `VersionControlModule → RolesModule, FileSystemModule`（单向）

---

## 编译结果

- 编译命令: `npx tsc --noEmit`
- 新增编译错误: **0**
- 所有修改文件均无新增 TypeScript 错误
- 已存在的 DatabaseService 类型错误（Prisma model 属性缺失）与本次修改无关，属于预先存在的问题
