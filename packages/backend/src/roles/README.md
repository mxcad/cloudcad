# CloudCAD 角色模块（Roles）

## 概述

`roles` 模块是 CloudCAD 双层权限系统中两个层级的角色管理实现：

- **系统角色（后台管理）**：管理后台用户的 `Role` 模型（增删改查、权限分配），配合 `permission` 模块的 `RoleInheritanceService` 实现角色继承与系统权限检查（`SYSTEM_ROLE_*`、`SYSTEM_USER_*` 等）。
- **项目角色（项目/文件域）**：管理 `ProjectRole` 模型（系统默认角色 + 项目自定义角色），通过 `ProjectMember → ProjectRole → ProjectRolePermission` 三级模型实现项目内权限控制（`PROJECT_*`、`FILE_*`、`CAD_*`、`VERSION_READ` 等），是 `RequireProjectPermissionGuard` 与 `@RequireProjectPermission()` 装饰器的权限来源。

模块对外提供三个核心服务：`RolesService`（系统角色）、`ProjectRolesService`（项目角色）、`ProjectPermissionService`（项目权限检查，通过 `IPROJECT_PERMISSION_SERVICE` token 注入）。

## 目录结构

```
src/roles/
├── roles.module.ts                      # 模块定义与 DI 注册
├── roles.controller.ts                  # REST 控制器（17 个端点）
├── roles.service.ts                     # 系统角色业务逻辑
├── project-roles.service.ts             # 项目角色业务逻辑
├── project-permission.service.ts        # 项目权限检查服务（缓存 + 可替换存储）
├── dto/
│   ├── role.dto.ts                      # RoleDto / ProjectRoleDto / ProjectRolePermissionDto
│   ├── create-role.dto.ts               # 创建系统角色
│   ├── update-role.dto.ts               # 更新系统角色（PartialType）
│   ├── create-project-role.dto.ts       # 创建项目角色
│   ├── update-project-role.dto.ts       # 更新项目角色
│   └── permissions.dto.ts               # 权限列表请求体（项目角色分配/移除用）
├── interfaces/
│   └── project-permission-service.interface.ts  # IProjectPermissionService 契约（strictNullChecks）
├── providers/
│   └── prisma-permission-store.ts       # IPermissionStore 的 Prisma 实现（可替换）
└── *.spec.ts                            # 三个服务各自的单元测试
```

## 模块注册（roles.module.ts）

```typescript
imports: [CommonModule, AuditLogModule, ConfigModule, FileTreeModule, PermissionModule]
controllers: [RolesController]
providers: [
  RolesService,
  ProjectPermissionService,          // 同时以 IPROJECT_PERMISSION_SERVICE token 提供
  ProjectRolesService,
  RequireProjectPermissionGuard,
  NodeContextResolver,
  PrismaPermissionStore,             // 同时以 IPERMISSION_STORE token 提供
]
exports: [RolesService, ProjectPermissionService, IPROJECT_PERMISSION_SERVICE,
          ProjectRolesService, RequireProjectPermissionGuard, IPERMISSION_STORE, NodeContextResolver]
```

关键点：

- **可替换存储**：`IPERMISSION_STORE` token 按 `process.env.PERMISSION_STORE` 选择实现，默认 `prisma`（`PrismaPermissionStore`），符合可替换模块设计（ADR-0020）。`ProjectPermissionService` 通过 `@Optional()` 注入该 token——存在时直接委托给外部存储，否则走内置 Prisma + 缓存逻辑。
- **接口 + DI token**：`IPROJECT_PERMISSION_SERVICE` 是项目权限检查的唯一入口，`RequireProjectPermissionGuard` 依赖此 token 而非具体类。
- 导出的 Guard / Resolver 供其他模块复用项目级权限检查。

## 核心组件详解

### 1. RolesService — 系统角色

管理后台 `Role` 表，特点：

