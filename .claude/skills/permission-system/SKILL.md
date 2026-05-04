---
name: permission-system
description: |
  CloudCAD 双层权限系统规范。涉及权限检查、角色管理、权限装饰器、权限缓存时必须触发此技能——添加新权限、修改角色定义、实现权限控制、使用 Guard/装饰器、前端权限判断、权限缓存清理等。确保权限实现符合项目的双层权限架构（系统权限 + 项目权限）。
---

# Permission System - CloudCAD 双层权限系统规范

## 概述

CloudCAD 采用**双层权限架构**：
- **系统权限 (Permission)**：全局权限，控制用户管理、角色管理、字体管理等系统级功能
- **项目权限 (ProjectPermission)**：项目级权限，控制文件操作、CAD 编辑、成员管理等项目内功能

权限检查遵循严格的调用链：`Controller → Guard → Service → Cache → Database`

---

## 1. 权限与角色定义

### 1.1 系统权限枚举

**定义位置：** `packages/backend/prisma/schema.prisma` (Permission enum)

| 分类 | 权限 | 说明 |
|------|------|------|
| 用户管理 | `SYSTEM_USER_READ/CREATE/UPDATE/DELETE` | 用户 CRUD |
| 角色管理 | `SYSTEM_ROLE_READ/CREATE/UPDATE/DELETE` | 角色 CRUD |
| 权限管理 | `SYSTEM_ROLE_PERMISSION_MANAGE` | 分配角色权限 |
| 字体管理 | `SYSTEM_FONT_READ/UPLOAD/DELETE/DOWNLOAD` | 字体库管理 |
| 系统管理 | `SYSTEM_ADMIN/MONITOR/CONFIG_READ/CONFIG_WRITE` | 系统配置 |

### 1.2 项目权限枚举

**定义位置：** `packages/backend/prisma/schema.prisma` (ProjectPermission enum)

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
  ADMIN = 'ADMIN',           // 系统管理员：拥有所有系统权限
  USER_MANAGER = 'USER_MANAGER', // 用户管理员：管理用户和角色
  FONT_MANAGER = 'FONT_MANAGER', // 字体管理员：管理字体库
  USER = 'USER',             // 普通用户：基础系统权限
}
```

**角色继承关系：**
- `ADMIN` → 顶级角色，无父级
- `USER_MANAGER` → 继承自 `USER`
- `FONT_MANAGER` → 继承自 `USER`
- `USER` → 基础角色

### 1.4 项目角色

```typescript
enum ProjectRole {
  OWNER = 'PROJECT_OWNER',   // 项目所有者：拥有所有项目权限
  ADMIN = 'PROJECT_ADMIN',   // 项目管理员：管理项目和成员
  EDITOR = 'PROJECT_EDITOR', // 项目编辑者：编辑文件
  MEMBER = 'PROJECT_MEMBER', // 项目成员：基本项目操作
  VIEWER = 'PROJECT_VIEWER', // 项目查看者：只读权限
}
```

---

## 2. 后端权限检查

### 2.1 Guard 使用规范

#### 系统权限 Guard (PermissionsGuard)

**适用场景：** 检查系统级权限

```typescript
@Controller('users')
@UseGuards(PermissionsGuard)
export class UserController {
  // 要求单个权限
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
  findAll() {}

  // 要求多个权限（AND 逻辑，默认）
  @Put(':id')
  @RequirePermissions([
    SystemPermission.SYSTEM_USER_READ,
    SystemPermission.SYSTEM_USER_UPDATE
  ])
  update() {}

  // 要求任意一个权限（OR 逻辑）
  @Get('list')
  @RequirePermissions(
    [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_ADMIN],
    PermissionCheckMode.ANY
  )
  list() {}
}
```

#### 项目权限 Guard (RequireProjectPermissionGuard)

**适用场景：** 检查项目级权限，自动从请求中提取项目 ID

```typescript
@Controller('files')
@UseGuards(RequireProjectPermissionGuard)
export class FileController {
  // 要求单个项目权限
  @Post('upload')
  @RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
  upload(@Body() body: { projectId: string }) {}

  // 要求多个项目权限（AND 逻辑）
  @Put(':id')
  @RequireProjectPermission(
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_EDIT
  )
  update() {}
}
```

**项目 ID 提取优先级：**
1. `params.projectId`
2. `query.projectId`
3. `body.projectId`
4. `body.nodeId` → 查询节点获取项目 ID

#### 角色 Guard (RolesGuard)

**适用场景：** 检查用户系统角色

```typescript
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(['ADMIN'])
export class AdminController {
  // 仅管理员可访问
}
```

### 2.2 Service 层权限检查

#### 系统权限检查

```typescript
// 注入 PermissionService
constructor(private readonly permissionService: PermissionService) {}

