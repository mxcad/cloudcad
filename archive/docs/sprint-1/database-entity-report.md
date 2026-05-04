# 数据库实体关系报告

**生成时间**: 2026-05-02
**数据库**: PostgreSQL + Prisma ORM

---

## 核心业务表

### User（用户表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| email | String | 是 | - | 邮箱（唯一） |
| username | String | 否 | - | 用户名（唯一） |
| password | String | 是 | - | 密码（加密存储） |
| nickname | String | 是 | - | 昵称 |
| avatar | String | 是 | - | 头像URL |
| roleId | String | 否 | - | 关联角色ID |
| status | UserStatus | 否 | INACTIVE | 用户状态 |
| emailVerified | Boolean | 否 | false | 邮箱是否验证 |
| emailVerifiedAt | DateTime | 是 | - | 邮箱验证时间 |
| phone | String | 是 | - | 手机号（唯一） |
| phoneVerified | Boolean | 否 | false | 手机是否验证 |
| phoneVerifiedAt | DateTime | 是 | - | 手机验证时间 |
| wechatId | String | 是 | - | 微信ID（唯一） |
| provider | String | 否 | "LOCAL" | 认证提供商 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |
| deletedAt | DateTime | 是 | - | 软删除时间 |
| lastUsernameChangeAt | DateTime | 是 | - | 用户名最后修改时间 |
| usernameChangeCount | Int | 否 | 0 | 用户名修改次数 |

**索引**: `[deletedAt]`

---

### Role（角色表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| name | String | 否 | - | 角色名称 |
| description | String | 是 | - | 角色描述 |
| parentId | String | 是 | - | 父角色ID（层级结构） |
| category | RoleCategory | 否 | SYSTEM | 角色分类 |
| level | Int | 否 | 0 | 角色级别 |
| isSystem | Boolean | 否 | false | 是否系统角色 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

**索引**: `[parentId]`, `[category]`, `[level]`

**关系**: 自引用层级关系（parentId → Role.id, onDelete: Restrict）

---

### RolePermission（角色权限关联表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| roleId | String | 否 | - | 角色ID |
| permission | Permission | 否 | - | 系统权限枚举 |
| createdAt | DateTime | 否 | now() | 创建时间 |

**索引**: `[roleId, permission]` (复合唯一)

---

### FileSystemNode（文件系统节点表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| name | String | 否 | - | 节点名称 |
| isFolder | Boolean | 否 | false | 是否文件夹 |
| isRoot | Boolean | 否 | false | 是否根节点 |
| parentId | String | 是 | - | 父节点ID |
| originalName | String | 是 | - | 原始文件名 |
| path | String | 是 | - | 完整路径 |
| size | Int | 是 | - | 文件大小（字节） |
| mimeType | String | 是 | - | MIME类型 |
| extension | String | 是 | - | 文件扩展名 |
| fileStatus | FileStatus | 是 | - | 文件状态 |
| fileHash | String | 是 | - | 文件哈希值 |
| description | String | 是 | - | 描述 |
| projectStatus | ProjectStatus | 是 | - | 项目状态 |
| personalSpaceKey | String | 是 | - | 个人空间唯一键 |
| libraryKey | String | 是 | - | 图库键 |
| hasMissingExternalReferences | Boolean | 否 | false | 是否有缺失外部引用 |
| missingExternalReferencesCount | Int | 否 | 0 | 缺失外部引用数量 |
| externalReferencesJson | String | 是 | - | 外部引用JSON |
| ownerId | String | 否 | - | 所有者用户ID |
| projectId | String | 是 | - | 所属项目ID |
| storageQuota | Int | 是 | 0 | 存储配额 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |
| deletedAt | DateTime | 是 | - | 软删除时间 |
| deletedByCascade | Boolean | 否 | false | 是否级联删除 |
| deletedFromStorage | DateTime | 是 | - | 从存储删除时间 |

**索引**: `[parentId]`, `[ownerId]`, `[isRoot]`, `[isFolder]`, `[deletedAt]`, `[personalSpaceKey]`, `[libraryKey]`, `[projectId]`, `[storageQuota]`

**唯一约束**: `unique_personal_space` on `[personalSpaceKey]`

---

### ProjectRole（项目角色表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| projectId | String | 是 | - | 所属项目ID |
| name | String | 否 | - | 角色名称 |
| description | String | 是 | - | 角色描述 |
| isSystem | Boolean | 否 | false | 是否系统角色 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

