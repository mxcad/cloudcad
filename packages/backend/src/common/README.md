# CloudCAD 权限系统

## 概述

CloudCAD 采用统一节点权限系统：用户角色权限、节点访问权限（统一管理项目/文件夹/文件）。该系统基于装饰器和守卫实现，提供细粒度的访问控制。

## 权限层级

### 1. 用户角色权限 (UserRole)

- **ADMIN**: 系统管理员，拥有所有权限
- **USER**: 普通用户，拥有基础权限

### 2. 节点访问权限 (NodeAccessRole)

统一管理项目、文件夹和文件的访问权限：

- **OWNER**: 节点所有者，拥有节点所有权限
- **ADMIN**: 节点管理员，可以管理成员和节点设置
- **MEMBER**: 节点成员，可以创建和编辑文件
- **EDITOR**: 文件编辑者，可以编辑和分享文件
- **VIEWER**: 节点查看者，只能查看和下载文件

> **注意**: `ProjectMemberRole` 和 `FileAccessRole` 是 `NodeAccessRole` 的别名，用于向后兼容。

## 核心组件

### 权限装饰器

- `@Roles()` - 用户角色装饰器
- `@NodePermission()` - 节点权限装饰器（统一管理项目/文件夹/文件）

### 权限守卫

- `RolesGuard` - 基于用户角色的权限验证
- `NodePermissionGuard` - 节点级权限验证（统一管理项目/文件夹/文件）

### 权限服务

- `PermissionService` - 统一的权限检查逻辑
- `FileSystemPermissionService` - 文件系统权限检查（支持权限继承）
- `PermissionCacheService` - 权限缓存优化服务

### 向后兼容别名

- `@ProjectPermission()` = `@NodePermission()`
- `ProjectPermissionGuard` = `NodePermissionGuard`
- `ProjectMemberRole` = `NodeAccessRole`
- `FileAccessRole` = `NodeAccessRole`

## 使用示例

### 基本用法

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/permissions.enum';

@Controller('example')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExampleController {
  @Get('admin-only')
  @Roles(UserRole.ADMIN)
  adminOnlyEndpoint() {
    return { message: '只有管理员可以访问' };
  }
}
```

### 节点权限控制（统一管理项目/文件夹/文件）

```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { NodePermissionGuard } from '../common/guards/project-permission.guard';
import { NodePermission } from '../common/decorators/project-permission.decorator';
import { NodeAccessRole } from '../common/enums/permissions.enum';

@Controller('nodes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NodesController {
  @Get(':nodeId')
  @UseGuards(NodePermissionGuard)
  @NodePermission(
    NodeAccessRole.OWNER,
    NodeAccessRole.ADMIN,
    NodeAccessRole.MEMBER,
    NodeAccessRole.VIEWER
  )
  getNode(@Param('nodeId') nodeId: string) {
    return { nodeId };
  }
}
```

### 向后兼容（仍可使用旧名称）

```typescript
// 项目权限控制（向后兼容）
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { ProjectPermission } from '../common/decorators/project-permission.decorator';
import { ProjectMemberRole } from '../common/enums/permissions.enum';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  @Get(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER,
    ProjectMemberRole.VIEWER
  )
  getProject(@Param('projectId') projectId: string) {
    return { projectId };
  }
}
```

## 权限映射

### 用户角色权限映射

- **ADMIN**: 所有权限（18个权限）
- **USER**: 基础权限（7个权限，创建项目、文件操作等）

### 节点访问权限映射

- **OWNER**: 节点所有权限（12个权限）
- **ADMIN**: 节点管理权限（9个权限，无删除节点权限）
- **MEMBER**: 节点编辑权限（6个权限）
- **EDITOR**: 文件编辑权限（4个权限，仅文件相关）
- **VIEWER**: 节点查看权限（2个权限）

### 权限继承机制

文件系统支持权限继承：

- 文件/文件夹没有直接权限时，自动向上查找项目根节点权限
- 提高权限管理效率，减少重复配置

## 缓存机制

权限系统内置缓存机制，提升权限检查性能：

- 用户角色缓存：10分钟
- 节点访问角色缓存：5分钟
- 自动清理过期缓存：每10分钟

## 错误处理

权限验证失败时，系统会抛出相应的异常：

- `401 Unauthorized`: 用户未认证
- `403 Forbidden`: 用户权限不足
- `400 Bad Request`: 缺少必要的资源ID

## 最佳实践

1. **最小权限原则**: 只授予必要的最小权限
2. **权限检查顺序**: 先检查用户角色，再检查资源权限
3. **缓存管理**: 在权限变更时及时清理相关缓存
4. **日志记录**: 记录权限检查失败的日志用于审计

## 扩展指南

### 添加新的权限类型

1. 在 `permissions.enum.ts` 中添加新的权限枚举
2. 更新 `NODE_ACCESS_PERMISSIONS` 映射表
3. 在相应的服务中实现权限检查逻辑

### 自定义权限守卫

继承现有的守卫类，实现自定义的权限验证逻辑：

```typescript
@Injectable()
export class CustomPermissionGuard extends NodePermissionGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 自定义权限验证逻辑
    return super.canActivate(context);
  }
}
```

## 性能优化

1. 使用权限缓存减少数据库查询
2. 批量权限检查优化
3. 定期清理过期缓存
4. 权限预加载机制

## 安全考虑

1. 权限信息不包含在JWT Token中，防止权限提升
2. 每次请求都进行实时权限验证
3. 权限变更时立即清理相关缓存
4. 详细的权限审计日志
