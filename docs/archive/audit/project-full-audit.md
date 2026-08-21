# CloudCAD 项目完整审计报告

**分支**: `refactor/circular-deps`
**生成时间**: 2026-05-02
**审计维度**: 数据库全貌、API全貌、服务依赖全貌、文件存储全貌、配置体系全貌、前端状态全貌

---

## 一、数据库全貌

### 1.1 数据表总览

| 表名 | 类型 | 核心业务 | 说明 |
|------|------|----------|------|
| `users` | 核心业务 | ✅ | 用户表，存储用户基本信息 |
| `roles` | 核心业务 | ✅ | 角色表，支持层级结构 |
| `role_permissions` | 核心业务 | ✅ | 系统角色权限关联表 |
| `file_system_nodes` | 核心业务 | ✅ | 文件系统节点（项目/文件夹/文件） |
| `project_roles` | 核心业务 | ✅ | 项目级角色 |
| `project_role_permissions` | 核心业务 | ✅ | 项目角色权限关联表 |
| `project_members` | 核心业务 | ✅ | 项目成员关联表 |
| `assets` | 辅助表 | ❌ | 资源库（图纸库/图块库） |
| `fonts` | 辅助表 | ❌ | 字体库 |
| `refresh_tokens` | 辅助表 | ❌ | JWT刷新令牌 |
| `audit_logs` | 辅助表 | ❌ | 审计日志 |
| `upload_sessions` | 辅助表 | ❌ | 分片上传会话 |
| `cache_entries` | 辅助表 | ❌ | 多级缓存条目 |
| `permission_policies` | 辅助表 | ❌ | 权限策略（时间/IP/设备） |
| `policy_permissions` | 辅助表 | ❌ | 策略权限关联表 |
| `runtime_configs` | 辅助表 | ❌ | 运行时配置 |
| `runtime_config_logs` | 辅助表 | ❌ | 运行时配置变更日志 |

### 1.2 核心表详细结构

#### users（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 cuid |
| email | String? | 邮箱（唯一） |
| username | String | 用户名（唯一） |
| password | String? | 密码（bcrypt加密） |
| nickname | String? | 昵称 |
| avatar | String? | 头像URL |
| roleId | String | 关联角色 |
| status | UserStatus | ACTIVE/INACTIVE/SUSPENDED |
| emailVerified | Boolean | 邮箱是否验证 |
| phone | String? | 手机号（唯一） |
| phoneVerified | Boolean | 手机是否验证 |
| wechatId | String? | 微信ID（唯一） |
| provider | String | 认证来源 LOCAL/WECHAT |
| deletedAt | DateTime? | 软删除时间 |
| lastUsernameChangeAt | DateTime? | 用户名最后修改时间 |
| usernameChangeCount | Int | 用户名修改次数 |

**索引**: `deletedAt`
**关系**:
- `role` → `Role` (N:1)
- `auditLogs` → `AuditLog` (1:N)
- `ownedNodes` → `FileSystemNode` (1:N, Cascade)
- `projectMembers` → `ProjectMember` (1:N, Cascade)

#### roles（角色表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 cuid |
| name | String | 角色名称 |
| description | String? | 描述 |
| parentId | String? | 父角色ID（层级结构） |
| category | RoleCategory | SYSTEM/PROJECT/CUSTOM |
| level | Int | 层级深度 |
| isSystem | Boolean | 是否系统角色 |

**索引**: `parentId`, `category`, `level`
**关系**:
- `parent` → `Role` (自引用, Restrict)
- `children` → `Role` (自引用)
- `users` → `User` (1:N)
- `permissions` → `RolePermission` (1:N, Cascade)

#### file_system_nodes（文件系统节点表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 cuid |
| name | String | 节点名称 |
| isFolder | Boolean | 是否文件夹 |
| isRoot | Boolean | 是否根节点（项目） |
| parentId | String? | 父节点ID |
| originalName | String? | 原始文件名 |
| path | String? | 存储路径 |
| size | Int? | 文件大小 |
| mimeType | String? | MIME类型 |
| extension | String? | 文件扩展名 |
| fileStatus | FileStatus? | UPLOADING/PROCESSING/COMPLETED/FAILED/DELETED |
| fileHash | String? | 文件MD5哈希 |
| description | String? | 描述 |
| projectStatus | ProjectStatus? | ACTIVE/ARCHIVED/DELETED |
| personalSpaceKey | String? | 私人空间唯一键 |
| libraryKey | String? | 资源库键 drawing/block |
| hasMissingExternalReferences | Boolean | 是否有缺失外部参照 |
| missingExternalReferencesCount | Int | 缺失外部参照数量 |
| externalReferencesJson | String? | 外部参照JSON |
| ownerId | String | 拥有者ID |
| projectId | String? | 所属项目ID |
| storageQuota | Int? | 存储配额（字节） |
| deletedAt | DateTime? | 软删除时间 |
| deletedByCascade | Boolean | 级联删除标记 |
| deletedFromStorage | DateTime? | 从存储删除时间 |

**索引**: `parentId`, `ownerId`, `isRoot`, `isFolder`, `deletedAt`, `personalSpaceKey`, `libraryKey`, `projectId`, `storageQuota`
**关系**:
- `owner` → `User` (N:1, Cascade)
- `parent` → `FileSystemNode` (自引用, Cascade)
- `children` → `FileSystemNode` (自引用)
- `project` → `FileSystemNode` (自引用, Cascade)
- `files` → `FileSystemNode` (自引用)
- `projectMembers` → `ProjectMember` (1:N, Cascade)
- `projectRoles` → `ProjectRole` (1:N, Cascade)

### 1.3 外键关系与级联删除策略

