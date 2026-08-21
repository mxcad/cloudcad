# CloudCAD 权限系统规范

> 这是权限系统的唯一权威参考文档。所有其他文档中的权限描述以此为准。
> 最后验证日期: 2026-07-17 | 验证方法: 逐条对照代码和 Prisma schema

---

## 双层权限架构

| 维度 | 范围 | Guard | 装饰器 | 数据模型 |
|------|------|-------|--------|---------|
| 系统权限 | 全局管理功能 | `PermissionsGuard` | `@RequirePermissions()` | `Role` → `RolePermission` |
| 项目权限 | 项目内操作 | `RequireProjectPermissionGuard` | `@RequireProjectPermission()` | `ProjectRole` → `ProjectRolePermission`, `ProjectMember` |

权限检查链路：`Controller → Guard → PermissionService → RoleInheritanceService → PermissionCacheService → DB`

---

## 系统权限

**定义位置：** `packages/db/prisma/schema.prisma` (`enum Permission`)
**后端常量：** `packages/backend/src/common/enums/permissions.enum.ts`
**前端常量：** `packages/frontend/src/constants/permissions.ts`（自动生成，勿手动编辑）

| 分类 | 权限 | 说明 |
|------|------|------|
| 用户管理 | `SYSTEM_USER_READ / CREATE / UPDATE / DELETE` | 用户增删改查 |
| 角色管理 | `SYSTEM_ROLE_READ / CREATE / UPDATE / DELETE` | 角色增删改查 |
| 权限管理 | `SYSTEM_ROLE_PERMISSION_MANAGE` | 分配角色权限 |
| 字体管理 | `SYSTEM_FONT_READ / UPLOAD / DELETE / DOWNLOAD` | 字体库管理 |
| 系统管理 | `SYSTEM_ADMIN` | 超级管理员 |
| 监控 | `SYSTEM_MONITOR` | 系统监控 |
| 配置 | `SYSTEM_CONFIG_READ / WRITE` | 运行时配置 |
| 计费 | `SYSTEM_BILLING_READ / WRITE` | 计费与订单 |
| 公开资源库 | `LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE` | 图纸库和图块库 |
| 存储 | `STORAGE_QUOTA` | 存储配额管理 |
| 项目创建 | `PROJECT_CREATE` | 创建新项目 |

### 系统角色

| 角色 | 继承自 | 权限 |
|------|--------|------|
| `ADMIN` | — | 全部系统权限 |
| `USER_MANAGER` | `USER` | 用户/角色管理相关权限 + `PROJECT_CREATE` |
| `FONT_MANAGER` | `USER` | 字体管理相关权限 + `PROJECT_CREATE` |
| `USER` | — | `PROJECT_CREATE` |

继承关系：`ADMIN` > `USER_MANAGER` > `USER`，`FONT_MANAGER` > `USER`。子角色自动拥有父角色的所有权限。

---

## 项目权限

**定义位置：** `packages/db/prisma/schema.prisma` (`enum ProjectPermission`)

| 分类 | 权限 | 说明 |
|------|------|------|
| 项目管理 | `PROJECT_UPDATE / DELETE / TRANSFER` | 项目基本操作 |
| 成员管理 | `PROJECT_MEMBER_MANAGE / ASSIGN` | 成员管理 |
| 角色管理 | `PROJECT_ROLE_MANAGE / ROLE_PERMISSION_MANAGE` | 项目角色 |
| 文件操作 | `FILE_CREATE / UPLOAD / OPEN / EDIT / DELETE / DOWNLOAD / MOVE / COPY` | 文件增删改查 |
| 文件分享 | `FILE_SHARE` | 文件分享 |
| 回收站 | `FILE_TRASH_MANAGE` | 回收站管理 |
| CAD 操作 | `CAD_SAVE / CAD_EXTERNAL_REFERENCE` | CAD 编辑 |
| 版本 | `VERSION_READ` | 版本查看 |

### 项目角色

