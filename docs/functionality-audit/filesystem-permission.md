# FileSystem Permissions & Project Members — 功能审计对比

> **分支对比**: `main` (old, messy) vs `refactor/circular-deps` (current, refactored)
> **审计日期**: 2026-05-08
> **范围**: 项目成员管理、权限检查、角色分配、所有权转让、批量操作

---

## 一、架构变更概览

| 组件 | main 路径 | refactor/circular-deps 路径 |
|---|---|---|
| ProjectMemberService | `file-system/services/project-member.service.ts` | `file-system/project-member/project-member.service.ts` |
| FileSystemPermissionService | `file-system/file-system-permission.service.ts` | `file-system/file-permission/file-system-permission.service.ts` |
| ProjectPermissionService | `roles/project-permission.service.ts` | `roles/project-permission.service.ts` (保留) |
| PermissionCacheService | `common/services/permission-cache.service.ts` | `common/services/permission-cache.service.ts` |

**关键架构变化**: 新分支将 `file-system/` 拆分为多个子模块（`file-permission/`, `project-member/`, `file-tree/`, `file-download/` 等），但 `roles/` 模块保留在原有位置。

---

## 二、控制器端点完整对比

### 2.1 main 分支 — 全部端点 (已有)

| 方法 | 路径 | 所需权限 | 功能 |
|---|---|---|---|
| GET | `projects/:projectId/members` | `PROJECT_MEMBER_MANAGE` | 获取成员列表 |
| POST | `projects/:projectId/members` | `PROJECT_MEMBER_MANAGE` | 添加成员 |
| PATCH | `projects/:projectId/members/:userId` | `PROJECT_MEMBER_ASSIGN` | 更新成员角色 |
| DELETE | `projects/:projectId/members/:userId` | `PROJECT_MEMBER_MANAGE` | 移除成员 |
| POST | `projects/:projectId/transfer` | `PROJECT_TRANSFER` | 转让项目所有权 |
| POST | `projects/:projectId/members/batch` | `PROJECT_MEMBER_MANAGE` | 批量添加成员 |
| PATCH | `projects/:projectId/members/batch` | `PROJECT_MEMBER_ASSIGN` | 批量更新成员角色 |

### 2.2 refactor/circular-deps — 实际端点

| 方法 | 路径 | 状态 |
|---|---|---|
| GET | `projects/:projectId/members` | ✅ 存在 |
| POST | `projects/:projectId/members` | ✅ 存在 |
| PATCH | `projects/:projectId/members/:userId` | ✅ 存在 |
| DELETE | `projects/:projectId/members/:userId` | ✅ 存在 |
| POST | `projects/:projectId/transfer` | 🔴 **缺失** |
| POST | `projects/:projectId/members/batch` | 🔴 **缺失** |
| PATCH | `projects/:projectId/members/batch` | 🔴 **缺失** |

> **注意**: `fileSystemService.ts` 中**已包含** `transferProjectOwnership`、`batchAddProjectMembers`、`batchUpdateProjectMembers` 的委托方法（第 440-475 行），但控制器中缺少对应的路由入口。

---

## 三、🔴 NEEDS DECISION — 关键差异列表

### 🔴 1. 缺失 3 个 API 端点

**严重程度**: HIGH — 功能不可用

当前分支 `file-system.controller.ts` 缺少以下端点：

1. **`POST /file-system/projects/:projectId/transfer`** — 项目所有权转让
   - main: 完整实现，包括权限检查 `PROJECT_TRANSFER`、`@CsrfProtected()`、`@HttpCode(HttpStatus.OK)`
   - current: **不存在**
   - 影响: 前端 `MembersModal.tsx` 中的 `handleTransferOwnership` 调用 `fileSystemControllerUpdateProjectMember` 作为 workaround（用 `{ roleName: 'PROJECT_OWNER' }` 替代正确的 transfer 端点），逻辑不正确

2. **`POST /file-system/projects/:projectId/members/batch`** — 批量添加成员
   - main: 完整实现，权限 `PROJECT_MEMBER_MANAGE`
   - current: **不存在**，但 `fileSystemService.batchAddProjectMembers` 委托方法存在

