# 权限系统（后端）

## 双层权限架构

| 维度 | 装饰器 | 示例 |
|------|--------|------|
| 系统权限 | `@RequirePermissions()` | `@RequirePermissions(SystemPermission.SYSTEM_ADMIN)` |
| 项目权限 | `@RequireProjectPermission()` | `@RequireProjectPermission(ProjectPermission.FILE_SAVE)` |

## 系统权限清单

- SYSTEM_ADMIN — 系统管理员（全部）
- SYSTEM_USER_MANAGE, SYSTEM_USER_VIEW, SYSTEM_USER_CREATE, SYSTEM_USER_UPDATE, SYSTEM_USER_DELETE
- SYSTEM_ROLE_MANAGE, SYSTEM_ROLE_VIEW, SYSTEM_ROLE_CREATE, SYSTEM_ROLE_UPDATE, SYSTEM_ROLE_DELETE
- SYSTEM_FONT_MANAGE, SYSTEM_FONT_UPLOAD, SYSTEM_FONT_DOWNLOAD, SYSTEM_FONT_DELETE
- SYSTEM_MONITOR — 系统监控
- SYSTEM_CONFIG_READ, SYSTEM_CONFIG_WRITE
- LIBRARY_DRAWING_MANAGE, LIBRARY_BLOCK_MANAGE
- STORAGE_QUOTA — 配额管理
- PROJECT_CREATE — 创建项目

## 项目权限清单

- PROJECT_UPDATE, PROJECT_DELETE, PROJECT_VIEW, PROJECT_TRANSFER
- FILE_UPLOAD, FILE_CREATE, FILE_READ, FILE_UPDATE, FILE_DELETE, FILE_MOVE, FILE_COPY
- FILE_DOWNLOAD, FILE_PERMANENTLY_DELETE, FILE_TRASH_MANAGE
- CAD_SAVE, CAD_EXTERNAL_REFERENCE
- VERSION_READ

## Controller 权限守卫

```typescript
@Controller('admin/users')
export class AdminUserController {
  @Get()
  @RequirePermissions(SystemPermission.SYSTEM_USER_VIEW)
  async listUsers() { }
}

@Controller('projects/:projectId/files')
export class ProjectFileController {
  @Post('upload')
  @RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
  async uploadFile(@Param('projectId') projectId: string) { }
}
```

## 权限缓存

调用链：Controller → PermissionsGuard → PermissionCacheService → DB

权限检查结果会被缓存（Redis），避免每次请求都查库。

## 详细文档

- 权限系统完整规则：`.agents/skills/permission-system/SKILL.md`
