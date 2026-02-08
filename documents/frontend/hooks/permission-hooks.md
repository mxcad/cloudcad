# 权限 Hooks（Permission Hooks）

**文件位置**：`packages/frontend/hooks/`

## 概述

权限相关的自定义 Hooks，提供权限检查和管理功能。

## 核心 Hooks

- **usePermission**: 权限检查 Hook
- **useProjectPermission**: 项目权限检查 Hook

## usePermission Hook

检查用户是否具有指定权限。

**功能**：
- 单个权限检查
- 多个权限检查
- 权限依赖检查
- 权限缓存

**参数**：
- permission: 权限名称或权限数组
- options: 配置选项

**返回值**：
- hasPermission: 是否具有权限
- loading: 加载状态
- error: 错误信息

**使用示例**：
```typescript
const hasPermission = usePermission('SYSTEM_USER_READ');
const canDelete = usePermission(['SYSTEM_USER_DELETE', 'SYSTEM_ADMIN']);
```

## useProjectPermission Hook

检查用户在指定项目中是否具有权限。

**功能**：
- 项目权限检查
- 项目角色检查
- 项目所有者检查
- 节点访问权限检查

**参数**：
- projectId: 项目 ID
- permission: 项目权限
- options: 配置选项

**返回值**：
- hasPermission: 是否具有权限
- role: 用户在项目中的角色
- loading: 加载状态
- error: 错误信息

**使用示例**：
```typescript
const canEditFile = useProjectPermission(projectId, 'FILE_EDIT');
const isOwner = useProjectPermission(projectId, 'PROJECT_OWNER');
```

## 相关服务

- **permissionsApi**: 权限 API 服务
- **projectPermissionsApi**: 项目权限 API 服务

## 相关组件

- **PermissionAssignment**: 权限分配组件

## 权限常量

- **ROLE_PERMISSIONS**: 角色权限映射
- **NODE_ACCESS_PERMISSIONS**: 节点访问权限映射