3. **`PATCH /file-system/projects/:projectId/members/batch`** — 批量更新成员角色
   - main: 完整实现，权限 `PROJECT_MEMBER_ASSIGN`
   - current: **不存在**，但 `fileSystemService.batchUpdateProjectMembers` 委托方法存在

**修复方案**: 在 `file-system.controller.ts` 中添加这 3 个端点路由，将请求委托给已有的 service 方法。

---

### 🔴 2. 权限检查执行方式不同

**严重程度**: MEDIUM — 逻辑意图相同但实现路径不同

| 操作 | main 权限检查位置 | refactor 权限检查位置 |
|---|---|---|
| addProjectMember | ❌ 无显式权限检查（仅依赖 Guard） | ✅ service 方法内 checkPermission(`PROJECT_MEMBER_MANAGE`) |
| updateProjectMember | ❌ 无显式权限检查（仅依赖 Guard） | ✅ service 方法内 checkPermission(`PROJECT_MEMBER_ASSIGN`) |
| removeProjectMember | ❌ 无显式权限检查（仅依赖 Guard） | ✅ service 方法内 checkPermission(`PROJECT_MEMBER_MANAGE`) |

**意图差异**: refactor 分支在 service 层增加了二次权限检查（双重验证），main 分支依赖 Guard + 装饰器。这是**安全增强**，不是功能缺失。但需要注意：

- refactor 的 `ProjectMemberService` 构造函数中注入了 `ProjectPermissionService`（main 分支没有此依赖）
- 这导致 `project-member.module.ts` 需要导入 `RolesModule`

---

### 🔴 3. 用户查询增加了 deletedAt 过滤

**严重程度**: LOW — 增强

| 位置 | main | refactor |
|---|---|---|
| addProjectMember - 用户查询 | `findUnique({ where: { id: userId } })` | `findUnique({ where: { id: userId, deletedAt: null } })` |

refactor 分支在查询用户时增加了 `deletedAt: null` 过滤。这是**安全增强**，但 main 分支假设软删除用户在业务层面已被过滤。

---

### 🔴 4. ProjectPermissionService — AuditLogService 依赖变更

**严重程度**: LOW — 依赖变化

| 分支 | 依赖 |
|---|---|
| main | `AuditLogService` (通过 `@Inject(forwardRef(() => AuditLogService))`) |
| refactor | `IPERMISSION_STORE` (通过 `@Optional() @Inject(IPERMISSION_STORE)`) |

**变化**: refactor 移除了 `AuditLogService` 依赖，增加了 `IPermissionStore` 的可选注入（支持自定义权限存储实现）。`AuditLogService` 的审计日志功能被移到了 `ProjectMemberService` 层。意图一致：审计职责从权限检查服务转移到业务服务。

---

### 🔴 5. FileSystemPermissionService 功能一致

两个分支的 `FileSystemPermissionService` 功能**完全一致**：
- `checkNodePermission()` — 检查节点权限
- `getNodeAccessRole()` — 获取节点访问角色（含公共资源库检查）
- `isLibraryNode()` — 检查是否公共资源库
- `hasNodeAccessRole()` — 检查是否具有指定角色
- `setProjectMemberRole()` — 设置成员角色
- `removeProjectMember()` — 移除成员
- `getProjectMembers()` — 获取成员列表
- `batchAddProjectMembers()` — 批量添加
- `batchUpdateProjectMembers()` — 批量更新
- `clearNodeCache()` — 清除节点缓存
- `clearUserProjectCache()` — 清除用户项目缓存
- `clearUserCache()` — 清除用户缓存

**路径变化**: `file-system/file-system-permission.service.ts` → `file-system/file-permission/file-system-permission.service.ts`

---

### 🔴 6. RequireProjectPermissionGuard — 新增公开资源库检查

**严重程度**: LOW — 新增功能

refactor 的 `RequireProjectPermissionGuard`（319 行）比 main 版本有显著增强：

- **新增**: 智能节点类型判断（`extractNodeId` → `getLibraryKey`）自动检测公开资源库节点
- **新增**: `checkLibraryPermission()` 方法 — 资源库节点检查系统权限而非项目权限
- **新增**: `extractProjectIdFromNode()` — 递归查找父节点 projectId（处理 projectId 为 null 的情况）
- **新增**: multipart/form-data body 未解析时通过 nodeId 查 projectId 的 fallback