**索引**: `[projectId]`

**唯一约束**: `[projectId, name]`

---

### ProjectRolePermission（项目角色权限关联表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| projectRoleId | String | 否 | - | 项目角色ID |
| permission | ProjectPermission | 否 | - | 项目权限枚举 |
| createdAt | DateTime | 否 | now() | 创建时间 |

**索引**: `[projectRoleId, permission]` (复合唯一)

---

### ProjectMember（项目成员关联表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| projectId | String | 否 | - | 项目ID |
| userId | String | 否 | - | 用户ID |
| projectRoleId | String | 否 | - | 项目角色ID |
| createdAt | DateTime | 否 | now() | 创建时间 |

**索引**: `[userId]`, `[projectRoleId]`, `[projectId]`

**唯一约束**: `[projectId, userId]`

---

### Asset（资源表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| name | String | 否 | - | 资源名称 |
| description | String | 是 | - | 资源描述 |
| category | String | 否 | - | 资源分类 |
| path | String | 否 | - | 资源路径 |
| thumbnail | String | 是 | - | 缩略图路径 |
| size | Int | 否 | - | 资源大小 |
| mimeType | String | 否 | - | MIME类型 |
| status | AssetStatus | 否 | ACTIVE | 资源状态 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

---

### Font（字体表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| name | String | 否 | - | 字体名称 |
| family | String | 否 | - | 字体系列 |
| path | String | 否 | - | 字体文件路径 |
| size | Int | 否 | - | 字体文件大小 |
| status | FontStatus | 否 | ACTIVE | 字体状态 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

---

## 辅助表（日志、缓存、配置）

### AuditLog（审计日志表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| action | AuditAction | 否 | - | 操作类型 |
| resourceType | ResourceType | 否 | - | 资源类型 |
| resourceId | String | 是 | - | 资源ID |
| userId | String | 否 | - | 操作用户ID |
| details | String | 是 | - | 详细信息 |
| ipAddress | String | 是 | - | IP地址 |
| userAgent | String | 是 | - | 用户代理 |
| success | Boolean | 否 | - | 是否成功 |
| errorMessage | String | 是 | - | 错误信息 |
| createdAt | DateTime | 否 | now() | 创建时间 |

**索引**: `[userId]`, `[resourceType, resourceId]`, `[createdAt]`, `[action]`

---

### RefreshToken（刷新令牌表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| token | String | 否 | - | 刷新令牌（唯一） |
| userId | String | 否 | - | 用户ID |
| expiresAt | DateTime | 否 | - | 过期时间 |
| createdAt | DateTime | 否 | now() | 创建时间 |

---

### UploadSession（上传会话表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| uploadId | String | 否 | - | 上传ID（唯一） |
| storageKey | String | 否 | - | 存储键 |
| fileName | String | 否 | - | 文件名 |
| fileSize | Int | 否 | - | 文件大小 |
| fileId | String | 是 | - | 文件ID |
| projectId | String | 是 | - | 项目ID |
| parentId | String | 是 | - | 父节点ID |
| ownerId | String | 否 | - | 所有者ID |
| status | String | 否 | "INITIATED" | 上传状态 |
| totalParts | Int | 是 | - | 总分片数 |
| uploadedParts | Int | 否 | 0 | 已上传分片数 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

---

### CacheEntry（缓存条目表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| key | String | 否 | - | 缓存键（唯一） |
| value | String | 否 | - | 缓存值 |
| expiresAt | DateTime | 是 | - | 过期时间 |
| lastAccessedAt | DateTime | 否 | now() | 最后访问时间 |
| accessCount | Int | 否 | 0 | 访问次数 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

**索引**: `[expiresAt]`, `[lastAccessedAt]`, `[accessCount]`

---

### PermissionPolicy（权限策略表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| type | PolicyType | 否 | - | 策略类型 |
| name | String | 否 | - | 策略名称 |
| description | String | 是 | - | 策略描述 |
| config | Json | 否 | - | 策略配置 |
| enabled | Boolean | 否 | true | 是否启用 |
| priority | Int | 否 | 0 | 优先级 |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

**索引**: `[type]`, `[enabled]`, `[priority]`

---

### PolicyPermission（策略权限关联表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| policyId | String | 否 | - | 策略ID |
| permission | Permission | 否 | - | 权限枚举 |
| createdAt | DateTime | 否 | now() | 创建时间 |