```
User (1) ─────────────< Role (N)
  │                        │
  │                        ├────< RolePermission (N) [Cascade]
  │
  └────< FileSystemNode (N) [Cascade]
              │
              ├────< FileSystemNode (自引用) [Cascade]
              │
              ├────< ProjectMember (N) [Cascade]
              │         │
              │         └────< ProjectRole (N) [Cascade]
              │                   │
              │                   └────< ProjectRolePermission (N) [Cascade]
              │
              └────< ProjectRole (N) [Cascade]

Role (1) >──── Role (N) [Restrict] (自引用层级)

User (1) ─────< AuditLog (N) [Cascade]
User (1) ─────< RefreshToken (N) [无级联]
User (1) ─────< ProjectMember (N) [Cascade]
```

### 1.4 枚举类型

| 枚举名 | 值 |
|--------|-----|
| UserStatus | ACTIVE, INACTIVE, SUSPENDED |
| Permission | SYSTEM_USER_*, SYSTEM_ROLE_*, SYSTEM_FONT_*, SYSTEM_ADMIN, SYSTEM_MONITOR, SYSTEM_CONFIG_*, LIBRARY_*, STORAGE_QUOTA, PROJECT_CREATE |
| ProjectPermission | PROJECT_*, FILE_*, CAD_*, VERSION_READ |
| ProjectStatus | ACTIVE, ARCHIVED, DELETED |
| FileStatus | UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED |
| AssetStatus | ACTIVE, INACTIVE, DELETED |
| FontStatus | ACTIVE, INACTIVE, DELETED |
| AuditAction | PERMISSION_GRANT, ROLE_*, USER_*, PROJECT_*, FILE_*, ADD_MEMBER, UPDATE_MEMBER, REMOVE_MEMBER, TRANSFER_OWNERSHIP |
| ResourceType | SYSTEM, USER, ROLE, PERMISSION, PROJECT, FILE, FOLDER |
| RoleCategory | SYSTEM, PROJECT, CUSTOM |
| PolicyType | TIME, IP, DEVICE |

---

## 二、API全貌

### 2.1 Controller 总览

| Controller | 路径 | 方法数 | 核心链路 |
|------------|------|--------|----------|
| AuthController | `/api/auth` | 30+ | ✅ 核心 |
| FileSystemController | `/api/file-system` | 40+ | ✅ 核心 |
| MxCadController | `/api/mxcad` | 20+ | ✅ 核心 |
| UsersController | `/api/users` | 10+ | ✅ 核心 |
| RolesController | `/api/roles` | 10+ | ✅ 核心 |
| LibraryController | `/api/library` | 5+ | ❌ 辅助 |
| VersionControlController | `/api/version-control` | 5+ | ❌ 辅助 |
| HealthController | `/api/health` | 3+ | ❌ 辅助 |
| CacheMonitorController | `/api/cache-monitor` | 3+ | ❌ 辅助 |
| AuditLogController | `/api/audit-log` | 3+ | ❌ 辅助 |
| AdminController | `/api/admin` | 5+ | ❌ 辅助 |
| PublicFileController | `/api/public-file` | 3+ | ❌ 辅助 |
| FontsController | `/api/fonts` | 3+ | ❌ 辅助 |
| RuntimeConfigController | `/api/runtime-config` | 5+ | ❌ 辅助 |
| PolicyConfigController | `/api/policy-config` | 5+ | ❌ 辅助 |

### 2.2 核心接口详情

#### AuthController (`/api/auth`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/register` | ❌ | 用户注册 |
| POST | `/login` | ❌ | 用户名密码登录 |
| POST | `/refresh` | ❌ | 刷新Token |
| POST | `/logout` | ✅ | 登出 |
| GET | `/profile` | ✅ | 获取用户信息 |
| POST | `/send-verification` | ❌ | 发送邮箱验证码 |
| POST | `/verify-email` | ❌ | 验证邮箱 |
| POST | `/verify-email-and-register-phone` | ❌ | 邮箱验证+手机号注册 |
| POST | `/resend-verification` | ❌ | 重发验证码 |
| POST | `/bind-email-and-login` | ❌ | 绑定邮箱并登录 |
| POST | `/bind-phone-and-login` | ❌ | 绑定手机并登录 |
| POST | `/verify-phone` | ❌ | 验证手机号 |
| POST | `/forgot-password` | ❌ | 忘记密码 |
| POST | `/reset-password` | ❌ | 重置密码 |
| POST | `/bind-email` | ✅ | 发送绑定邮箱验证码 |
| POST | `/verify-bind-email` | ✅ | 验证并绑定邮箱 |
| POST | `/send-unbind-email-code` | ✅ | 发送解绑邮箱验证码 |
| POST | `/verify-unbind-email-code` | ✅ | 验证解绑邮箱验证码 |
| POST | `/rebind-email` | ✅ | 换绑邮箱 |
| POST | `/send-sms-code` | ❌ | 发送短信验证码 |
| POST | `/verify-sms-code` | ❌ | 验证短信验证码 |
| POST | `/register-phone` | ❌ | 手机号注册 |
| POST | `/login-phone` | ❌ | 手机号验证码登录 |
| POST | `/bind-phone` | ✅ | 绑定手机号 |
| POST | `/send-unbind-phone-code` | ✅ | 发送解绑手机验证码 |
| POST | `/verify-unbind-phone-code` | ✅ | 验证解绑手机验证码 |
| POST | `/rebind-phone` | ✅ | 换绑手机号 |
| POST | `/check-field` | ❌ | 检查字段唯一性 |
| GET | `/wechat/login` | ❌ | 获取微信授权URL |
| GET | `/wechat/callback` | ❌ | 微信回调 |
| POST | `/wechat/bind` | ✅ | 绑定微信 |
| POST | `/wechat/unbind` | ✅ | 解绑微信 |