main 的 Guard 没有这些功能。这是**refactor 增强**，不是功能缺失。

---

### 🔴 7. Frontend — transferOwnership 实现不一致

**严重程度**: HIGH — 前端功能受影响

前端 `MembersModal.tsx` 第 284-312 行的 `handleTransferOwnership`：

```typescript
// CURRENT IMPLEMENTATION (WORKAROUND - 不正确):
await fileSystemControllerUpdateProjectMember({
  path: { projectId, userId: transferTarget.userId },
  body: { roleName: 'PROJECT_OWNER' },
});
```

**问题**: 
- API SDK (`api-sdk/sdk.gen.ts`) 中**不存在** `transferOwnership` 端点
- 前端尝试使用 `updateProjectMember` + `roleName: 'PROJECT_OWNER'` 绕过，但后端 `updateProjectMember` 明确禁止设置为 `PROJECT_OWNER` 角色（抛出 `ForbiddenException('不能直接设置为项目所有者，请使用转让功能')`）
- 这意味着**转让功能前后端都不可用**

---

## 四、逻辑意图一致（无需修改）的部分

| 功能 | 状态 |
|---|---|
| `PermissionService` (系统权限) | ✅ 一致 |
| `PermissionCacheService` | ✅ 一致 |
| `RequirePermissions` 装饰器 | ✅ 一致 |
| `PermissionsGuard` | ✅ 一致 |
| `RequireProjectPermission` 装饰器 | ✅ 一致 |
| `project-permission.service.ts` (核心权限检查) | ✅ 一致（+ IPermissionStore） |
| 成员 CRUD 基本操作 (get/add/update/remove) | ✅ 一致（+ deletedAt + 二次权限检查） |
| 角色分配基本逻辑 | ✅ 一致 |
| 权限枚举 (`ProjectPermission`, `ProjectRole`) | ✅ 一致 |

---

## 五、修复建议

### 优先级 P0 — 立即修复

1. **添加 3 个缺失的控制器端点**:
   - `POST /file-system/projects/:projectId/transfer`
   - `POST /file-system/projects/:projectId/members/batch`  
   - `PATCH /file-system/projects/:projectId/members/batch`

2. **恢复 transfer 端点后，前端 `MembersModal.tsx` 需更新**:
   - 将 `handleTransferOwnership` 改为调用正确的 transfer 端点
   - 或重新生成 API SDK (`pnpm generate:api-types`)

### 优先级 P1 — 确认决策

3. **获取成员列表的权限要求**:
   - main: `@RequireProjectPermission(PROJECT_MEMBER_MANAGE)`
   - refactor: `@RequireProjectPermission(PROJECT_MEMBER_MANAGE)` （一致）
   - 但前端 `permissionUtils.ts` 中 `canManageNodeMembers` 使用 `PROJECT_MEMBER_MANAGE` 来检查成员管理权限，与 `canManageNodeRoles` 使用 `PROJECT_ROLE_MANAGE` 区分。需要确认成员列表是否应该对 VIEWER 可见。

---

## 六、文件清单

### 对比过的文件

**Backend (当前分支)**:
- `file-system/file-system.controller.ts`
- `file-system/file-system.service.ts`
- `file-system/project-member/project-member.service.ts`
- `file-system/file-permission/file-system-permission.service.ts`
- `roles/project-permission.service.ts`
- `common/services/permission.service.ts`
- `common/services/permission-cache.service.ts`
- `common/decorators/require-permissions.decorator.ts`
- `common/decorators/require-project-permission.decorator.ts`
- `common/guards/permissions.guard.ts`
- `common/guards/require-project-permission.guard.ts`

**Backend (main 分支)**:
- `file-system/file-system.controller.ts`
- `file-system/file-system-permission.service.ts`
- `file-system/services/project-member.service.ts`
- `roles/project-permission.service.ts`

**Frontend**:
- `components/modals/MembersModal.tsx`
- `components/file-system-manager/FileSystemModals.tsx`
- `utils/permissionUtils.ts`