- **内存缓存**：`findAll()` 结果缓存于实例级 `rolesCache`，任何写操作后 `clearRolesCache()` 并调用 `cacheService.cleanup()` 清理用户权限缓存。
- **系统角色保护**：`isSystem` 角色禁止删除；`update()` 中若尝试修改系统角色的 name/description/category/level（值实际变化时）抛 `BadRequestException`。
- **删除约束**：角色正被用户使用（`_count.users > 0`）时拒绝删除。
- **权限校验**：写操作前经 `isValidPermission()` 校验（支持大小写），数据库存大写格式；`update()` 的 `permissions` 是**全量替换**（deleteMany + create）。
- **创建**：新角色固定 `isSystem: false`，`category` 默认 `CUSTOM`，`level` 默认 0；权限变更后调用 `cacheService.clearRoleCache(role.name)` 定向失效。

### 2. ProjectRolesService — 项目角色

管理 `ProjectRole` 表，两种形态（ADR-0051 模板化）：

- **项目角色模板**（`isSystem: true`，`projectId: null`）：OWNER / ADMIN / EDITOR / MEMBER / VIEWER 五个默认模板由初始化播种创建（`DEFAULT_PROJECT_ROLE_PERMISSIONS` 映射），**可增删**（OWNER 模板保底不可删、模板名不可改），由系统管理员在"角色权限"页维护；**只影响新建项目**。
- **项目角色**（绑定 `projectId`）：项目创建时 `copyTemplatesToProject()` 在事务内复制模板（含权限）为项目自己的角色，owner 成员挂项目副本；**项目内完全自治**（可增删改，含改名）。名称在项目内唯一（DB 层 `@@unique([projectId, name])`）。

业务规则：

- **项目所有者角色保护（数据驱动）**：删除时查 `FileSystemNode.ownerId` 对应成员的 `projectRoleId`，所有者使用的角色不可删除（不依赖角色名，项目内可改名）；`findByProject` 返回的 DTO 带 `isOwnerRole` 标记。
- **删除在用角色 → 成员自动降级**：优先 `PROJECT_MEMBER` 名字角色 → 任一非所有者角色 → 都没有则拒绝（`findDemoteTarget`）。
- 模板变更**不再全量清权限缓存**（副本已独立，`invalidateRoleCache` 只清项目维度）。
- 私人空间（"我的图纸"）与公开资源库**零角色**：权限分别按 `ownerId`（PersonalPermissionStrategy）与系统权限（`LIBRARY_*_MANAGE`）判断，不建成员/角色。
- 权限方法：`assignPermissions`（createMany + skipDuplicates）、`removePermissions`（deleteMany + in）、`updatePermissions`（先清空再全量分配）。
- 控制器层已通过 `@RequirePermissions` 完成系统权限检查，Service 内部注释明确不再重复鉴权。
- 旧 `RolesController` 的 `/roles/project-roles*` 端点保留为**模板管理入口**（`SYSTEM_ROLE_*` 权限，仅操作 `projectId: null` 角色）。

### 3. ProjectPermissionService — 项目权限检查

实现 `IProjectPermissionService`（`interfaces/project-permission-service.interface.ts`），与系统权限完全解耦。缓存键与 TTL（来自 `common/constants/cache.constants.ts`）：

| 缓存键 | 内容 | TTL |
|--------|------|-----|
| `project:permission:{userId}:{projectId}:{permission}` | 单项权限结果 | 5 分钟（PROJECT_PERMISSION） |
| `project:owner:{userId}:{projectId}` | 是否项目所有者 | 10 分钟（PROJECT_OWNER） |
| `project:role:{userId}:{projectId}` | 成员的项目角色 | 5 分钟（PROJECT_MEMBER_ROLE） |