**调用链路示例**:
```
AuthController.login()
  → AuthFacadeService.login()
    → LoginService.validateCredentials()
    → UsersService.findByUsername()
    → PasswordService.verify()
    → AuthTokenService.generateTokens()
    → RefreshTokenService.create()
```

#### FileSystemController (`/api/file-system`)

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/projects` | PROJECT_CREATE | 创建项目 |
| GET | `/projects` | - | 获取项目列表 |
| GET | `/projects/trash` | - | 获取已删除项目列表 |
| GET | `/projects/:projectId` | FILE_OPEN | 获取项目详情 |
| PATCH | `/projects/:projectId` | PROJECT_UPDATE | 更新项目 |
| DELETE | `/projects/:projectId` | PROJECT_DELETE | 删除项目 |
| GET | `/personal-space` | - | 获取私人空间 |
| GET | `/personal-space/by-user/:userId` | SYSTEM_USER_UPDATE | 获取指定用户私人空间 |
| GET | `/trash` | - | 获取回收站列表 |
| POST | `/trash/restore` | - | 恢复回收站项目 |
| DELETE | `/trash/items` | - | 永久删除 |
| DELETE | `/trash` | - | 清空回收站 |
| GET | `/projects/:projectId/trash` | FILE_OPEN | 获取项目内回收站 |
| POST | `/nodes/:nodeId/restore` | FILE_TRASH_MANAGE | 恢复节点 |
| DELETE | `/projects/:projectId/trash` | FILE_TRASH_MANAGE | 清空项目回收站 |
| POST | `/nodes` | - | 创建节点（项目/文件夹） |
| POST | `/nodes/:parentId/folders` | FILE_CREATE | 创建文件夹 |
| GET | `/nodes/:nodeId` | FILE_OPEN | 获取节点详情 |
| GET | `/nodes/:nodeId/root` | FILE_OPEN | 获取根节点 |
| GET | `/nodes/:nodeId/children` | FILE_OPEN | 获取子节点列表 |
| PATCH | `/nodes/:nodeId` | FILE_EDIT | 更新节点 |
| DELETE | `/nodes/:nodeId` | FILE_DELETE | 删除节点 |
| POST | `/nodes/:nodeId/move` | FILE_MOVE | 移动节点 |
| POST | `/nodes/:nodeId/copy` | FILE_COPY | 复制节点 |
| POST | `/files/upload` | FILE_UPLOAD | 上传文件 |
| GET | `/quota` | - | 获取存储配额 |
| POST | `/quota/update` | STORAGE_QUOTA | 更新配额 |
| GET | `/projects/:projectId/members` | FILE_OPEN | 获取项目成员 |
| POST | `/projects/:projectId/members` | PROJECT_MEMBER_MANAGE | 添加成员 |
| PATCH | `/projects/:projectId/members/:userId` | PROJECT_MEMBER_ASSIGN | 更新成员角色 |
| DELETE | `/projects/:projectId/members/:userId` | PROJECT_MEMBER_MANAGE | 移除成员 |
| POST | `/projects/:projectId/transfer` | PROJECT_TRANSFER | 转移所有权 |
| POST | `/projects/:projectId/members/batch` | PROJECT_MEMBER_MANAGE | 批量添加成员 |
| PATCH | `/projects/:projectId/members/batch` | PROJECT_MEMBER_ASSIGN | 批量更新成员 |
| GET | `/nodes/:nodeId/thumbnail` | 可选认证 | 获取缩略图 |
| GET | `/nodes/:nodeId/download` | FILE_DOWNLOAD | 下载节点 |
| GET | `/nodes/:nodeId/download-with-format` | FILE_DOWNLOAD | 下载（支持格式转换） |
| GET | `/projects/:projectId/permissions` | FILE_OPEN | 获取用户权限列表 |
| GET | `/projects/:projectId/permissions/check` | FILE_OPEN | 检查权限 |
| GET | `/projects/:projectId/role` | FILE_OPEN | 获取用户角色 |
| GET | `/search` | - | 统一搜索 |

**调用链路示例**:
```
FileSystemController.getChildren()
  → FileSystemService.getChildren()
    → FileTreeService.getChildren()
      → DatabaseService.fileSystemNode.findMany()
```

#### MxCadController (`/api/mxcad`)

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/files/chunkisExist` | FILE_OPEN | 检查分片是否存在 |
| POST | `/files/fileisExist` | JWT | 检查文件是否存在（秒传） |
| POST | `/files/checkDuplicate` | JWT | 检查重复文件 |
| GET | `/file/:nodeId/preloading` | FILE_OPEN | 获取预加载数据 |
| POST | `/file/:nodeId/check-reference` | - | 检查外部参照 |
| POST | `/file/:nodeId/refresh-external-references` | - | 刷新外部参照 |
| POST | `/files/uploadFiles` | JWT | 上传文件（支持分片） |
| POST | `/savemxweb/:nodeId` | CAD_SAVE | 保存mxweb到节点 |
| POST | `/save-as` | JWT | 另存为新文件 |
| POST | `/up_ext_reference_dwg/:nodeId` | CAD_EXTERNAL_REFERENCE | 上传外部参照DWG |
| POST | `/up_ext_reference_image` | - | 上传外部参照图片 |
| GET | `/thumbnail/:nodeId` | - | 检查缩略图是否存在 |
| POST | `/thumbnail/:nodeId` | - | 上传缩略图 |
| GET | `/files/:storageKey` | - | 访问非CAD文件 |
| GET | `/filesData/*path` | JWT | 访问filesData文件 |
| HEAD | `/filesData/*path` | - | 获取filesData文件信息 |
| GET | `/file/*path` | JWT | 访问转换后文件 |
| HEAD | `/file/*path` | - | 获取文件信息 |