// 检查系统权限
const hasPermission = await this.permissionService.checkSystemPermission(
  userId,
  SystemPermission.SYSTEM_USER_READ
);
```

#### 项目权限检查

```typescript
// 注入 ProjectPermissionService
constructor(private readonly projectPermissionService: ProjectPermissionService) {}

// 检查项目权限
const hasPermission = await this.projectPermissionService.checkPermission(
  userId,
  projectId,
  ProjectPermission.FILE_EDIT
);
```

---

## 3. 前端权限检查

### 3.1 系统权限 Hook (usePermission)

**位置：** `packages/frontend/src/hooks/usePermission.ts`

```typescript
import { usePermission } from '@/hooks/usePermission';
import { Permission } from '@/constants/permissions';

function MyComponent() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAdmin } = usePermission();

  // 检查单个权限
  if (!hasPermission(Permission.SYSTEM_USER_READ)) {
    return <AccessDenied />;
  }

  // 检查任意一个权限
  if (hasAnyPermission([Permission.SYSTEM_USER_READ, Permission.SYSTEM_USER_UPDATE])) {
    // 有任意一个权限即可
  }

  // 检查所有权限
  if (hasAllPermissions([Permission.SYSTEM_USER_READ, Permission.SYSTEM_USER_UPDATE])) {
    // 必须同时拥有两个权限
  }

  // 检查是否管理员
  if (isAdmin()) {
    // 管理员专属功能
  }
}
```

### 3.2 项目权限 Hook (useProjectPermission)

**位置：** `packages/frontend/src/hooks/useProjectPermission.ts`

```typescript
import { useProjectPermission } from '@/hooks/useProjectPermission';
import { ProjectPermission } from '@/constants/permissions';

function FileEditor({ projectId }: { projectId: string }) {
  const { checkPermission, checkAnyPermission, checkAllPermissions } = useProjectPermission();

  // 检查单个项目权限
  const canEdit = await checkPermission(projectId, ProjectPermission.FILE_EDIT);

  // 检查任意一个项目权限
  const canOperate = await checkAnyPermission(projectId, [
    ProjectPermission.FILE_EDIT,
    ProjectPermission.FILE_DELETE
  ]);

  // 检查所有项目权限
  const canFullEdit = await checkAllPermissions(projectId, [
    ProjectPermission.FILE_OPEN,
    ProjectPermission.FILE_EDIT,
    ProjectPermission.CAD_SAVE
  ]);
}
```

### 3.3 权限常量使用

**位置：** `packages/frontend/src/constants/permissions.ts`

```typescript
import { Permission, ProjectPermission, PERMISSION_GROUPS } from '@/constants/permissions';

// 使用权限常量
hasPermission(Permission.SYSTEM_USER_READ);

// 使用权限分组（用于 UI 展示）
PERMISSION_GROUPS.user; // 用户管理相关权限
PERMISSION_GROUPS.project; // 项目管理相关权限
```

---

## 4. 添加新权限

### ⚠️ 重要：前端权限类型自动生成

**前端权限常量文件 (`permissions.ts`) 是由脚本自动生成的，请勿直接修改！**

**生成脚本：** `scripts/generate-frontend-permissions.js`

**工作流程：**
```
Prisma Schema (schema.prisma)
        ↓  运行 pnpm generate:frontend-permissions