- **所有者判定**：`FileSystemNode.ownerId === userId`（项目即文件树节点），所有者不自动放行权限——所有用户一律按角色权限验证（代码注释明确）。
- `checkAnyPermission` / `checkAllPermissions` 并行批量检查（OR / AND 语义）。
- 存在 `IPermissionStore` 注入时所有方法委托给它（当前默认 `PrismaPermissionStore`，逻辑与内置一致）。
- `clearUserCache` 按规范键名逐一清除（含全部 `ProjectPermission` 枚举值的权限键），角色/成员变更后由调用方触发。
- 权限检查不记审计日志（避免日志过多）。

### 4. PrismaPermissionStore（providers/）

`IPermissionStore` 的 Prisma 实现，同时覆盖系统权限与项目权限：`getUserSystemPermissions`（经 `RoleInheritanceService` 含继承）、`checkSystemPermission`、`getUserProjectPermissions`、`checkProjectPermission`、`getUserProjectRole`、`isProjectOwner`、`clearUserCache`、`clearProjectCache`，全部带缓存。

### 5. 守卫（依赖注入于本模块）

- `RequireProjectPermissionGuard`：读取 `@RequireProjectPermission()` 元数据，经 `NodeContextResolver` 从请求解析节点上下文并调用 `IProjectPermissionService` 检查；项目所有者自动通过；支持 AND/OR 模式与公开资源库节点豁免。
- 控制器还挂载了全局性的 `RolesGuard` 与 `PermissionsGuard`（配合 `@RequirePermissions` 做系统权限检查）。

## API 端点

路由前缀 `roles`，全部端点 `@ApiBearerAuth()` 且受 `RolesGuard`、`RequireProjectPermissionGuard`、`PermissionsGuard` 三重守卫保护。

### 系统角色

| 方法 | 路径 | 权限（@RequirePermissions） | 描述 |
|------|------|----------------------------|------|
| GET | `/roles` | `SYSTEM_ROLE_READ` | 获取所有角色（内存缓存） |
| GET | `/roles/:id` | `SYSTEM_ROLE_READ` | 按 ID 获取角色 |
| GET | `/roles/:id/permissions` | `SYSTEM_ROLE_READ` | 获取角色权限（DB 原始大写值） |
| POST | `/roles` | `SYSTEM_ROLE_CREATE` | 创建自定义角色（201） |
| PATCH | `/roles/:id` | `SYSTEM_ROLE_UPDATE` | 更新角色（permissions 全量替换） |
| DELETE | `/roles/:id` | `SYSTEM_ROLE_DELETE` | 删除角色（200，返回 i18n 消息） |
| POST | `/roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 追加权限（body: `{ permissions: string[] }`） |
| DELETE | `/roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 移除权限（body: `{ permissions: string[] }`） |

### 项目角色

> 两个 Controller 分工（#262/#298）：
> - **项目自定义角色 CRUD**（`project-roles.controller.ts`，路由前缀 `projects`）：`POST/PATCH/DELETE /projects/:projectId/project-roles[/:id]`，权限为项目级 `PROJECT_ROLE_MANAGE` / `PROJECT_ROLE_PERMISSION_MANAGE`（`@RequireProjectPermission`），项目所有者与项目管理员（含默认 ADMIN 角色）可操作；`projectId` 一律取自 URL 路径（body 中的 projectId 被忽略，防跨项目越权）。
> - **旧 `/roles/project-roles/*` 端点**（`roles.controller.ts`）保留但仅限系统角色：`POST /roles/project-roles` 对非空 `projectId` 抛 403（#298 方案 A），自定义项目角色只能经项目端点管理。

| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| GET | `/roles/project-roles/all` | `SYSTEM_ROLE_READ` | 所有项目角色（含项目信息与成员数） |
| GET | `/roles/project-roles/system` | `SYSTEM_ROLE_READ` | 仅系统默认项目角色 |
| GET | `/roles/project-roles/project/:projectId` | `FILE_OPEN`（`@RequireProjectPermission`） | 项目角色 + 系统角色并集（项目成员可查看，2febfe8f） |
| GET | `/roles/project-roles/:id/permissions` | `SYSTEM_ROLE_READ` | 项目角色的权限列表 |
| POST | `/roles/project-roles` | `SYSTEM_ROLE_CREATE` | 创建系统级项目角色（201；**body 带非空 projectId 时 403**） |
| PATCH | `/roles/project-roles/:id` | `SYSTEM_ROLE_UPDATE` | 更新项目角色（permissions 全量替换） |
| DELETE | `/roles/project-roles/:id` | `SYSTEM_ROLE_DELETE` | 删除项目角色（200） |
| POST | `/roles/project-roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 分配权限（body: PermissionsDto） |
| DELETE | `/roles/project-roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 移除权限（body: PermissionsDto） |
| POST | `/projects/:projectId/project-roles` | `PROJECT_ROLE_MANAGE`（项目级） | 创建项目自定义角色（201） |
| PATCH | `/projects/:projectId/project-roles/:id` | `PROJECT_ROLE_MANAGE` + `PROJECT_ROLE_PERMISSION_MANAGE`（项目级） | 更新项目自定义角色（body 支持 permissions 全量替换） |
| DELETE | `/projects/:projectId/project-roles/:id` | `PROJECT_ROLE_MANAGE`（项目级） | 删除项目自定义角色（200） |

> 注意：`@Get(':id')` 与 `@Get('project-roles/all')` 等路由并存，NestJS 按注册顺序匹配，`project-roles/*` 子路由需在 `:id` 之后定义以保证优先匹配——实际代码即按此顺序书写。

## 角色与权限模型

### 枚举（common/enums/permissions.enum.ts，权限枚举源自 @cloudcad/db Prisma schema）

**角色类别 `RoleCategory`**：`SYSTEM` / `PROJECT`（暂未实现）/ `CUSTOM`

**系统角色 `SystemRole`**（用户表 `role` 字段）：`ADMIN`（全部系统权限，不含 `AUDIT_ADMIN`，#321 三权分立）、`AUDIT_ADMIN`（审计数据查询/导出/清理）、`USER_MANAGER`（用户+角色管理）、`FONT_MANAGER`（字体库管理）、`USER`（基础，仅 `PROJECT_CREATE`）
- 直接权限映射：`SYSTEM_ROLE_PERMISSIONS`；继承链：`SYSTEM_ROLE_HIERARCHY`（AUDIT_ADMIN、USER_MANAGER、FONT_MANAGER 继承 USER）

**项目角色 `ProjectRole`**：`PROJECT_OWNER`、`PROJECT_ADMIN`、`PROJECT_EDITOR`、`PROJECT_MEMBER`、`PROJECT_VIEWER`（默认权限见 `DEFAULT_PROJECT_ROLE_PERMISSIONS`；VIEWER 仅 `FILE_OPEN`、`FILE_DOWNLOAD`、`VERSION_READ`）

**系统权限 `SystemPermission`**（26 项）：`SYSTEM_USER_READ/CREATE/UPDATE/DELETE/MEMBERSHIP_MANAGE`、`SYSTEM_ROLE_READ/CREATE/UPDATE/DELETE/PERMISSION_MANAGE`、`SYSTEM_FONT_READ/UPLOAD/DELETE/DOWNLOAD`、`SYSTEM_ADMIN`、`AUDIT_ADMIN`、`SYSTEM_BILLING_READ/WRITE`、`SYSTEM_MONITOR`、`SYSTEM_CONFIG_READ/WRITE`、`SYSTEM_IP_BLACKLIST_MANAGE`、`SYSTEM_IP_WHITELIST_MANAGE`、`LIBRARY_DRAWING_MANAGE`、`LIBRARY_BLOCK_MANAGE`、`PROJECT_CREATE`

