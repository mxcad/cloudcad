# CloudCAD 后端模块依赖关系图

> 生成时间：2026-05-02
> 模块总数：24 个

---

## 一、基础设施模块

被多数模块依赖的核心模块，提供通用能力。

### 1. DatabaseModule
- **性质**：全局基础设施（@Global()）
- **被依赖次数**：10 个模块
- **提供**：DatabaseService（Prisma 数据库服务）
- **依赖方**：
  - CommonModule
  - AuditLogModule
  - FileSystemModule
  - VersionControlModule
  - PolicyEngineModule
  - MxCadModule
  - LibraryModule
  - CacheArchitectureModule

### 2. RedisModule
- **性质**：全局基础设施（@Global()）
- **被依赖次数**：9 个模块
- **提供**：NestRedisModule（ioredis 封装）
- **依赖方**：
  - AuthModule
  - CommonModule
  - CacheArchitectureModule
  - SmsModule

### 3. CacheArchitectureModule
- **性质**：全局基础设施（@Global()）
- **被依赖次数**：0（仅内部使用）
- **提供**：三级缓存（L1 内存/L2 Redis/L3 数据库）、缓存预热、监控服务
- **依赖**：ConfigModule、ScheduleModule、DatabaseModule、CommonModule

### 4. CommonModule
- **性质**：核心业务基础设施
- **被依赖次数**：14 个模块（最多）
- **提供**：PermissionService、PermissionCacheService、RolesCacheService、RedisCacheService、FileLockService、StorageManager、RoleInheritanceService 等 17 个服务
- **依赖**：ConfigModule、DatabaseModule、RedisModule、StorageModule、UsersModule（forwardRef）
- **依赖方**：
  - AuthModule（forwardRef）
  - UsersModule（forwardRef）
  - RolesModule
  - FileSystemModule
  - VersionControlModule
  - HealthModule
  - MxCadModule
  - AdminModule
  - FontsModule
  - PolicyEngineModule
  - PublicFileModule
  - LibraryModule
  - SchedulerModule
  - CacheArchitectureModule

### 5. ConfigModule
- **性质**：NestJS 内置配置模块
- **被依赖次数**：几乎所有模块（全局配置）

---

## 二、业务模块

### FileSystemModule
- **依赖**：DatabaseModule、CommonModule、StorageModule、AuditLogModule、RolesModule（forwardRef）、VersionControlModule、RuntimeConfigModule、PersonalSpaceModule
- **导出**：FileSystemService、ProjectCrudService、FileTreeService、FileOperationsService、FileDownloadExportService、ProjectMemberService、StorageQuotaService、SearchService 等 14 个服务
- **用途**：文件树、项目管理、权限控制、存储配额、搜索

### AuthModule
- **依赖**：DatabaseModule、CommonModule（forwardRef）、RedisModule、RuntimeConfigModule、UsersModule（forwardRef）、PassportModule、SmsModule、MailerModule、JwtModule
- **导出**：AuthFacadeService、RegistrationService、LoginService、PasswordService、AccountBindingService、AuthTokenService、TokenBlacklistService、JwtAuthGuard、EmailVerificationService、SmsModule
- **用途**：用户认证、注册、登录、令牌管理、第三方登录

### UsersModule
- **依赖**：CommonModule（forwardRef）、RuntimeConfigModule、SmsModule、AuthModule（forwardRef）
- **导出**：UsersService
- **用途**：用户管理

### RolesModule
- **依赖**：CommonModule、AuditLogModule、FileSystemModule（forwardRef）
- **导出**：RolesService、ProjectPermissionService、ProjectRolesService、RequireProjectPermissionGuard
- **用途**：角色管理、项目权限

### VersionControlModule
- **依赖**：ConfigModule、CommonModule、DatabaseModule、RolesModule（forwardRef）、FileSystemModule（forwardRef）
- **导出**：VersionControlService
- **用途**：SVN 版本控制

### MxCadModule
- **依赖**：DatabaseModule、CommonModule、ConfigModule、RuntimeConfigModule、JwtModule、MulterModule、FileSystemModule（forwardRef）、StorageModule（forwardRef）、VersionControlModule、RolesModule
- **导出**：MxCadService、FileUploadManagerFacadeService、UploadOrchestrator、FileConversionService、FileSystemService、ExternalReferenceHandler、MxcadFileHandlerService、ThumbnailGenerationService、ExternalReferenceUpdateService
- **用途**：CAD 文件操作、文件转换、外部引用、缩略图

### LibraryModule
- **依赖**：DatabaseModule、CommonModule、FileSystemModule、RolesModule、RuntimeConfigModule、MxCadModule（forwardRef）、MulterModule
- **导出**：LibraryService
- **用途**：图纸库、图块库