### 2.3 权限枚举

#### SystemPermission（系统级权限）
```
SYSTEM_USER_READ, SYSTEM_USER_CREATE, SYSTEM_USER_UPDATE, SYSTEM_USER_DELETE
SYSTEM_ROLE_READ, SYSTEM_ROLE_CREATE, SYSTEM_ROLE_UPDATE, SYSTEM_ROLE_DELETE
SYSTEM_ROLE_PERMISSION_MANAGE
SYSTEM_FONT_READ, SYSTEM_FONT_UPLOAD, SYSTEM_FONT_DELETE, SYSTEM_FONT_DOWNLOAD
SYSTEM_ADMIN, SYSTEM_MONITOR
SYSTEM_CONFIG_READ, SYSTEM_CONFIG_WRITE
LIBRARY_DRAWING_MANAGE, LIBRARY_BLOCK_MANAGE
STORAGE_QUOTA, PROJECT_CREATE
```

#### ProjectPermission（项目级权限）
```
PROJECT_UPDATE, PROJECT_DELETE, PROJECT_MEMBER_MANAGE, PROJECT_MEMBER_ASSIGN
PROJECT_TRANSFER, PROJECT_ROLE_MANAGE, PROJECT_ROLE_PERMISSION_MANAGE
FILE_CREATE, FILE_UPLOAD, FILE_OPEN, FILE_EDIT, FILE_DELETE, FILE_TRASH_MANAGE
FILE_DOWNLOAD, FILE_MOVE, FILE_COPY
CAD_SAVE, CAD_EXTERNAL_REFERENCE
VERSION_READ
```

---

## 三、服务依赖全貌

### 3.1 Service 列表

| Service | 路径 | 职责 |
|---------|------|------|
| AuthFacadeService | auth/ | 认证门面服务 |
| LoginService | auth/services/ | 登录逻辑 |
| RegistrationService | auth/services/ | 注册逻辑 |
| AuthTokenService | auth/services/ | Token生成与验证 |
| SmsVerificationService | auth/services/sms/ | 短信验证 |
| EmailVerificationService | auth/services/ | 邮箱验证 |
| PasswordService | auth/services/ | 密码服务 |
| WechatService | auth/services/ | 微信登录 |
| TokenBlacklistService | auth/services/ | Token黑名单 |
| AccountBindingService | auth/services/ | 账号绑定 |
| FileSystemService | file-system/ | 文件系统门面（Facade） |
| ProjectCrudService | file-system/services/ | 项目CRUD |
| FileTreeService | file-system/services/ | 文件树操作 |
| FileOperationsService | file-system/services/ | 文件操作 |
| FileDownloadExportService | file-system/services/ | 下载导出 |
| ProjectMemberService | file-system/services/ | 项目成员 |
| StorageInfoService | file-system/services/ | 存储信息 |
| SearchService | file-system/services/ | 搜索服务 |
| PermissionService | common/services/ | 系统权限 |
| ProjectPermissionService | roles/ | 项目权限 |
| MxCadService | mxcad/ | MxCAD核心服务 |
| FileConversionService | mxcad/services/ | 文件转换 |
| ThumbnailGenerationService | mxcad/services/ | 缩略图生成 |
| ChunkUploadService | mxcad/services/ | 分片上传 |
| FileMergeService | mxcad/services/ | 文件合并 |
| SaveAsService | mxcad/services/ | 另存为 |
| ExternalRefService | mxcad/services/ | 外部参照 |
| VersionControlService | version-control/ | SVN版本控制 |
| LibraryService | library/ | 资源库服务 |
| UsersService | users/ | 用户服务 |
| RolesService | roles/ | 角色服务 |
| DatabaseService | database/ | Prisma数据库服务 |
| StorageService | storage/ | 存储服务 |
| MultiLevelCacheService | cache-architecture/ | 多级缓存 |
| CacheWarmupService | cache-architecture/ | 缓存预热 |
| PolicyEngineService | policy-engine/ | 策略引擎 |

### 3.2 服务依赖关系图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AuthFacadeService                                   │
│  ├─ LoginService                                                            │
│  ├─ RegistrationService                                                    │
│  ├─ AuthTokenService                                                        │
│  ├─ SmsVerificationService ─────────────> SmsProvider (Aliyun/Tencent)    │
│  ├─ EmailVerificationService                                                │
│  ├─ PasswordService                                                         │
│  ├─ WechatService                                                           │
│  ├─ TokenBlacklistService ──────────────> MultiLevelCacheService           │
│  └─ AccountBindingService                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FileSystemService (Facade)                           │
│  ├─ ProjectCrudService                                                     │
│  │   └─ DatabaseService                                                    │
│  ├─ FileTreeService                                                        │
│  │   └─ DatabaseService                                                    │
│  ├─ FileOperationsService                                                  │
│  │   ├─ DatabaseService                                                   │
│  │   └─ StorageService                                                    │
│  ├─ FileDownloadExportService                                              │
│  │   ├─ StorageService                                                    │
│  │   └─ FileConversionService (格式转换)                                  │
│  ├─ ProjectMemberService                                                  │
│  │   └─ DatabaseService                                                   │
│  └─ StorageInfoService                                                     │
│      └─ DatabaseService                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MxCadService                                      │
│  ├─ DatabaseService                                                        │
│  ├─ StorageService                                                         │
│  ├─ FileConversionService                                                 │
│  │   └─ MxCadAssembly (外部程序)                                           │
│  ├─ ThumbnailGenerationService                                             │
│  │   └─ MxCadAssembly                                                     │
│  ├─ ChunkUploadService                                                    │
│  ├─ FileMergeService                                                      │
│  ├─ SaveAsService                                                         │
│  │   └─ FileConversionService                                             │
│  └─ ExternalRefService                                                     │
│      └─ VersionControlService                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     VersionControlService                                   │
│  └─ SVN (svn-version-tool)                                                │
│      └─ SVN Repository (data/svn-repo)                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        PermissionService                                    │
│  ├─ DatabaseService                                                        │
│  ├─ MultiLevelCacheService                                                 │
│  │   ├─ L1 (内存)                                                         │
│  │   ├─ L2 (Redis)                                                        │
│  │   └─ L3 (数据库)                                                       │
│  └─ PermissionCacheService                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      ProjectPermissionService                                │
│  ├─ DatabaseService                                                        │
│  └─ PermissionService                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 循环依赖点分析

