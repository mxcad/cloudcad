# 权限系统（Permissions）

**文件位置**：`packages/backend/src/common/services/permission*.ts`

## 概述

基于角色的访问控制（RBAC）系统，支持系统权限和项目权限，提供细粒度权限控制和多级缓存。

## 核心组件

- **PermissionService**: 统一权限检查服务
- **PermissionCacheService**: 权限缓存服务（本地内存，TTL 5-10 分钟）
- **RolesCacheService**: 角色缓存服务（本地内存，TTL 10 分钟）
- **RedisCacheService**: Redis 分布式缓存服务
- **@RequirePermissions()**: 权限装饰器
- **PermissionsGuard**: 权限守卫

## 角色分类

| 类别 | 说明 | 角色 |
|------|------|------|
| 系统 | 全局系统角色 | ADMIN, USER |
| 项目 | 项目特定角色 | PROJECT_OWNER, PROJECT_ADMIN, PROJECT_MEMBER, PROJECT_EDITOR, PROJECT_VIEWER |
| 自定义 | 用户创建的自定义角色 | - |

## 权限类型

**系统权限（SystemPermission）**：
- 用户管理权限：SYSTEM_USER_READ, SYSTEM_USER_CREATE, SYSTEM_USER_UPDATE, SYSTEM_USER_DELETE
- 角色管理权限：SYSTEM_ROLE_READ, SYSTEM_ROLE_CREATE, SYSTEM_ROLE_UPDATE, SYSTEM_ROLE_DELETE, SYSTEM_ROLE_PERMISSION_MANAGE
- 字体管理权限：SYSTEM_FONT_READ, SYSTEM_FONT_UPLOAD, SYSTEM_FONT_DELETE, SYSTEM_FONT_DOWNLOAD
- 系统管理权限：SYSTEM_ADMIN, SYSTEM_MONITOR

**项目权限（ProjectPermission）**：
- 项目管理权限：PROJECT_UPDATE, PROJECT_DELETE, PROJECT_MEMBER_MANAGE, PROJECT_MEMBER_ASSIGN, PROJECT_ROLE_MANAGE, PROJECT_ROLE_PERMISSION_MANAGE, PROJECT_TRANSFER, PROJECT_SETTINGS_MANAGE
- 文件操作权限：FILE_CREATE, FILE_UPLOAD, FILE_OPEN, FILE_EDIT, FILE_DELETE, FILE_TRASH_MANAGE, FILE_DOWNLOAD, FILE_SHARE, FILE_COMMENT, FILE_PRINT, FILE_COMPARE
- CAD 图纸权限：CAD_SAVE, CAD_EXPORT, CAD_EXTERNAL_REFERENCE
- 图库权限：GALLERY_ADD
- 版本管理权限：VERSION_READ, VERSION_CREATE, VERSION_DELETE, VERSION_RESTORE

## 权限检查流程

```
用户请求 → JWT 验证 → 权限守卫检查 → 缓存查询 → 数据库查询 → 权限判断 → 允许/拒绝
```

## 缓存策略

| 缓存类型 | 存储位置 | TTL | 使用场景 |
|---------|---------|-----|---------|
| 用户权限 | 本地内存 | 5-10 分钟 | 系统权限检查 |
| 用户角色 | 本地内存 | 10 分钟 | 角色验证 |
| 项目权限 | 本地内存 | 5 分钟 | 项目权限检查 |
| 节点访问角色 | Redis | 10 分钟 | 跨服务共享 |

## 前端集成

- **usePermission Hook**: 权限检查 Hook
- **useProjectPermission Hook**: 项目权限检查 Hook
- **PermissionAssignment 组件**: 权限分配组件

## 相关模型

- Role: 角色模型
- ProjectRole: 项目角色模型
- ProjectRolePermission: 项目角色权限关联
- ProjectMember: 项目成员模型