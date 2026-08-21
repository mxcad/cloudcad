---
name: permission-system
description: CloudCAD 双层权限系统规范（系统权限 + 项目权限）。涉及权限检查、角色管理、权限装饰器、权限缓存时必须触发此技能——添加新权限、修改角色定义、实现权限控制、使用 Guard/装饰器、前端权限判断、权限缓存清理等。Use when adding `@RequirePermissions`/`@RequireProjectPermission` decorators, modifying roles, implementing permission checks, or managing permission caches.
---

# CloudCAD 双层权限系统

> 交叉参考：[api-contracts](../api-contracts/SKILL.md)（权限类型生成）、[config-management](../config-management/SKILL.md)（运行时配置）
> 前端权限常量: `packages/frontend/src/constants/permissions.ts`（从 Prisma schema 自动生成）

## 架构概览

| 维度 | 装饰器 | Guard | Service |
|------|--------|-------|---------|
| 系统权限 | `@RequirePermissions()` | `PermissionsGuard` | `PermissionService` |
| 项目权限 | `@RequireProjectPermission()` | `RequireProjectPermissionGuard` | `ProjectPermissionService` |
| 角色检查 | `@Roles()` | `RolesGuard` | — |

## 快速使用

### 后端 Controller

```typescript
@UseGuards(RequireProjectPermissionGuard)
@RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
async download() {}

@UseGuards(PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_USER_READ])
async list() {}
```

### Service 层检查

```typescript
// 系统权限
this.permissionService.checkSystemPermission(userId, SystemPermission.XXX);
// 项目权限
this.projectPermissionService.checkPermission(userId, projectId, ProjectPermission.XXX);
```

### 前端权限判断

```typescript
const { hasPermission } = usePermission();                     // 系统权限
const { checkPermission } = useProjectPermission();            // 项目权限
```

## 添加新权限流程

1. 在 `packages/db/prisma/schema.prisma` 的 enum 中添加值
2. `pnpm generate:frontend-permissions` — 自动更新前端常量
3. `pnpm db:generate` — 更新 Prisma Client
4. 数据库中添加角色-权限关联记录
5. 使用新权限：`@RequirePermissions([SystemPermission.MY_NEW])`

> 完整参考：包括权限定义表、缓存管理、数据库模型 → 见 [REFERENCE.md](REFERENCE.md)