| 角色 | 权限范围 |
|------|---------|
| `OWNER` | 全部 20 个项目权限。不可被移除、角色不可降级 |
| `ADMIN` | 除 `PROJECT_TRANSFER`、`PROJECT_ROLE_MANAGE`、`PROJECT_ROLE_PERMISSION_MANAGE` 外的 17 个权限 |
| `EDITOR` | 文件操作 + CAD 编辑（9 个权限） |
| `MEMBER` | 文件操作 + 项目查看（12 个权限） |
| `VIEWER` | `FILE_OPEN` + `FILE_DOWNLOAD` + `VERSION_READ`（只读） |

角色没有继承关系。每个角色的权限是独立定义的。

---

## 后端 Guard 使用规范

### 系统权限 Guard

```typescript
@Controller('users')
@UseGuards(PermissionsGuard)
export class UserController {
  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
  findAll() {}

  // AND 逻辑（默认）：需要同时拥有所有权限
  @Put(':id')
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_USER_UPDATE])
  update() {}

  // OR 逻辑：拥有任意一个即可
  @Get('list')
  @RequirePermissions(
    [SystemPermission.SYSTEM_USER_READ, SystemPermission.SYSTEM_ADMIN],
    PermissionCheckMode.ANY,
  )
  list() {}
}
```

### 项目权限 Guard

```typescript
@Controller('files')
@UseGuards(RequireProjectPermissionGuard)
export class FileController {
  @Post('upload')
  @RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
  upload() {}

  // 多个权限 AND
  @Put(':id')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN, ProjectPermission.FILE_EDIT)
  update() {}
}
```

项目 ID 提取优先级：`params.projectId` → `query.projectId` → `body.projectId` → `body.nodeId` → `itemIds[0]` / `nodeIds[0]` → 数据库查询节点归属

### 特殊节点处理

| 节点类型 | Guard 行为 |
|---------|-----------|
| `PROJECT` | 检查项目权限 |
| `LIBRARY_DRAWING` / `LIBRARY_BLOCK` | 自动降级为系统权限检查 |
| `PERSONAL_SPACE` | 仅所有者可访问 |
| 项目所有者 | 自动放行（绕过角色检查） |

### 角色 Guard

```typescript
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(['ADMIN'])
export class AdminController {}
```

### 可选认证

```typescript
@Get('nodes/:nodeId/thumbnail')
@OptionalAuth()  // 未认证用户跳过，认证用户走 Guard
@RequireProjectPermission(ProjectPermission.FILE_OPEN)
getThumbnail() {}
```

---

## 前端权限使用

### 系统权限

```typescript
import { usePermission } from '@/hooks/usePermission';
import { Permission } from '@/constants/permissions';

function MyComponent() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAdmin } = usePermission();

  if (!hasPermission(Permission.SYSTEM_USER_READ)) {
    return <AccessDenied />;
  }
}
```

### 项目权限

```typescript
import { useProjectPermission } from '@/hooks/useProjectPermission';
import { ProjectPermission } from '@/constants/permissions';

function FileActions({ projectId }: { projectId: string }) {
  const { checkPermission, checkAnyPermission, checkAllPermissions } = useProjectPermission();

  useEffect(() => {
    checkPermission(projectId, ProjectPermission.FILE_EDIT).then(canEdit => {
      if (!canEdit) setShowEditButton(false);
    });
  }, [projectId]);
}
```

---

## 全量拦截点地图

### 系统权限覆盖

23 个系统权限中 22 个有后端 Guard 覆盖。

**未保护：**
| 端点 | 路由数 | 风险 |
|------|--------|------|
| `CacheMonitorController` | 12 GET + 10 POST/DELETE | 已修复（#72） |
| `ShareController` | 5 端点 | 需认证但无额外 Guard |
| `BatchDownloadController` | 6 端点 | 需认证但无额外 Guard |

**前端保护：** 12/23 有 `<PermissionRoute>` 路由级保护，8/23 有按钮级 `hasPermission` 调用。

### 项目权限覆盖

20 个项目权限中 16 个完全覆盖。