前端权限常量 (permissions.ts) 自动生成
```

**修改权限的唯一方式：**
1. 修改 `packages/backend/prisma/schema.prisma` 中的枚举定义
2. 运行 `pnpm generate:frontend-permissions` 重新生成前端常量
3. 运行 `pnpm db:generate` 更新 Prisma Client

### 4.1 添加新权限完整步骤

1. **添加枚举定义** (`packages/backend/prisma/schema.prisma`)

```prisma
enum Permission {
  // ... 现有权限
  MY_NEW_PERMISSION  // 添加新权限
}
```

2. **生成前端常量** (自动)

```bash
pnpm generate:frontend-permissions
```

此命令会：
- 从 Prisma Schema 读取权限枚举
- 自动生成 `packages/frontend/src/constants/permissions.ts`
- 包含 `SystemPermission`、`ProjectPermission` 类型定义
- 生成权限依赖关系和分组

3. **更新 Prisma Client**

```bash
pnpm db:generate
```

4. **分配给角色** (数据库迁移)

```sql
-- 通过 Prisma Studio 或迁移脚本
INSERT INTO "RolePermission" ("id", "roleId", "permission")
VALUES (gen_random_uuid(), '<角色ID>', 'MY_NEW_PERMISSION');
```

5. **使用权限**

```typescript
@RequirePermissions([SystemPermission.MY_NEW_PERMISSION])
```

### 4.2 添加新角色步骤

1. **添加角色枚举** (permissions.enum.ts)

```typescript
export enum SystemRole {
  // ... 现有角色
  MY_NEW_ROLE = 'MY_NEW_ROLE',
}
```

2. **创建角色记录** (数据库)

```sql
INSERT INTO "Role" ("id", "name", "parentId", "category", "level", "isSystem")
VALUES (gen_random_uuid(), 'MY_NEW_ROLE', '<父角色ID>', 'SYSTEM', 1, true);
```

3. **分配权限** (数据库)

4. **更新角色继承关系** (如有需要)

---

## 5. 缓存管理

### 5.1 缓存 TTL 配置

**位置：** `packages/backend/src/common/constants/cache.constants.ts`

```typescript
export const CACHE_TTL = {
  SYSTEM_PERMISSION: 5 * 60 * 1000,    // 5 分钟
  USER_ROLE: 10 * 60 * 1000,           // 10 分钟
  PROJECT_PERMISSION: 5 * 60 * 1000,   // 5 分钟
  PROJECT_OWNER: 10 * 60 * 1000,       // 10 分钟
  PROJECT_MEMBER_ROLE: 5 * 60 * 1000,  // 5 分钟
  ROLE_PERMISSION: 10 * 60 * 1000,     // 10 分钟
};
```

### 5.2 缓存清理时机

**必须清理缓存的场景：**

| 操作 | 清理方法 |
|------|----------|
| 用户角色变更 | `permissionCacheService.clearUserCache(userId)` |
| 项目成员变更 | `permissionCacheService.clearProjectCache(projectId)` |
| 角色权限变更 | `permissionCacheService.clearRoleCache(roleName)` |
| 项目删除 | `permissionCacheService.clearProjectCache(projectId)` |

**示例：**

```typescript
// 用户角色变更后清理缓存
async updateUserRole(userId: string, newRoleId: string) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { roleId: newRoleId }
  });
  
  // 清理用户权限缓存
  await this.permissionCacheService.clearUserCache(userId);
}
```

---

## 6. 数据库模型关系

```
User ──roleId──→ Role ←──roleId── RolePermission
 │                      │                │
 │                      │                │
 └──userId──→ ProjectMember              │
                 │                       │
                 └──projectRoleId──→ ProjectRole ←──projectRoleId── ProjectRolePermission
```

**关键约束：**
- `RolePermission.roleId` → `Role.id` (onDelete: Cascade)
- `ProjectMember.projectId` → `FileSystemNode.id`
- `ProjectMember.userId` → `User.id`
- `ProjectMember.projectRoleId` → `ProjectRole.id`

---

## 7. 常见问题与最佳实践

### 7.1 权限检查位置

- **Controller 层**：使用 Guard 进行权限验证（推荐）
- **Service 层**：复杂业务逻辑中的权限检查

### 7.2 性能优化

- 使用缓存减少数据库查询
- 前端使用 Set 优化权限搜索 O(1)
- 批量检查权限时使用 `Promise.all`

### 7.3 安全注意事项

- 永远不要在前端存储敏感权限数据
- 后端必须进行权限验证，不能仅依赖前端
- 敏感操作需要二次验证

---

## 8. 关键文件索引

| 类别 | 文件路径 |
|------|----------|
| 权限枚举 | `packages/backend/prisma/schema.prisma` |
| 角色定义 | `packages/backend/src/common/enums/permissions.enum.ts` |
| 系统权限 Guard | `packages/backend/src/common/guards/permissions.guard.ts` |
| 项目权限 Guard | `packages/backend/src/common/guards/require-project-permission.guard.ts` |
| 角色 Guard | `packages/backend/src/common/guards/roles.guard.ts` |
| 系统权限服务 | `packages/backend/src/common/services/permission.service.ts` |
| 项目权限服务 | `packages/backend/src/roles/project-permission.service.ts` |
| 角色继承服务 | `packages/backend/src/common/services/role-inheritance.service.ts` |
| 权限缓存服务 | `packages/backend/src/common/services/permission-cache.service.ts` |
| 缓存常量 | `packages/backend/src/common/constants/cache.constants.ts` |
| 系统权限装饰器 | `packages/backend/src/common/decorators/require-permissions.decorator.ts` |
| 项目权限装饰器 | `packages/backend/src/common/decorators/require-project-permission.decorator.ts` |
| 前端权限常量 | `packages/frontend/src/constants/permissions.ts` |
| 前端系统权限 Hook | `packages/frontend/src/hooks/usePermission.ts` |
| 前端项目权限 Hook | `packages/frontend/src/hooks/useProjectPermission.ts` |