**已识别的循环依赖点**:
1. `PermissionService ↔ ProjectPermissionService` (通过 DatabaseService 解决)
2. `FileSystemService ↔ MxCadService` (通过事件/消息解耦)
3. `VersionControlService ↔ StorageService` (通过文件系统路径解耦)

**异步调用点**:
1. `FileConversionService.convertFileAsync()` - 异步文件转换
2. `VersionControlService` - SVN操作均为异步
3. `MultiLevelCacheService` - 缓存预热异步执行
4. `CacheWarmupService` - 启动时异步预热

---

## 四、文件存储全貌

### 4.1 存储目录结构

```
data/
├── files/                    # 主文件存储目录 (FILES_DATA_PATH)
│   ├── YYYYMM/              # 按年月分目录
│   │   └── {nodeId}/        # 每个节点一个目录
│   │       ├── {nodeId}.dwg.mxweb    # CAD文件
│   │       ├── {nodeId}.dxf.mxweb
│   │       ├── thumbnail.webp        # 缩略图
│   │       ├── thumbnail.jpg
│   │       ├── {hash}_v{revision}.mxweb  # 历史版本
│   │       └── {hash}.bin             # SVN分片文件
│   └── .svn/                # SVN工作副本
│
├── svn-repo/                # SVN仓库目录 (SVN_REPO_PATH)
│   └── {repos}/             # 多个仓库
│
├── uploads/                 # 上传临时目录 (MXCAD_UPLOAD_PATH)
│   └── chunks/             # 分片上传临时目录
│       └── {uploadId}/
│           └── {chunkIndex}
│
└── temp/                   # 临时文件目录 (MXCAD_TEMP_PATH)
    └── mxcad-history-{version}-{timestamp}/  # 历史版本转换临时目录
```

### 4.2 文件存储路径规则

| 文件类型 | 路径格式 | 示例 |
|----------|----------|------|
| CAD文件 | `{YYYYMM}/{nodeId}/{nodeId}.{ext}.mxweb` | `202405/abc123/abc123.dwg.mxweb` |
| 缩略图 | `{YYYYMM}/{nodeId}/thumbnail.{webp\|jpg\|png}` | `202405/abc123/thumbnail.webp` |
| 历史版本 | `{YYYYMM}/{nodeId}/{basename}_v{revision}.mxweb` | `202405/abc123/abc123_v78.mxweb` |
| SVN分片 | `{YYYYMM}/{nodeId}/{hash}.bin` | `202405/abc123/abc123def.bin` |
| 外部参照 | `{YYYYMM}/{nodeId}/{hash}.{ext}` | `202405/abc123/img001.jpg` |
| 上传分片 | `uploads/chunks/{uploadId}/{chunkIndex}` | `uploads/chunks/sess_abc/0` |
| 临时转换 | `temp/mxcad-history-{version}-{ts}/` | `temp/mxcad-history-78-1714567890/` |

### 4.3 文件上传→转换→存储完整数据流

```
1. 前端分片上传
   浏览器 ──分片──> MxCadController.uploadFile()
                     │
                     ▼
2. Multer 拦截器保存到临时目录
                     uploads/chunks/{uploadId}/{chunkIndex}
                     │
                     ▼
3. 权限验证 (buildContextFromRequest)
   ├─ 验证 JWT Token
   ├─ 验证用户状态
   └─ 验证项目权限
                     │
                     ▼
4. 分片合并 (ChunkUploadService.mergeChunksWithPermission)
                     │
                     ▼
5. 文件转换 (FileConversionService.convertFile)
   ├─ 调用 MxCadAssembly.exe
   ├─ 输入: .dwg/.dxf → 输出: .mxweb + .bin (SVN分片)
   └─ 生成预加载数据 JSON
                     │
                     ▼
6. 保存到存储 (StorageService / FileTreeService.createFileNode)
   ├─ 移动到 files/{YYYYMM}/{nodeId}/
   ├─ 创建数据库记录 FileSystemNode
   └─ SVN提交 (VersionControlService.commit)
                     │
                     ▼
7. 生成缩略图 (可选)
   ThumbnailGenerationService.generate()
   └─ MxCadAssembly.exe 生成 thumbnail.webp
```

### 4.4 临时目录与永久目录

| 目录 | 用途 | 清理策略 |
|------|------|----------|
| `uploads/chunks/` | 分片上传临时文件 | 上传完成后立即清理 |
| `temp/mxcad-history-*/` | 历史版本转换临时文件 | 转换完成后清理 |
| `temp/` | 其他临时文件 | 24小时后清理 |
| `files/` | 永久存储 | 永不自动清理 |
| `svn-repo/` | SVN仓库 | 永不自动清理 |

---

## 五、配置体系全貌

### 5.1 环境变量分类

#### 应用配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3001 | 后端API端口 |
| NODE_ENV | production | 运行环境 |
| FRONTEND_URL | http://localhost:3000 | 前端URL |
| FRONTEND_PORT | 3000 | 前端静态服务端口 |
| CONFIG_SERVICE_PORT | 3002 | 配置中心端口 |
| COOPERATE_URL | http://localhost:3091 | 协同服务地址 |