**项目权限 `ProjectPermission`**（20 项）：`PROJECT_UPDATE/DELETE/MEMBER_MANAGE/MEMBER_ASSIGN/TRANSFER/PROJECT_ROLE_MANAGE/PROJECT_ROLE_PERMISSION_MANAGE`、`FILE_CREATE/UPLOAD/OPEN/EDIT/DELETE/TRASH_MANAGE/DOWNLOAD/SHARE/MOVE/COPY`、`CAD_SAVE`、`CAD_EXTERNAL_REFERENCE`、`VERSION_READ`

### 数据模型（packages/db/prisma/schema.prisma）

```prisma
model Role {                 // 系统角色（后台管理）
  id, name(@@unique), description?, parentId?, category(@default(SYSTEM)),
  level(@default(0)), isSystem(@default(false)), permissions RolePermission[], users User[]
  // 自关联 RoleHierarchy（parentId）
}
model RolePermission {       // roleId + permission(@@unique[roleId, permission])，级联删除
}
model ProjectRole {          // 项目角色
  id, projectId?(FileSystemNode? 级联), name, description?, isSystem(@default(false)),
  members ProjectMember[], permissions ProjectRolePermission[]
  @@unique([projectId, name])
}
model ProjectRolePermission { // projectRoleId + permission(@@unique)，级联删除
}
model ProjectMember {        // 项目成员（项目-用户-角色三元组）
  projectId, userId, projectRoleId
  @@unique([projectId, userId])
}
```

- 项目本身是 `FileSystemNode`（`nodeType: PROJECT`），所有者字段 `ownerId` 用于 `isProjectOwner` 判定。
- 权限值以枚举（大写）形式存储在 `RolePermission.permission` / `ProjectRolePermission.permission` 列。

## 与双层权限系统（permission-system）的关系

| 维度 | 系统权限层 | 项目权限层 |
|------|-----------|-----------|
| 用户归属 | `User.role`（SystemRole） | `ProjectMember`（含 projectRoleId） |
| 角色表 | `Role` | `ProjectRole` |
| 权限表 | `RolePermission` | `ProjectRolePermission` |
| 权限枚举 | `SystemPermission`（SYSTEM_*） | `ProjectPermission`（PROJECT_*/FILE_*/CAD_*/VERSION_READ） |
| 检查入口 | `IPermissionService` / `RolesGuard` + `PermissionsGuard` + `@RequirePermissions` | `IProjectPermissionService`（本项目）+ `RequireProjectPermissionGuard` + `@RequireProjectPermission` |
| 继承 | `RoleInheritanceService`（SYSTEM_ROLE_HIERARCHY） | 无继承，角色直接挂权限 |
| 本模块职责 | 系统角色 CRUD + 权限分配 | 项目角色 CRUD + 权限分配 + 项目权限检查 |

系统权限的**检查**由 `permission` 模块负责（本模块通过 `PermissionModule` 引入 `PermissionCacheService` 做缓存联动）；本模块负责**角色与权限的管理**，以及项目权限的**检查服务**实现。`IPERMISSION_STORE` 可替换扩展点（当前默认 `PrismaPermissionStore`）支持 OSS/Pro/Enterprise 各自实现。

## 测试

| 文件 | 覆盖范围 |
|------|---------|
| `roles.service.spec.ts`（418 行） | findAll/findByCategory/findOne、create、update（含系统角色改名拦截）、remove（含在用角色拦截）、add/remove/getRolePermissions，含 NotFound/BadRequest 分支 |
| `project-roles.service.spec.ts`（约 460 行） | 角色 CRUD、系统角色保护、名称冲突、findOne 按 ID/name 兼容、权限分配/移除/更新，含 DB 错误分支 |
| `project-permission.service.spec.ts`（约 390 行） | checkPermission（缓存命中/未命中/无成员）、isProjectOwner、getUserPermissions/getUserRole、hasRole、isProjectMember、clearUserCache、checkAny/AllPermissions |

均为纯单元测试（mock `DatabaseService` 与 `PermissionCacheService`），运行方式：`pnpm test -- --testPathPattern="roles"`。