### StorageModule
- **依赖**：ConfigModule
- **导出**：LocalStorageProvider、StorageService
- **用途**：本地存储

### RuntimeConfigModule
- **依赖**：无
- **导出**：RuntimeConfigService
- **用途**：运行时配置

### HealthModule
- **依赖**：TerminusModule、StorageModule、CommonModule、AuthModule
- **用途**：健康检查

### AdminModule
- **依赖**：CommonModule
- **用途**：管理后台

### FontsModule
- **依赖**：CommonModule、ConfigModule、MulterModule
- **导出**：FontsService
- **用途**：字体管理

### PolicyEngineModule
- **依赖**：DatabaseModule、CommonModule
- **导出**：PolicyEngineService、PolicyConfigService
- **用途**：动态权限策略

### PublicFileModule
- **依赖**：CommonModule、MxCadModule、MulterModule
- **导出**：PublicFileService、PublicFileUploadService
- **用途**：公共文件上传

### PersonalSpaceModule
- **依赖**：无
- **导出**：PersonalSpaceService
- **用途**：个人空间

### AuditLogModule
- **依赖**：DatabaseModule
- **导出**：AuditLogService
- **用途**：审计日志

### SchedulerModule
- **依赖**：ScheduleModule、CommonModule
- **用途**：定时任务

### SmsModule
- **依赖**：ConfigModule、RedisModule、RuntimeConfigModule
- **导出**：SmsVerificationService
- **用途**：短信验证

---

## 三、forwardRef 循环依赖对（共 10 处）

| # | 模块 A | 模块 B | 说明 |
|---|--------|--------|------|
| 1 | CommonModule | UsersModule | CommonModule 依赖 UsersModule（提供用户清理服务），UsersModule 依赖 CommonModule |
| 2 | AuthModule | CommonModule | AuthModule 依赖 CommonModule（使用 InitializationService），CommonModule 导出权限服务给 AuthModule |
| 3 | AuthModule | UsersModule | AuthModule 依赖 UsersModule（认证依赖用户数据），UsersModule 依赖 AuthModule（用户模块导入认证模块） |
| 4 | RolesModule | FileSystemModule | RolesModule 依赖 FileSystemModule（角色权限需要文件系统上下文），FileSystemModule 依赖 RolesModule（文件操作需要角色验证） |
| 5 | VersionControlModule | RolesModule | VersionControlModule 依赖 RolesModule（版本控制需要角色权限） |
| 6 | VersionControlModule | FileSystemModule | VersionControlModule 依赖 FileSystemModule（版本控制基于文件系统） |
| 7 | FileSystemModule | RolesModule | FileSystemModule 依赖 RolesModule（项目成员权限） |
| 8 | MxCadModule | FileSystemModule | MxCadModule 依赖 FileSystemModule（CAD 文件操作需要文件系统服务） |
| 9 | MxCadModule | StorageModule | MxCadModule 依赖 StorageModule（文件上传需要存储服务） |
| 10 | LibraryModule | MxCadModule | LibraryModule 依赖 MxCadModule（图纸库需要 CAD 处理能力） |

---

## 四、依赖树