#### 数据库配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| DATABASE_URL | postgresql://... | Prisma连接字符串 |
| DB_HOST | localhost | 数据库主机 |
| DB_PORT | 5432 | 数据库端口 |
| DB_USERNAME | postgres | 数据库用户名 |
| DB_PASSWORD | password | 数据库密码 |
| DB_DATABASE | cloudcad | 数据库名称 |
| DB_SSL | false | 是否启用SSL |
| DB_MAX_CONNECTIONS | 20 | 最大连接数 |
| DB_CONNECTION_TIMEOUT | 30000 | 连接超时(ms) |
| DB_IDLE_TIMEOUT | 30000 | 空闲超时(ms) |

#### Redis配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| REDIS_HOST | localhost | Redis主机 |
| REDIS_PORT | 6379 | Redis端口 |
| REDIS_PASSWORD | - | Redis密码 |
| REDIS_DB | 0 | 数据库编号 |
| REDIS_MAX_RETRIES | 3 | 最大重试次数 |
| REDIS_RETRY_DELAY | 100 | 重试延迟(ms) |
| REDIS_CONNECT_TIMEOUT | 10000 | 连接超时(ms) |

#### JWT配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| JWT_SECRET | - | JWT密钥（必填） |
| JWT_EXPIRES_IN | 1h | Access Token有效期 |
| JWT_REFRESH_EXPIRES_IN | 7d | Refresh Token有效期 |

#### Session配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| SESSION_SECRET | - | Session密钥 |
| SESSION_MAX_AGE | 86400000 | 24小时有效期 |
| SESSION_NAME | mxcad.sid | Cookie名称 |
| SESSION_COOKIE_DOMAIN | - | Cookie域名 |
| SESSION_COOKIE_SAME_SITE | lax | SameSite策略 |
| SESSION_COOKIE_SECURE | true | Secure标志 |

#### 文件存储配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| FILES_DATA_PATH | data/files | 文件存储根目录 |
| SVN_REPO_PATH | data/svn-repo | SVN仓库目录 |
| FILES_NODE_LIMIT | 300000 | 单目录最大节点数 |

#### 上传配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| UPLOAD_ALLOWED_TYPES | .dwg,.dxf,.pdf,... | 允许的文件类型 |
| UPLOAD_MAX_FILES | 10 | 单次最大文件数 |
| UPLOAD_ALLOWED_EXTENSIONS | .dwg,.dxf | CAD文件扩展名 |
| UPLOAD_BLOCKED_EXTENSIONS | .exe,.bat,... | 禁止的扩展名 |
| UPLOAD_MAX_CONCURRENT | 3 | 文件转换并发数 |
| UPLOAD_CHUNK_MAX_CONCURRENT | 5 | 分片上传并发数 |

#### MxCAD配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| MXCAD_ASSEMBLY_PATH | runtime/windows/mxcad/mxcadassembly.exe | 转换程序路径 |
| MXCAD_UPLOAD_PATH | data/uploads | 上传临时目录 |
| MXCAD_TEMP_PATH | data/temp | 临时文件目录 |
| MXCAD_FILE_EXT | .mxweb | 输出文件扩展名 |
| MXCAD_COMPRESSION | true | 是否压缩 |
| FRONTEND_FONTS_PATH | packages/frontend/dist/... | 前端字体目录 |

#### 缓存配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| CACHE_L2_DEFAULT_TTL | 1800 | L2缓存TTL(秒) |
| CACHE_VERSION_MAX_AGE | 3600000 | 缓存版本有效期(ms) |
| CACHE_TTL_VERIFICATION_CODE | 900 | 验证码TTL(秒) |
| CACHE_TTL_TOKEN_BLACKLIST | 604800 | Token黑名单TTL(秒) |
| CACHE_TTL_MXCAD | 300 | MxCAD缓存TTL(秒) |
| CACHE_TTL_PERMISSION | 300 | 权限缓存TTL(秒) |
| CACHE_TTL_POLICY | 600 | 策略缓存TTL(秒) |

#### 文件限制配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| FILE_LIMIT_ZIP_MAX_TOTAL_SIZE | 2147483648 | ZIP解压最大总大小 |
| FILE_LIMIT_ZIP_MAX_FILE_COUNT | 10000 | ZIP解压最大文件数 |
| FILE_LIMIT_ZIP_MAX_DEPTH | 50 | ZIP解压最大深度 |
| FILE_LIMIT_ZIP_MAX_SINGLE_FILE_SIZE | 524288000 | ZIP单文件最大大小 |
| FILE_LIMIT_MAX_FILENAME_LENGTH | 255 | 最大文件名长度 |
| FILE_LIMIT_MAX_PATH_LENGTH | 1024 | 最大路径长度 |
| FILE_LIMIT_MAX_DIRECTORY_DEPTH | 10 | 最大目录深度 |

#### 微信登录配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| WECHAT_APP_ID | - | 微信开放平台AppID |
| WECHAT_APP_SECRET | - | 微信开放平台packagesecret |
| WECHAT_CALLBACK_URL | - | 授权回调地址 |

#### 邮件配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| MAIL_HOST | smtp.gmail.com | SMTP主机 |
| MAIL_PORT | 587 | SMTP端口 |
| MAIL_SECURE | false | 是否启用SSL |
| MAIL_USER | - | 邮箱用户名 |
| MAIL_PASS | - | 邮箱密码 |
| MAIL_FROM | - | 发件人地址 |