**需要关注：**
| 权限 | 问题 |
|------|------|
| `FILE_SHARE` | `ShareController` 无 Guard 装饰器 |
| `CAD_SAVE` | `save-as` 端点缺少方法级 Guard（有内联检查） |

---

## 已知 Gap 和风险

| 严重性 | 问题 | 状态 |
|--------|------|------|
| P0 | ~~ThumbnailController 公开写入~~ | 已修复（#69） |
| P0 | ~~CacheMonitorController 无保护~~ | 已修复（#72） |
| P1 | ~~`uploadFile()` 端点 `@OptionalAuth()` 无 Guard~~ | 已确认：CAD 编辑器打开图纸必须上传，游客也可以用，不加 Guard |
| P1 | ~~`getNonCadFile()` 无权限保护~~ | 已确认：CAD 编辑器读取转换后的 mxweb 文件必须无认证，游客场景需要 |
| P1 | ~~PROJECT_UPDATE 绕过（前端用错端点）~~ | 已修复（#73） |
| P1 | `public-file/convert` `@Public()` 无认证 | 讨论决定保持（格式转换工具） |
| P2 | ~~`SearchService` 搜索路由无方法级 Guard~~ | 已确认：搜索 scope 多样（项目/公开库/个人空间），Service 层按 scope 适配检查是最合适的实现，不加 Guard |
| P2 | ~~`getFile()` 无 Guard~~ | 已确认：有内联 `handleFileRequest` 做权限校验，功能完备，属于代码风格不一致而非漏洞 |
| P3 | 前端文档 hook 名/返回值与实际不一致 | 已修复（#71） |
| P3 | SKILL.md 权限枚举表不完整 | 已修复（#71） |

---

## 缓存架构

| 缓存 | 键模式 | TTL |
|------|--------|-----|
| 系统权限 | `system_perm:${userId}:${permission}` | 5min |
| 角色权限 | `role:permissions:${roleName}` | 10min |
| 角色层级 | `role:path:${roleName}`, `role:inherit:*` | 15min / 10min |
| 项目权限 | `project:permission:${userId}:${projectId}:${perm}` | 5min |
| 项目所有者 | `project:owner:${userId}:${projectId}` | 10min |
| 成员角色 | `project:role:${userId}:${projectId}` | 5min |
| 管理员标记 | `is_admin:${userId}` | 10min |
| 节点访问角色 | `node:access_role:${userId}:${nodeId}` | 10min |

缓存失效通过 Redis Pub/Sub 广播（频道：`user` / `project` / `role` / `all`）。

所有缓存 TTL 定义在 `packages/backend/src/common/constants/cache.constants.ts`。

---

## 文档引用关系

```
docs/permission-system-spec.md          ← 本文（权威参考）
├── packages/db/prisma/schema.prisma    ← 权限枚举事实源
├── packages/backend/src/common/enums/permissions.enum.ts  ← 角色定义
├── packages/frontend/src/constants/permissions.ts  ← 自动生成

引用本文的文档：
├── .agents/skills/permission-system/SKILL.md  ← Skill 规范
├── .agents/skills/backend-coding-standards/docs/permission-system.md  ← 后端速查
├── .agents/skills/frontend-coding-standards/docs/permission-system.md ← 前端速查
├── AGENTS.md            ← Agent 工作指引
├── CONTEXT.md           ← 领域术语

相关文档（保留）：
├── docs/audit/permission-audit.md  ← Controller 级审计报告（2026-05-02）
├── docs/adr/0003-permission-store-strategy-pattern.md  ← IPermissionStore ADR
```

---

## 附录：变更记录

| 日期 | 变更 | 相关 Issue |
|------|------|-----------|
| 2026-07-17 | 初始创建，整合所有 Research 产出 | #59 |
| 2026-07-17 | PROJECT_UPDATE 前后端修复 | #73 |
| 2026-07-17 | ThumbnailController 添加 Guard | #69 |
| 2026-07-17 | CacheMonitorController 添加 Guard | #72 |
| 2026-07-17 | 删除 RolePermissionsMapper | #68 |
| 2026-07-17 | 修复 4 份文档一致性 | #71 |
