# 权限系统

CloudCAD 采用双层权限架构：系统权限 + 项目权限。两者完全解耦。

## 权限维度

| 维度 | 装饰器 | 范围 | 示例 |
|------|--------|------|------|
| 系统权限 | `@RequirePermissions()` | 全局管理功能 | `@RequirePermissions(SystemPermission.SYSTEM_USER_MANAGE)` |
| 项目权限 | `@RequireProjectPermission()` | 项目内操作 | `@RequireProjectPermission(ProjectPermission.FILE_CREATE)` |
| 角色检查 | `@Roles()` | 角色级 | `@Roles('admin')` |

## 调用链

```
Controller → Guard → Service → PermissionCache → DB
```

## 系统角色层级（含继承）

| 角色 | 包含权限 |
|------|---------|
| ADMIN | 全部系统权限 |
| USER_MANAGER | 用户/角色管理 |
| FONT_MANAGER | 字体库管理 |
| USER | 基础权限 |

## 项目角色

| 角色 | 权限 |
|------|------|
| OWNER | 全部（不可移除） |
| ADMIN | 管理 + 编辑 |
| EDITOR | 编辑（不能创建） |
| MEMBER | 基本操作 |
| VIEWER | 只读 |

## 前端使用

```tsx
// 检查权限
import { useProjectPermissions } from '@/hooks/useProjectPermissions';

function FileActions() {
  const { canEdit, canDelete } = useProjectPermissions(projectId);
  
  return (
    <>
      {canEdit && <button>编辑</button>}
      {canDelete && <button>删除</button>}
    </>
  );
}
```

## 后端使用

```typescript
@Controller('files')
export class FileController {
  @Post('delete')
  @RequireProjectPermission(ProjectPermission.FILE_DELETE)
  async deleteFile(@Body() dto: DeleteFileDto) {
    // ...
  }
}
```

## 详细文档

- 权限系统完整规则：`.agents/skills/permission-system/SKILL.md`
- ADR 0003 — IPermissionStore 策略模式：`docs/adr/0003-permission-store-strategy-pattern.md`