#### 短信配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| SMS_PROVIDER | mock | 服务商 (aliyun/tencent/mock) |
| ALIYUN_ACCESS_KEY_ID | - | 阿里云AccessKey |
| ALIYUN_ACCESS_KEY_SECRET | - | 阿里云AccessKeySecret |
| ALIYUN_SMS_SIGN_NAME | - | 阿里云短信签名 |
| ALIYUN_SMS_TEMPLATE_CODE | - | 阿里云模板ID |
| TENCENT_SECRET_ID | - | 腾讯云SecretId |
| TENCENT_SECRET_KEY | - | 腾讯云SecretKey |
| TENCENT_SMS_APP_ID | - | 腾讯云SdkAppId |
| TENCENT_SMS_SIGN_NAME | - | 腾讯云短信签名 |
| TENCENT_SMS_TEMPLATE_ID | - | 腾讯云模板ID |
| SMS_CODE_TTL | 300 | 验证码有效期(秒) |
| SMS_RATE_LIMIT_TTL | 60 | 发送频率限制(秒) |
| SMS_DAILY_LIMIT_PER_PHONE | 10 | 每手机号每日上限 |
| SMS_HOURLY_LIMIT_PER_IP | 20 | 每IP每小时上限 |

#### 缩略图配置
| 变量 | 默认值 | 说明 |
|------|--------|------|
| MXCAD_DWG2JPG_PATH | - | 缩略图转换程序路径 |
| THUMBNAIL_WIDTH | 120 | 缩略图宽度 |
| THUMBNAIL_HEIGHT | 120 | 缩略图高度 |
| THUMBNAIL_BACKGROUND_COLOR | 0x000000 | 缩略图背景色 |

### 5.2 运行时配置 (RuntimeConfig)

通过 `RuntimeConfigController` 动态管理的配置项（存储在数据库）：

| 配置项 | 类型 | 说明 |
|--------|------|------|
| upload.maxFileSize | number | 最大文件大小 |
| wechatEnabled | boolean | 是否启用微信登录 |
| smsEnabled | boolean | 是否启用短信服务 |
| mailEnabled | boolean | 是否启用邮件服务 |
| maxFileSize | object | 分文件类型的大小限制 |

---

## 六、前端状态全貌

### 6.1 Zustand Store

#### fileSystemStore (`stores/fileSystemStore.ts`)

**状态**:
```typescript
interface FileSystemState {
  currentPath: FileSystemNode[];      // 当前路径
  selectedItems: string[];             // 选中的节点ID列表
  currentParentId: string | null;     // 当前父节点ID
  personalSpaceId: string | null;     // 私人空间ID
  personalSpaceIdLoading: boolean;   // 私人空间加载状态
  viewMode: 'grid' | 'list';         // 视图模式
  sortBy: 'name' | 'date' | 'size' | 'type';  // 排序字段
  sortOrder: 'asc' | 'desc';         // 排序方向
  searchTerm: string;                 // 搜索词
  pageSize: number;                   // 分页大小
}
```

**持久化**: `pageSize`, `viewMode`, `sortBy`, `sortOrder`

### 6.2 React Context

#### ProfileContext (`pages/Profile/ProfileContext.ts`)

**提供者**: `ProfileProvider`
**用途**: Profile页面状态管理

**状态**:
```typescript
interface ProfileContextValue {
  user: User | null;
  mailEnabled: boolean;
  smsEnabled: boolean;
  wechatEnabled: boolean;
  loading: boolean;
  error: string | null;
  success: string | null;
  focusedField: string | null;
  activeTab: 'info' | 'password' | 'email' | 'deactivate' | 'phone' | 'wechat';
  showToast: (msg: string, type: 'success' | 'error') => void;
  showConfirm: (config: ConfirmConfig) => Promise<boolean>;
  navigate: NavigateFunction;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  isAdmin: () => boolean;
}
```

**依赖Context**:
- `useAuth()` - 认证状态
- `useRuntimeConfig()` - 运行时配置
- `useNotification()` - 通知
- `usePermission()` - 权限

### 6.3 自定义Hooks (file-system)

#### useFileSystem - 组合Hook

**子Hooks**:
- `useFileSystemData` - 数据加载、分页、回收站状态
- `useFileSystemSelection` - 节点选择、多选模式
- `useFileSystemCRUD` - 创建、重命名、删除、批量操作
- `useFileSystemNavigation` - 导航、下载、文件打开
- `useFileSystemSearch` - 搜索、分页控制
- `useFileSystemUI` - Toast、确认对话框
- `useFileSystemDragDrop` - 拖拽状态

**参数**:
```typescript
interface UseFileSystemOptions {
  mode?: 'project' | 'personal-space';
  personalSpaceId?: string | null;
  externalProjectId?: string | null;
  externalNodeId?: string | null;
  disableNavigation?: boolean;
  projectFilter?: 'all' | 'owned' | 'joined';
}
```

**返回值** (60+ 属性/方法):
- 模式状态: `isProjectRootMode`, `isFolderMode`, `isPersonalSpaceMode`
- 状态: `nodes`, `currentNode`, `breadcrumbs`, `loading`, `error`
- 搜索: `searchTerm`, `setSearchTerm`, `handleSearchSubmit`
- 分页: `pagination`, `setPagination`, `paginationMeta`
- 视图: `viewMode`, `setViewMode`
- 选择: `selectedNodes`, `isMultiSelectMode`, `setIsMultiSelectMode`
- Toast/Confirm: `toasts`, `showToast`, `confirmDialog`, `showConfirm`
- 操作: `handleCreateFolder`, `handleRename`, `handleDelete`, `handleMove`, `handleCopy`
- 导航: `handleEnterFolder`, `handleGoBack`, `handleFileOpen`, `handleDownload`
- 项目: `handleCreateProject`, `handleUpdateProject`, `handleDeleteProject`
- 回收站: `isTrashView`, `handleToggleTrashView`, `handleRestoreNode`

### 6.4 状态流转图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              前端状态流转                                     │
└──────────────────────────────────────────────────────────────────────────────┘