**索引**: `[policyId, permission]` (复合唯一), `[permission]`

---

### RuntimeConfig（运行时配置表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| key | String | 否 | - | 配置键（唯一） |
| value | String | 否 | - | 配置值 |
| type | String | 否 | - | 配置类型 |
| category | String | 否 | - | 配置分类 |
| description | String | 是 | - | 配置描述 |
| isPublic | Boolean | 否 | false | 是否公开 |
| updatedBy | String | 是 | - | 更新者ID |
| createdAt | DateTime | 否 | now() | 创建时间 |
| updatedAt | DateTime | 否 | - | 更新时间 |

**索引**: `[category]`

---

### RuntimeConfigLog（运行时配置变更日志表）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | String | 否 | cuid() | 主键 |
| key | String | 否 | - | 配置键 |
| oldValue | String | 是 | - | 旧值 |
| newValue | String | 否 | - | 新值 |
| operatorId | String | 是 | - | 操作者ID |
| operatorIp | String | 是 | - | 操作者IP |
| createdAt | DateTime | 否 | now() | 创建时间 |

**索引**: `[key]`, `[createdAt]`

---

## 外键关系

### 层级关系

| 关系 | 说明 | onDelete |
|------|------|----------|
| User.roleId → Role.id | 用户关联角色 | Restrict |
| Role.parentId → Role.id | 角色自引用层级 | Restrict |
| FileSystemNode.parentId → FileSystemNode.id | 文件节点层级（父子） | Cascade |
| FileSystemNode.ownerId → User.id | 文件所有者 | Cascade |
| FileSystemNode.projectId → FileSystemNode.id | 项目关联（项目根节点） | Cascade |

### 权限关系

| 关系 | 说明 | onDelete |
|------|------|----------|
| RolePermission.roleId → Role.id | 角色权限关联 | Cascade |
| ProjectRole.projectId → FileSystemNode.id | 项目角色关联项目 | Cascade |
| ProjectRolePermission.projectRoleId → ProjectRole.id | 项目角色权限关联 | Cascade |
| ProjectMember.projectId → FileSystemNode.id | 项目成员关联项目 | Cascade |
| ProjectMember.userId → User.id | 项目成员关联用户 | Cascade |
| ProjectMember.projectRoleId → ProjectRole.id | 成员关联项目角色 | Restrict |
| PolicyPermission.policyId → PermissionPolicy.id | 策略权限关联 | Cascade |

### 审计关系

| 关系 | 说明 | onDelete |
|------|------|----------|
| AuditLog.userId → User.id | 审计日志关联用户 | Cascade |

---

## 索引汇总

### User 表
- `[deletedAt]`

### Role 表
- `[parentId]` - 外键索引
- `[category]` - 查询频繁字段
- `[level]` - 排序字段

### FileSystemNode 表
- `[parentId]` - 外键索引
- `[ownerId]` - 外键索引
- `[isRoot]` - 查询频繁字段
- `[isFolder]` - 查询频繁字段
- `[deletedAt]` - 软删除索引
- `[personalSpaceKey]` - 唯一约束
- `[libraryKey]` - 图库查询
- `[projectId]` - 外键索引
- `[storageQuota]` - 配额查询

### ProjectMember 表
- `[userId]` - 外键索引
- `[projectRoleId]` - 外键索引
- `[projectId]` - 外键索引
- `[projectId, userId]` - 复合唯一约束

### ProjectRole 表
- `[projectId]` - 外键索引
- `[projectId, name]` - 复合唯一约束

### AuditLog 表
- `[userId]` - 外键索引
- `[resourceType, resourceId]` - 复合索引（资源查询）
- `[createdAt]` - 时间排序
- `[action]` - 操作类型查询

### CacheEntry 表
- `[expiresAt]` - 过期清理
- `[lastAccessedAt]` - 访问统计
- `[accessCount]` - 热度统计

### RuntimeConfigLog 表
- `[key]` - 配置变更查询
- `[createdAt]` - 时间排序

---

## 潜在问题与建议

### 1. 冗余字段分析

#### FileSystemNode 表字段过多
- `hasMissingExternalReferences` 和 `missingExternalReferencesCount` 可以考虑拆分到单独的 `ExternalReference` 表
- `externalReferencesJson` 存储JSON字符串，建议使用独立的关联表以便查询

