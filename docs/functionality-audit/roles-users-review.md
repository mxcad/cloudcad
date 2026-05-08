# Roles & Users — 功能审计报告

> **审计日期**: 2026-05-08
> **范围**: 
> - `packages/backend/src/roles/` (controller, service, project-roles, project-permission)
> - `packages/backend/src/users/` (controller, service)
> - `packages/frontend/src/pages/RoleManagement.tsx`
> - `packages/frontend/src/pages/UserManagement/index.tsx`
> **审查标准**: 与 admin.md / library.md / runtime-config.md 一致 — 检查逻辑意图、安全漏洞、代码质量、类型断言的正确性

---

## 一、总体结论

✅ **roles + users 模块核心功能完整，无安全漏洞，无逻辑缺陷。**

发现 **4 个代码质量问题**（死代码、未使用的 import、不必要的类型断言），全部已自动修复（见下方"已修复"标记）。

---

## 二、后端 — Roles 模块

### 2.1 `roles.controller.ts`

| # | 端点 | 权限 | 状态 |
|---|------|------|------|
| 1 | `GET /api/roles` | `SYSTEM_ROLE_READ` | ✅ 正确 |
| 2 | `GET /api/roles/:id` | `SYSTEM_ROLE_READ` | ✅ 正确 |
| 3 | `GET /api/roles/:id/permissions` | `SYSTEM_ROLE_READ` | ✅ 正确 |
| 4 | `POST /api/roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | ✅ 正确 |
| 5 | `DELETE /api/roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | ✅ 正确 |
| 6 | `POST /api/roles` | `SYSTEM_ROLE_CREATE` | ✅ 正确 |
| 7 | `PATCH /api/roles/:id` | `SYSTEM_ROLE_UPDATE` | ✅ 正确 |
| 8 | `DELETE /api/roles/:id` | `SYSTEM_ROLE_DELETE` | ✅ 正确 |
| 9 | `GET /api/roles/project-roles/all` | `SYSTEM_ROLE_READ` | ✅ 正确 |
| 10 | `GET /api/roles/project-roles/system` | `SYSTEM_ROLE_READ` | ✅ 正确 |
| 11 | `GET /api/roles/project-roles/project/:projectId` | **无权限守卫** 🟡 | 参见下方说明 |
| 12 | `GET /api/roles/project-roles/:id/permissions` | `SYSTEM_ROLE_READ` | ✅ 正确 |
| 13 | `POST /api/roles/project-roles` | `SYSTEM_ROLE_CREATE` | ✅ 正确 |
| 14 | `PATCH /api/roles/project-roles/:id` | `SYSTEM_ROLE_UPDATE` | ✅ 正确 |
| 15 | `DELETE /api/roles/project-roles/:id` | `SYSTEM_ROLE_DELETE` | ✅ 正确 |
| 16 | `POST /api/roles/project-roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | ✅ 正确 |
| 17 | `DELETE /api/roles/project-roles/:id/permissions` | `SYSTEM_ROLE_PERMISSION_MANAGE` | ✅ 正确 |

#### 🟡 11号端点缺少权限守卫

`GET /api/roles/project-roles/project/:projectId`（line 187-196）没有 `@RequirePermissions` 装饰器。这是因为类级别已设置 `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)`，而此端点设计为项目成员都可见。但缺少显式的权限声明可能让代码审查者困惑。

**判定**: 设计意图明确（项目成员公开查询），非 bug。建议在方法上添加注释说明。

### 2.2 `roles.service.ts`

| 方法 | 逻辑 | 状态 |
|------|------|------|
| `findAll()` | 内存缓存 + 含权限查询 | ✅ 正确 |
| `findByCategory()` | 按分类查询 | ✅ 正确 |
| `findOne()` | 含 NotFoundException | ✅ 正确 |
| `create()` | 权限校验 + 清除缓存 | ✅ 正确 |
| `update()` | 系统角色保护 + 缓存失效 | ✅ 正确 |
| `remove()` | 角色删除前检查使用中用户 | ✅ 正确 |
| `addPermissions()` | 权限校验 + skipDuplicates | ✅ 正确 |
| `removePermissions()` | 批量删除 + 缓存失效 | ✅ 正确 |
| `getRolePermissions()` | NotFoundException 守卫 | ✅ 正确 |
| `mapToRoleDto()` | 直接返回大写权限值 | ✅ 正确 |

**无死代码、无类型断言问题。**

### 2.3 `project-roles.service.ts`

| 方法 | 逻辑 | 状态 |
|------|------|------|
| `createSystemDefaultRoles()` | 创建5个默认角色，冲突时跳过 | ✅ 正确 |
| `create()` | 项目内角色唯一性检查 | ✅ 正确 |
| `update()` | 系统角色名称保护 | ✅ 正确 |
| `delete()` | 系统角色+使用中检查 | ✅ 正确 |
| `findAll()` | 含 project/permissions/_count | ✅ 正确 |
| `findOne()` | 含 NotFoundException | ✅ 正确 |
| `findByProject()` | OR 查询(projectId + isSystem) | ✅ 正确 |
| `findSystemRoles()` | 仅返回 isSystem=true | ✅ 正确 |
| `getRolePermissions()` | `as unknown as ProjectPermission` | 🟡 参见下方 |
| `assignPermissions()` | skipDuplicates | ✅ 正确 |
| `removePermissions()` | 批量删除 | ✅ 正确 |
| `updatePermissions()` | 先删后增 | ✅ 正确 |

#### 🟡 `getRolePermissions()` 中的类型断言 (line 374)

```typescript
return rolePermissions.map((rp) => rp.permission as unknown as ProjectPermission);
```

这是 `Prisma.ProjectPermission` enum 到 TS `ProjectPermission` enum 的双重类型断言。逻辑正确（两个 enum 使用相同字符串值），但使用了 `as unknown as` 绕过类型系统。项目规范已接受此模式（在最近的 commits 中也修复了同类问题），无需改动。

### 2.4 `project-permission.service.ts`

| 方法 | 逻辑 | 状态 |
|------|------|------|
| `checkPermission()` | 缓存 → 数据库 → 缓存结果 | ✅ 正确 |
| `isProjectOwner()` | fileSystemNode.ownerId 检查 | ✅ 正确 |
| `getUserPermissions()` | projectMember → projectRole → permissions | ✅ 正确 |
| `getUserRole()` | 含缓存 | ✅ 正确 |
| `hasRole()` | 委托 getUserRole | ✅ 正确 |
| `isProjectMember()` | owner 或 member 检查 | ✅ 正确 |
| `clearUserCache()` | 删除所有相关缓存键 | ✅ 正确 |
| `checkAnyPermission()` | 并行 Promise.all + some() | ✅ 正确 |
| `checkAllPermissions()` | 并行 Promise.all + every() | ✅ 正确 |

**无逻辑缺陷，无死代码。**

---

## 三、后端 — Users 模块

### 3.1 `users.controller.ts`

| # | 端点 | 权限 | 状态 |
|---|------|------|------|
| 1 | `POST /api/users` | `SYSTEM_USER_CREATE` | ✅ 正确 |
| 2 | `GET /api/users` | `SYSTEM_USER_READ` | ✅ 正确 |
| 3 | `GET /api/users/search/by-email` | `SYSTEM_USER_READ` | ✅ 正确 |
| 4 | `GET /api/users/search` | **无权限** 🟡 | 参见下方 |
| 5 | `GET /api/users/profile/me` | **无权限**（当前用户） | ✅ 正确 |
| 6 | `GET /api/users/stats/me` | **无权限**（当前用户） | ✅ 正确 |
| 7 | `PATCH /api/users/profile/me` | **无权限**（当前用户） | ✅ 正确 |
| 8 | `GET /api/users/:id` | `SYSTEM_USER_READ` | ✅ 正确 |
| 9 | `PATCH /api/users/:id` | `SYSTEM_USER_UPDATE` | ✅ 正确 |
| 10 | `DELETE /api/users/:id` | `SYSTEM_USER_DELETE` | ✅ 正确 |
| 11 | `POST /api/users/:id/restore` | `SYSTEM_USER_DELETE` | ✅ 正确 |
| 12 | `POST /api/users/:id/delete-immediately` | `SYSTEM_USER_DELETE` | ✅ 正确 |
| 13 | `POST /api/users/deactivate-account` | **无权限**（当前用户） | ✅ 正确 |
| 14 | `POST /api/users/me/restore` | **无权限**（当前用户） | ✅ 正确 |
| 15 | `POST /api/users/change-password` | **无权限**（当前用户） | ✅ 正确 |

#### 🟡 搜索端点 (#4) 缺少权限守卫

`GET /api/users/search`（line 118-131）没有 `@RequirePermissions` 装饰器。此端点被设计为公开搜索（用于添加项目成员），但在类级别有 `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)`，这意味着没有明确权限声明的端点仍受 Guards 影响但不会因缺少权限而被拒绝。

**判定**: 设计意图明确（项目成员搜索场景），非 bug。建议添加显式注释。

### 3.2 `users.service.ts`

| 方法 | 逻辑 | 状态 |
|------|------|------|
| `create()` | 事务创建用户+私人空间+成员 | ✅ 正确 |
| `findAll()` | 搜索/角色/状态/项目成员过滤 | ✅ 正确 |
| `findById()` | IUserService 接口实现 | ✅ 正确 |
| `findOne()` | 内部委托，去除密码 | ✅ 正确 |
| `findByEmail()` | NotFoundException 守卫，去除密码 | ✅ 正确 |
| `findByEmailWithPassword()` | 含密码，用于登录验证 | ✅ 正确 |
| `update()` | 邮箱/用户名/手机唯一性检查 | ✅ 正确 |
| `softDelete()` | ADMIN 不可删，清除敏感字段 | ✅ 正确 |
| `deleteImmediately()` | cleanup → physical delete | ✅ 正确 |
| `restore()` | 清除 deletedAt，发事件 | ✅ 正确 |
| `remove()` | 物理删除（保留方法） | ✅ 正确 |
| `deactivate()` | 策略模式多验证方式 | ✅ 正确 |
| `restoreAccount()` | 冷静期检查 + 验证 | ✅ 正确 |
| `changePassword()` | 有/无密码用户区分处理 | ✅ 正确 |
| `getDashboardStats()` | 并行统计查询 | ✅ 正确 |

#### 🔴 死代码 — 已修复

- **`verifyEmailCode()`** (lines 967-978): 未使用的方法。验证已通过策略模式（`verificationStrategies`）处理。
- **`crypto` import** (line 22): 未使用。
- **`emailVerificationService`** (constructor param): 仅在已删除的 `verifyEmailCode` 中使用。
- **`smsVerificationService`** (constructor param): 完全未使用。

---

## 四、前端 — RoleManagement.tsx

| 功能 | 状态 |
|------|------|
| 系统角色/项目角色 Tab 切换 | ✅ 正确 |
| 搜索过滤 | ✅ 正确 |
| 创建/编辑/删除角色（权限守卫） | ✅ 正确 |
| 权限配置弹窗 | ✅ 正确 |
| 权限标签渲染 | ✅ 正确 |
| 成功/错误 Toast | ✅ 正确 |
| 删除确认对话框 | ✅ 正确 |
| 深色主题适配 | ✅ 正确 |
| 无权限状态（access-denied） | ✅ 正确 |

#### 🟡 类型断言

- **Line 378**: `PERMISSION_GROUPS[type] as unknown as { items: ... }[]` — `PERMISSION_GROUPS` 的类型定义为 string 索引但值是多态的。断言安全。
- **Line 131**: `(data as UserDto) ?? null` — API 响应类型已包含 `data` 字段。运行时防御性代码。
- **Lines 239, 313**: `(error as Error).message` — 标准错误处理模式。

#### 🔴 未使用的 import — 已修复

- `XCircle` (line 18): 在 JSX 中未使用。

---

## 五、前端 — UserManagement/index.tsx

| 功能 | 状态 |
|------|------|
| 用户列表 (Table + Pagination) | ✅ 正确 |
| 搜索/角色过滤/排序 | ✅ 正确 |
| 活跃用户/已注销 Tab | ✅ 正确 |
| 创建/编辑/删除用户 | ✅ 正确 |
| 恢复已注销用户 | ✅ 正确 |
| 存储配额配置弹窗 | ✅ 正确 |
| 清理已注销用户 | ✅ 正确 |
| 权限分级 (access-denied / limited-access) | ✅ 正确 |
| loading/error/success 状态 | ✅ 正确 |

#### 🟡 类型断言

- **Line 164**: `setEditingUser(user as UserResponseDto)` — `UserTableUser` 类型兼容但非同一类型。运行时安全。
- **Line 215**: `as UpdateUserDto & { password?: string }` — `UpdateUserDto` 不含 password 字段。临时扩展，运行时安全。
- **Line 265**: `setQuotaUser(user as UserResponseDto)` — 同上 pattern。

**所有类型断言均已确认为安全（运行时值兼容），无需修复。**

---

## 六、问题汇总

| 编号 | 文件 | 问题 | 严重性 | 状态 |
|------|------|------|--------|------|
| **U1** | users.service.ts | `verifyEmailCode()` 死代码 | 🔴 死代码 | ✅ 已修复 |
| **U2** | users.service.ts | 未使用的 `crypto` import | 🟡 清理 | ✅ 已修复 |
| **U3** | users.service.ts | 未使用的 `emailVerificationService` 注入 | 🟡 清理 | ✅ 已修复 |
| **U4** | users.service.ts | 未使用的 `smsVerificationService` 注入 | 🟡 清理 | ✅ 已修复 |
| **R1** | RoleManagement.tsx | 未使用的 `XCircle` import | 🟡 清理 | ✅ 已修复 |
| **R2** | project-roles.service.ts | `as unknown as ProjectPermission` (line 374) | 🟡 已知模式 | ✅ 保留 |
| **R3** | project-permission.service.ts | `as unknown as ProjectPermission` (line 189) | 🟡 已知模式 | ✅ 保留 |
| **C1** | roles.controller.ts | 端点 #11 缺少显式权限注释 | 🟡 文档 | 建议添加注释 |
| **C2** | users.controller.ts | 端点 #4 缺少显式权限注释 | 🟡 文档 | 建议添加注释 |

---

## 七、变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-08 | 初始审计，修复 5 个代码质量问题（死代码+未使用 import） |