用户操作 ──> Hook事件 ──> API调用 ──> 更新Store/Context ──> UI响应

┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│ URL变化     │ ──> │ useFileSystem │ ──> │ filesApi    │ ──> │ fileSystemStore  │
│ (路由)      │     │ (组合Hook)   │     │ (Axios调用) │     │ (Zustand状态)    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────────┘
                           │
                           │ 内部调用
                           ▼
                    ┌──────────────┐
                    │ 子Hooks      │
                    ├──────────────┤
                    │useFileSystemData│
                    │useFileSystemCRUD│
                    │useFileSystemNav │
                    │useFileSystemSel│
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Trash视图    │
                    │ (isTrashView)│
                    └──────────────┘
```

### 6.5 API调用点

| Hook/组件 | API服务 | 方法 | 用途 |
|-----------|---------|------|------|
| useFileSystemData | filesApi | getChildren | 获取子节点列表 |
| useFileSystemData | filesApi | getNode | 获取节点详情 |
| useFileSystemData | filesApi | getProjects | 获取项目列表 |
| useFileSystemCRUD | filesApi | createFolder | 创建文件夹 |
| useFileSystemCRUD | filesApi | renameNode | 重命名节点 |
| useFileSystemCRUD | filesApi | deleteNode | 删除节点 |
| useFileSystemNavigation | filesApi | downloadNode | 下载文件 |
| useFileSystemNavigation | mxcadApi | getPreloadingData | 获取预加载数据 |
| useFileSystemSearch | filesApi | search | 搜索文件 |
| useLibrary | libraryApi | getLibraryItems | 获取资源库 |
| useMxCadUpload | mxcadApi | uploadFiles | 上传文件 |
| useMxCadUpload | mxcadApi | mergeChunks | 合并分片 |

---

## 七、项目特殊机制

### 7.1 多级缓存架构

```
┌─────────────────────────────────────────────────────────────┐
│                        请求                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  L1 Cache (内存)                                           │
│  - 模块级缓存，TTL: 5分钟                                   │
│  - 存储: 权限检查结果、热门数据                             │
└─────────────────────────────────────────────────────────────┘
                              │ 未命中
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  L2 Cache (Redis)                                          │
│  - 分布式缓存，TTL: 30分钟                                  │
│  - 存储: 用户会话、Token黑名单、项目权限                     │
└─────────────────────────────────────────────────────────────┘
                              │ 未命中
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  L3 Cache (数据库)                                         │
│  - CacheEntry表                                            │
│  - 存储: 配置缓存、策略缓存                                 │
└─────────────────────────────────────────────────────────────┘
                              │ 未命中
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Database (PostgreSQL)                                     │
│  - 最终数据源                                               │
│  - Role, Permission, RuntimeConfig等表                      │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 分片上传机制

```
1. 客户端分片
   文件 → 分成 N 个 chunk (如 5MB/个)

2. 检查分片
   POST /api/mxcad/files/chunkisExist
   Body: { chunk: 0, chunks: 100, hash: "abc123", ... }
   → 返回已存在的分片列表

3. 上传缺失分片
   POST /api/mxcad/files/uploadFiles (多次)
   Body: FormData { file: chunk_data, hash, chunk, chunks, ... }

4. 合并分片
   POST /api/mxcad/files/uploadFiles
   Body: { hash, name, size, chunks: 100, ... } (无file字段触发合并)

5. 文件转换
   → 调用 MxCadAssembly.exe 转换为 .mxweb
   → 生成 .bin 分片文件用于SVN版本控制

6. 保存到存储
   → 移动到 data/files/{YYYYMM}/{nodeId}/
   → 创建 FileSystemNode 记录
```

### 7.3 版本控制机制

```
文件保存流程:
1. MxCadService.saveMxwebFile()
2. FileConversionService 转换文件
3. StorageService 保存到 filesData
4. VersionControlService.commit() SVN提交
   - 添加 .bin 分片文件
   - 提交变更

历史版本访问:
1. MxCadController.getFilesDataFile(?v={revision})
2. 检查本地是否有 _v{revision}.mxweb
3. 无则调用 VersionControlService 获取分片
4. FileConversionService.convertBinToMxweb()
5. 返回历史版本文件
```

---

## 八、安全机制

### 8.1 认证机制
- **JWT Access Token**: 1小时有效期
- **Refresh Token**: 7天有效期，存储在数据库
- **Session**: 可选，支持Cookie

### 8.2 权限控制
- **系统级权限**: `RequirePermissions` 装饰器
- **项目级权限**: `RequireProjectPermission` 装饰器
- **双层权限架构**: 系统权限 + 项目权限

### 8.3 文件安全
- **路径遍历防护**: 验证文件名，禁止 `..` 等字符
- **文件类型验证**: 检查扩展名和MIME类型
- **存储配额**: `StorageQuotaInterceptor` 拦截器

---

## 九、端口与服务

| 服务 | 端口 | 说明 |
|------|------|------|
| Frontend | 5173 | React开发服务器 |
| Backend API | 3001 | NestJS后端API |
| Config Service | 3002 | 配置中心服务 |
| Cooperation Service | 3091 | WebSocket协同服务 |

---

## 十、技术栈

### 后端
- **框架**: NestJS + Express
- **ORM**: Prisma
- **数据库**: PostgreSQL
- **缓存**: Redis (L1/L2缓存)
- **文件转换**: MxCadAssembly (外部程序)
- **版本控制**: SVN (svnversion-tool)

### 前端
- **框架**: React 19
- **构建**: Vite
- **状态管理**: Zustand
- **路由**: React Router
- **样式**: Tailwind CSS
- **表单**: React Hook Form + Zod

---

*报告生成完毕*