#### User 表验证字段分散
- `emailVerified` + `emailVerifiedAt` 和 `phoneVerified` + `phoneVerifiedAt` 可考虑抽象为通用的 `Verification` 表

#### 建议拆分表

| 原表 | 建议 | 原因 |
|------|------|------|
| FileSystemNode | ExternalReference | 外部引用信息独立管理，支持多引用查询 |
| User | UserVerification | 统一管理多渠道验证信息 |
| FileSystemNode | FileMetadata | 文件元数据（hash, mimeType, size等）独立存储 |

### 2. 缺失索引

| 表 | 建议添加索引 | 原因 |
|----|-------------|------|
| ProjectMember | `[userId, projectId]` | 用户参与的项目查询 |
| AuditLog | `[userId, createdAt]` | 用户操作历史查询 |
| FileSystemNode | `[ownerId, isFolder]` | 用户文件夹查询 |
| FileSystemNode | `[ownerId, deletedAt]` | 用户已删除文件查询 |

### 3. 外键约束问题

| 关系 | 当前行为 | 建议 |
|------|----------|------|
| ProjectMember.projectRoleId → ProjectRole | Restrict | 合理，有成员时不允许删除角色 |
| Role.parentId → Role | Restrict | 合理，防止循环依赖 |

### 4. 表分类总结

| 分类 | 表 |
|------|---|
| **核心业务表** | User, Role, RolePermission, FileSystemNode, ProjectRole, ProjectRolePermission, ProjectMember |
| **资源管理表** | Asset, Font |
| **会话/令牌表** | RefreshToken, UploadSession |
| **审计日志表** | AuditLog |
| **缓存配置表** | CacheEntry, PermissionPolicy, PolicyPermission, RuntimeConfig, RuntimeConfigLog |

---

## 枚举类型定义

### UserStatus
```
ACTIVE, INACTIVE, SUSPENDED
```

### Permission（系统权限）
```
SYSTEM_USER_READ, SYSTEM_USER_CREATE, SYSTEM_USER_UPDATE, SYSTEM_USER_DELETE
SYSTEM_ROLE_READ, SYSTEM_ROLE_CREATE, SYSTEM_ROLE_UPDATE, SYSTEM_ROLE_DELETE, SYSTEM_ROLE_PERMISSION_MANAGE
SYSTEM_FONT_READ, SYSTEM_FONT_UPLOAD, SYSTEM_FONT_DELETE, SYSTEM_FONT_DOWNLOAD
SYSTEM_ADMIN, SYSTEM_MONITOR, SYSTEM_CONFIG_READ, SYSTEM_CONFIG_WRITE
LIBRARY_DRAWING_MANAGE, LIBRARY_BLOCK_MANAGE, STORAGE_QUOTA, PROJECT_CREATE
```

### ProjectPermission（项目权限）
```
PROJECT_UPDATE, PROJECT_DELETE, PROJECT_MEMBER_MANAGE, PROJECT_MEMBER_ASSIGN
PROJECT_TRANSFER, PROJECT_ROLE_MANAGE, PROJECT_ROLE_PERMISSION_MANAGE
FILE_CREATE, FILE_UPLOAD, FILE_OPEN, FILE_EDIT, FILE_DELETE, FILE_TRASH_MANAGE
FILE_DOWNLOAD, FILE_MOVE, FILE_COPY, CAD_SAVE, CAD_EXTERNAL_REFERENCE, VERSION_READ
```

### ProjectStatus
```
ACTIVE, ARCHIVED, DELETED
```

### FileStatus
```
UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED
```

### AssetStatus / FontStatus
```
ACTIVE, INACTIVE, DELETED
```

### AuditAction
```
PERMISSION_GRANT, PERMISSION_REVOKE
ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE
USER_LOGIN, USER_LOGOUT
PROJECT_CREATE, PROJECT_DELETE
FILE_UPLOAD, FILE_DOWNLOAD, FILE_DELETE, FILE_SHARE
ADD_MEMBER, UPDATE_MEMBER, REMOVE_MEMBER, TRANSFER_OWNERSHIP
```

### ResourceType
```
SYSTEM, USER, ROLE, PERMISSION, PROJECT, FILE, FOLDER
```

### RoleCategory
```
SYSTEM, PROJECT, CUSTOM
```

### PolicyType
```
TIME, IP, DEVICE
```
