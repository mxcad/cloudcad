# CloudCAD 权限系统参考手册

## 1. 权限与角色定义

### 1.1 系统权限枚举

**定义位置：** `packages/db/prisma/schema.prisma` (Permission enum)

| 分类 | 权限 | 说明 |
|------|------|------|
| 用户管理 | `SYSTEM_USER_READ/CREATE/UPDATE/DELETE` | 用户 CRUD |
| 角色管理 | `SYSTEM_ROLE_READ/CREATE/UPDATE/DELETE` | 角色 CRUD |
| 权限管理 | `SYSTEM_ROLE_PERMISSION_MANAGE` | 分配角色权限 |
| 字体管理 | `SYSTEM_FONT_READ/UPLOAD/DELETE/DOWNLOAD` | 字体库管理 |
| 系统管理 | `SYSTEM_ADMIN/MONITOR/CONFIG_READ/CONFIG_WRITE` | 系统配置 |

### 1.2 项目权限枚举

**定义位置：** `packages/db/prisma/schema.prisma` (ProjectPermission enum)

| 分类 | 权限 | 说明 |
|------|------|------|
| 项目管理 | `PROJECT_UPDATE/DELETE/TRANSFER` | 项目基本操作 |
| 成员管理 | `PROJECT_MEMBER_MANAGE/ASSIGN` | 成员管理 |
| 角色管理 | `PROJECT_ROLE_MANAGE/ROLE_PERMISSION_MANAGE` | 项目角色 |
| 文件操作 | `FILE_CREATE/UPLOAD/OPEN/EDIT/DELETE/DOWNLOAD/MOVE/COPY` | 文件 CRUD |
| 回收站 | `FILE_TRASH_MANAGE` | 回收站管理 |
| CAD 操作 | `CAD_SAVE/CAD_EXTERNAL_REFERENCE` | CAD 编辑 |
| 图库 | `GALLERY_ADD` | 图库添加 |
| 版本 | `VERSION_READ` | 版本查看 |

### 1.3 系统角色

**定义位置：** `packages/backend/src/common/enums/permissions.enum.ts`

```typescript
enum SystemRole {
  ADMIN = 'ADMIN',
  USER_MANAGER = 'USER_MANAGER',
  FONT_MANAGER = 'FONT_MANAGER',
  USER = 'USER',
}
```

角色继承：`ADMIN` → 顶级 → 无父级；`USER_MANAGER`/`FONT_MANAGER` → 继承自 `USER`。

### 1.4 项目角色

```typescript
enum ProjectRole {
  OWNER = 'PROJECT_OWNER',     // 项目所有者：全部权限
  ADMIN = 'PROJECT_ADMIN',     // 项目管理员：管理项目和成员
  EDITOR = 'PROJECT_EDITOR',   // 项目编辑者：编辑文件
  MEMBER = 'PROJECT_MEMBER',   // 项目成员：基本操作
  VIEWER = 'PROJECT_VIEWER',   // 项目查看者：只读
}
```

## 2. Guard 规范

### 系统权限 Guard (PermissionsGuard)

```typescript
@UseGuards(PermissionsGuard)
export class SomeController {
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
  findAll() {}

  @RequirePermissions(
    [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_USER_UPDATE]
  )
  update() {}

  @RequirePermissions(
    [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_ADMIN],
    PermissionCheckMode.ANY
  )
  list() {}
}
```

### 项目权限 Guard (RequireProjectPermissionGuard)

```typescript
@UseGuards(RequireProjectPermissionGuard)
export class SomeController {
  @RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
  upload() {}

  @RequireProjectPermission(ProjectPermission.FILE_OPEN, ProjectPermission.FILE_EDIT)
  edit() {}
}
```

**项目 ID 提取优先级：** `params.projectId` → `query.projectId` → `body.projectId` → `body.nodeId` 查节点。

## 3. 前端权限钩子

### usePermission（系统权限）

```typescript
const { hasPermission, hasAnyPermission, hasAllPermissions, isAdmin } = usePermission();

hasPermission(Permission.SYSTEM_USER_READ);
hasAnyPermission([Permission.SYSTEM_USER_READ, Permission.SYSTEM_USER_UPDATE]);
hasAllPermissions([Permission.SYSTEM_USER_READ, Permission.SYSTEM_USER_UPDATE]);
isAdmin();
```

### useProjectPermission（项目权限）

```typescript
const { checkPermission, checkAnyPermission, checkAllPermissions } = useProjectPermission();

await checkPermission(projectId, ProjectPermission.FILE_EDIT);
await checkAnyPermission(projectId, [ProjectPermission.FILE_EDIT, ProjectPermission.FILE_DELETE]);
await checkAllPermissions(projectId, [ProjectPermission.FILE_OPEN, ProjectPermission.FILE_EDIT]);
```

## 4. 缓存管理

### TTL 配置

`packages/backend/src/common/constants/cache.constants.ts`：

```typescript
export const CACHE_TTL = {
  SYSTEM_PERMISSION: 5 * 60 * 1000,
  USER_ROLE: 10 * 60 * 1000,
  PROJECT_PERMISSION: 5 * 60 * 1000,
  PROJECT_OWNER: 10 * 60 * 1000,
  PROJECT_MEMBER_ROLE: 5 * 60 * 1000,
  ROLE_PERMISSION: 10 * 60 * 1000,
};
```

### 缓存清理时机

| 操作 | 清理方法 |
|------|----------|
| 用户角色变更 | `permissionCacheService.clearUserCache(userId)` |
| 项目成员变更 | `permissionCacheService.clearProjectCache(projectId)` |
| 角色权限变更 | `permissionCacheService.clearRoleCache(roleName)` |
| 项目删除 | `permissionCacheService.clearProjectCache(projectId)` |

## 5. 关键文件索引

| 类别 | 路径 |
|------|------|
| 权限枚举 | `packages/db/prisma/schema.prisma` |
| 角色定义 | `packages/backend/src/common/enums/permissions.enum.ts` |
| 系统权限 Guard | `packages/backend/src/common/guards/permissions.guard.ts` |
| 项目权限 Guard | `packages/backend/src/common/guards/require-project-permission.guard.ts` |
| 系统权限服务 | `packages/backend/src/common/services/permission.service.ts` |
| 项目权限服务 | `packages/backend/src/roles/project-permission.service.ts` |
| 缓存服务 | `packages/backend/src/common/services/permission-cache.service.ts` |
| 系统权限装饰器 | `packages/backend/src/common/decorators/require-permissions.decorator.ts` |
| 项目权限装饰器 | `packages/backend/src/common/decorators/require-project-permission.decorator.ts` |
| 前端权限常量 | `packages/frontend/src/constants/permissions.ts` |
| 前端系统权限 Hook | `packages/frontend/src/hooks/usePermission.ts` |
| 前端项目权限 Hook | `packages/frontend/src/hooks/useProjectPermission.ts` |