```
AppModule
│
├── ConfigModule（NestJS 内置）
│
├── DatabaseModule ★ 基础设施（全局）
│   ├── AuditLogModule
│   ├── PolicyEngineModule
│   ├── FileSystemModule
│   │   ├── RolesModule（forwardRef 循环）
│   │   │   ├── CommonModule
│   │   │   ├── AuditLogModule
│   │   │   └── FileSystemModule（循环）
│   │   ├── VersionControlModule
│   │   │   ├── RolesModule（forwardRef 循环）
│   │   │   └── FileSystemModule（循环）
│   │   ├── PersonalSpaceModule
│   │   └── CommonModule
│   ├── MxCadModule
│   │   ├── RolesModule
│   │   ├── VersionControlModule
│   │   ├── FileSystemModule（forwardRef 循环）
│   │   ├── StorageModule（forwardRef 循环）
│   │   └── CommonModule
│   ├── LibraryModule
│   │   ├── FileSystemModule
│   │   ├── RolesModule
│   │   └── MxCadModule（forwardRef 循环）
│   └── CacheArchitectureModule
│       └── CommonModule
│
├── RedisModule ★ 基础设施（全局）
│   ├── CommonModule
│   ├── AuthModule
│   │   ├── CommonModule（forwardRef 循环）
│   │   └── UsersModule（forwardRef 循环）
│   └── SmsModule
│
├── CacheArchitectureModule ★ 基础设施（全局）
│   └── CommonModule
│
├── AuthModule ★ 业务模块
│   ├── DatabaseModule
│   ├── RedisModule
│   ├── RuntimeConfigModule
│   ├── CommonModule（forwardRef 循环）
│   ├── UsersModule（forwardRef 循环）
│   ├── PassportModule
│   ├── SmsModule
│   ├── MailerModule
│   └── JwtModule
│
├── CommonModule ★ 基础设施
│   ├── DatabaseModule
│   ├── RedisModule
│   ├── StorageModule
│   └── UsersModule（forwardRef 循环）
│
├── UsersModule ★ 业务模块
│   ├── CommonModule（forwardRef 循环）
│   ├── RuntimeConfigModule
│   ├── SmsModule
│   └── AuthModule（forwardRef 循环）
│
├── RolesModule ★ 业务模块
│   ├── CommonModule
│   ├── AuditLogModule
│   └── FileSystemModule（forwardRef 循环）
│
├── MxCadModule ★ 业务模块
│   ├── CommonModule
│   ├── DatabaseModule
│   ├── StorageModule（forwardRef 循环）
│   ├── VersionControlModule
│   ├── RolesModule
│   ├── FileSystemModule（forwardRef 循环）
│   └── RuntimeConfigModule
│
├── VersionControlModule ★ 业务模块
│   ├── CommonModule
│   ├── DatabaseModule
│   ├── RolesModule（forwardRef 循环）
│   └── FileSystemModule（forwardRef 循环）
│
├── FileSystemModule ★ 业务模块
│   ├── CommonModule
│   ├── DatabaseModule
│   ├── StorageModule
│   ├── AuditLogModule
│   ├── RolesModule（forwardRef 循环）
│   ├── VersionControlModule
│   ├── RuntimeConfigModule
│   └── PersonalSpaceModule
│
├── LibraryModule ★ 业务模块
│   ├── CommonModule
│   ├── DatabaseModule
│   ├── FileSystemModule
│   ├── RolesModule
│   ├── RuntimeConfigModule
│   └── MxCadModule（forwardRef 循环）
│
├── StorageModule
│   └── ConfigModule
│
├── RuntimeConfigModule
│
├── FontsModule
│   ├── CommonModule
│   └── ConfigModule
│
├── AdminModule
│   └── CommonModule
│
├── HealthModule
│   ├── CommonModule
│   ├── StorageModule
│   └── AuthModule
│
├── SchedulerModule
│   └── CommonModule
│
├── PolicyEngineModule
│   ├── CommonModule
│   └── DatabaseModule
│
├── PublicFileModule
│   ├── CommonModule
│   └── MxCadModule
│
└── PersonalSpaceModule
```

---

## 五、循环依赖分析

### 主要循环链

```
AuthModule ↔ UsersModule
    ↓              ↓
CommonModule ←──┘

RolesModule ↔ FileSystemModule
    ↓              ↓
VersionControlModule（依赖两者）

MxCadModule ↔ FileSystemModule
    ↑              ↓
LibraryModule ────┘
```

### 循环依赖影响

| 循环对 | 风险等级 | 说明 |
|--------|----------|------|
| AuthModule ↔ UsersModule | 中 | 认证与用户模块相互依赖，初始化顺序敏感 |
| RolesModule ↔ FileSystemModule | 高 | 角色权限与文件系统深度耦合，修改需谨慎 |
| MxCadModule ↔ FileSystemModule | 中 | CAD 操作与文件系统相互依赖 |
| CommonModule ↔ UsersModule | 低 | 通过 forwardRef 解决，影响范围可控 |

---

## 六、模块依赖统计

| 模块 | 被依赖数 | 依赖数 | 分类 |
|------|----------|--------|------|
| CommonModule | 14 | 5 | 基础设施 |
| DatabaseModule | 10 | 0 | 基础设施 |
| RedisModule | 9 | 0 | 基础设施 |
| CacheArchitectureModule | 0 | 4 | 基础设施 |
| FileSystemModule | 4 | 8 | 业务模块 |
| MxCadModule | 2 | 8 | 业务模块 |
| AuthModule | 2 | 9 | 业务模块 |
| RolesModule | 3 | 3 | 业务模块 |
| VersionControlModule | 1 | 5 | 业务模块 |
| LibraryModule | 0 | 6 | 业务模块 |
| UsersModule | 1 | 4 | 业务模块 |
| StorageModule | 5 | 1 | 基础设施 |
| RuntimeConfigModule | 5 | 0 | 基础设施 |
| HealthModule | 0 | 4 | 业务模块 |
| AdminModule | 0 | 1 | 业务模块 |
| FontsModule | 0 | 3 | 业务模块 |
| PolicyEngineModule | 0 | 2 | 业务模块 |
| PublicFileModule | 0 | 2 | 业务模块 |
| AuditLogModule | 3 | 1 | 业务模块 |
| SchedulerModule | 0 | 1 | 基础设施 |
| SmsModule | 1 | 3 | 业务模块 |
| PersonalSpaceModule | 2 | 0 | 业务模块 |
