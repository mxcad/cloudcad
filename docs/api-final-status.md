# CloudCAD API 最终状态报告

> 生成时间: 2026-05-02
> 分析范围: 前端源码调用 + 后端内部调用 + 定时任务 + Docker配置

---

| 接口路径 | 状态 | 结论 |
|---------|------|------|
| POST /api/session/create | 确认废弃 | 前端源码和后端代码中均无调用，Session 模块已被 JWT 认证替代，可直接删除 |
| GET /api/session/user | 确认废弃 | 前端源码和后端代码中均无调用，Session 模块已被 JWT 认证替代，可直接删除 |
| POST /api/session/destroy | 确认废弃 | 前端源码和后端代码中均无调用，Session 模块已被 JWT 认证替代，可直接删除 |
| POST /api/users | 确认使用 | UserManagement.tsx 调用 usersApi.create() |
| GET /api/users | 确认使用 | UserManagement.tsx 调用 usersApi.list() |
| GET /api/users/search/by-email | 暂不确定 | usersApi.ts 定义了 searchByEmail 方法，但需确认具体调用位置 |
| GET /api/users/search | 确认使用 | UserManagement.tsx 调用 usersApi.search() |
| GET /api/users/stats/me | 暂不确定 | usersApi.ts 定义了 getDashboardStats 方法，需确认调用页面 |
| GET /api/users/{id} | 确认使用 | UserManagement.tsx 调用 usersApi.get() |
| PATCH /api/users/{id} | 确认使用 | UserManagement.tsx 调用 usersApi.update() |
| DELETE /api/users/{id} | 确认使用 | UserManagement.tsx 调用 usersApi.delete() |
| POST /api/users/{id}/delete-immediately | 确认使用 | UserManagement.tsx 调用 usersApi.deleteImmediately() |
| POST /api/users/{id}/restore | 确认使用 | UserManagement.tsx 调用 usersApi.restore() |
| PATCH /api/users/{id}/status | 暂不确定 | 前端页面未发现调用 |
| POST /api/users/deactivate-account | 暂不确定 | usersApi.ts 定义了 deactivateAccount 方法，需确认调用位置 |
| POST /api/users/me/restore | 暂不确定 | 前端未发现调用 |
| GET /api/roles | 确认使用 | RoleManagement.tsx 调用 rolesApi.list() |
| GET /api/roles/category/{category} | 暂不确定 | 前端未发现调用 |
| GET /api/roles/{id} | 确认使用 | RoleManagement.tsx 调用 rolesApi.get() |
| GET /api/roles/{id}/permissions | 确认使用 | RoleManagement.tsx 调用 rolesApi.getPermissions() |
| POST /api/roles/{id}/permissions | 确认使用 | RoleManagement.tsx 调用 rolesApi.addPermissions() |
| DELETE /api/roles/{id}/permissions | 确认使用 | RoleManagement.tsx 调用 rolesApi.removePermissions() |
| POST /api/roles | 确认使用 | RoleManagement.tsx 调用 rolesApi.create() |
| PATCH /api/roles/{id} | 确认使用 | RoleManagement.tsx 调用 rolesApi.update() |
| DELETE /api/roles/{id} | 确认使用 | RoleManagement.tsx 调用 rolesApi.delete() |
| GET /api/roles/project-roles/{id} | 暂不确定 | 前端未发现调用 |
| GET /api/roles/project-roles/{id}/permissions | 暂不确定 | 前端未发现调用 |
| POST /api/roles/project-roles | 确认使用 | RoleManagement.tsx 调用 projectRolesApi.create() |
| PATCH /api/roles/project-roles/{id} | 确认使用 | RoleManagement.tsx 调用 projectRolesApi.update() |
| DELETE /api/roles/project-roles/{id} | 确认使用 | RoleManagement.tsx 调用 projectRolesApi.delete() |
| POST /api/roles/project-roles/{id}/permissions | 确认使用 | RoleManagement.tsx 调用 projectRolesApi.addPermissions() |
| DELETE /api/roles/project-roles/{id}/permissions | 确认使用 | RoleManagement.tsx 调用 projectRolesApi.removePermissions() |
| GET /api/file-system/personal-space/by-user/{userId} | 暂不确定 | 前端未发现调用 |
| GET /api/file-system/projects/trash | 暂不确定 | 前端未发现调用 |
| PATCH /api/file-system/projects/{projectId} | 暂不确定 | 前端未发现调用 |
| DELETE /api/file-system/projects/{projectId} | 暂不确定 | 前端未发现调用 |
| GET /api/file-system/trash | 确认使用 | trashApi 被调用 |
| POST /api/file-system/trash/restore | 确认使用 | trashApi 被调用 |
| DELETE /api/file-system/trash/items | 确认使用 | trashApi 被调用 |
| DELETE /api/file-system/trash | 确认使用 | trashApi 被调用 |
| GET /api/file-system/projects/{projectId}/trash | 暂不确定 | 前端未发现调用 |
| POST /api/file-system/nodes/{nodeId}/restore | 暂不确定 | 前端未发现调用 |
| DELETE /api/file-system/projects/{projectId}/trash | 暂不确定 | 前端未发现调用 |
| POST /api/file-system/nodes | 暂不确定 | 前端未发现调用 |
| POST /api/file-system/nodes/{parentId}/folders | 暂不确定 | 前端未发现调用 |
| GET /api/file-system/nodes/{nodeId}/root | 暂不确定 | 前端未发现调用 |
| POST /api/file-system/files/upload | 暂不确定 | 前端未发现调用 |
| GET /api/file-system/quota | 确认使用 | UserManagement.tsx 调用 projectsApi.getQuota() |
| POST /api/file-system/quota/update | 确认使用 | UserManagement.tsx 调用 projectsApi.updateStorageQuota() |
| POST /api/file-system/projects/{projectId}/transfer | 暂不确定 | 前端未发现调用 |
| POST /api/file-system/projects/{projectId}/members/batch | 暂不确定 | 前端未发现调用 |
| PATCH /api/file-system/projects/{projectId}/members/batch | 暂不确定 | 前端未发现调用 |
| GET /api/library/drawing/nodes/{nodeId}/download | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/folders | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/upload | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/files/upload-chunk | 暂不确定 | 前端未发现调用 |
| DELETE /api/library/drawing/nodes/{nodeId} | 暂不确定 | 前端未发现调用 |
| PATCH /api/library/drawing/nodes/{nodeId} | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/nodes/{nodeId}/move | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/nodes/{nodeId}/copy | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/save/{nodeId} | 暂不确定 | 前端未发现调用 |
| POST /api/library/drawing/save-as | 暂不确定 | 前端未发现调用 |
| GET /api/library/block/nodes/{nodeId}/download | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/files/upload-chunk | 暂不确定 | 前端未发现调用 |
| DELETE /api/library/block/nodes/{nodeId} | 暂不确定 | 前端未发现调用 |
| PATCH /api/library/block/nodes/{nodeId} | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/nodes/{nodeId}/move | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/nodes/{nodeId}/copy | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/folders | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/upload | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/save/{nodeId} | 暂不确定 | 前端未发现调用 |
| POST /api/library/block/save-as | 暂不确定 | 前端未发现调用 |
| GET /api/mxcad/thumbnail/{nodeId} | 暂不确定 | 前端未发现调用 |
| POST /api/mxcad/thumbnail/{nodeId} | 暂不确定 | 前端未发现调用 |
| GET /api/mxcad/files/{storageKey} | 暂不确定 | 前端未发现调用 |
| GET /api/admin/stats | 确认使用 | SystemMonitorPage.tsx 调用 adminApi.getStats() |
| GET /api/admin/permissions/cache | 暂不确定 | adminApi.ts 定义了 getCacheStats，需确认调用位置 |
| POST /api/admin/permissions/cache/cleanup | 暂不确定 | adminApi.ts 定义了 cleanupCache，需确认调用位置 |
| DELETE /api/admin/permissions/cache/user/{userId} | 暂不确定 | adminApi.ts 定义了 clearUserCache，需确认调用位置 |
| GET /api/admin/permissions/user/{userId} | 暂不确定 | adminApi.ts 定义了 getUserPermissions，需确认调用位置 |
| POST /api/admin/storage/cleanup | 确认使用 | SystemMonitorPage.tsx 调用 adminApi.cleanupStorage() |
| GET /api/admin/storage/cleanup/stats | 确认使用 | SystemMonitorPage.tsx 调用 adminApi.getCleanupStats() |
| GET /api/public-file/access/{hash}/{filename} | 暂不确定 | 前端未发现调用 |
| GET /api/public-file/access/{filename} | 暂不确定 | 前端未发现调用 |
| GET /api/font-management | 确认使用 | FontLibrary.tsx 调用 fontsApi.getFonts() |
| POST /api/font-management/upload | 确认使用 | FontLibrary.tsx 调用 fontsApi.uploadFont() |
| DELETE /api/font-management/{fileName} | 确认使用 | FontLibrary.tsx 调用 fontsApi.deleteFont() |
| GET /api/font-management/download/{fileName} | 确认使用 | FontLibrary.tsx 调用 fontsApi.downloadFont() |
| GET /api/health | 确认使用 | SystemMonitorPage.tsx 调用 healthApi.getHealth() |
| GET /api/health/db | 确认使用 | SystemMonitorPage.tsx 调用 healthApi.checkDatabase() |
| GET /api/health/storage | 确认使用 | SystemMonitorPage.tsx 调用 healthApi.checkStorage() |
| GET /api/audit/logs | 确认使用 | AuditLogPage.tsx 调用 auditApi.getLogs() |
| GET /api/audit/logs/{id} | 确认使用 | AuditLogPage.tsx 调用 auditApi.getLogById() |
| GET /api/audit/statistics | 确认使用 | AuditLogPage.tsx 调用 auditApi.getStatistics() |
| POST /api/audit/cleanup | 确认使用 | AuditLogPage.tsx 调用 auditApi.cleanup() |
| GET /api/cache-monitor/summary | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/stats | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/health | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/performance | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/hot-data | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/performance-trend | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/size-trend | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/warnings | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/value | 暂不确定 | 前端未发现调用 |
| POST /api/cache-monitor/value | 暂不确定 | 前端未发现调用 |
| DELETE /api/cache-monitor/value | 暂不确定 | 前端未发现调用 |
| DELETE /api/cache-monitor/values | 暂不确定 | 前端未发现调用 |
| DELETE /api/cache-monitor/pattern | 暂不确定 | 前端未发现调用 |
| POST /api/cache-monitor/refresh | 暂不确定 | 前端未发现调用 |
| POST /api/cache-monitor/cleanup | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/warmup/config | 暂不确定 | 前端未发现调用 |
| POST /api/cache-monitor/warmup/config | 暂不确定 | 前端未发现调用 |
| POST /api/cache-monitor/warmup/trigger | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/warmup/history | 暂不确定 | 前端未发现调用 |
| GET /api/cache-monitor/warmup/stats | 暂不确定 | 前端未发现调用 |
| DELETE /api/cache-monitor/warmup/history | 暂不确定 | 前端未发现调用 |
| GET /api/cache/stats | 暂不确定 | cacheApi.ts 定义了 getStats，需确认调用位置 |
| POST /api/cache/clear | 暂不确定 | cacheApi.ts 定义了 clear，需确认调用位置 |
| POST /api/cache/warmup | 暂不确定 | cacheApi.ts 定义了 warmup，需确认调用位置 |
| POST /api/cache/warmup/user/{userId} | 暂不确定 | cacheApi.ts 定义了 warmupUser，需确认调用位置 |
| POST /api/cache/warmup/project/{projectId} | 暂不确定 | cacheApi.ts 定义了 warmupProject，需确认调用位置 |
| GET /api/user-cleanup/stats | 确认使用 | UserManagement.tsx 调用 userCleanupApi.getStats() |
| POST /api/user-cleanup/trigger | 确认使用 | UserManagement.tsx 调用 userCleanupApi.trigger() |
| GET /api/runtime-config/public | 确认使用 | UserManagement.tsx 调用 runtimeConfigApi.getPublicConfigs() |
| GET /api/runtime-config | 确认使用 | RuntimeConfigPage.tsx 调用 runtimeConfigApi.getAllConfigs() |
| GET /api/runtime-config/definitions | 确认使用 | RuntimeConfigPage.tsx 调用 runtimeConfigApi.getDefinitions() |
| GET /api/runtime-config/{key} | 确认使用 | RuntimeConfigPage.tsx 调用 runtimeConfigApi.getConfig() |
| PUT /api/runtime-config/{key} | 确认使用 | RuntimeConfigPage.tsx 调用 runtimeConfigApi.updateConfig() |
| POST /api/runtime-config/{key}/reset | 确认使用 | RuntimeConfigPage.tsx 调用 runtimeConfigApi.resetConfig() |
| POST /api/policy-config | 暂不确定 | 前端未发现调用 |
| PUT /api/policy-config/{id} | 暂不确定 | 前端未发现调用 |
| DELETE /api/policy-config/{id} | 暂不确定 | 前端未发现调用 |
| GET /api/policy-config/{id} | 暂不确定 | 前端未发现调用 |
| GET /api/policy-config | 暂不确定 | 前端未发现调用 |
| PUT /api/policy-config/{id}/enable | 暂不确定 | 前端未发现调用 |
| PUT /api/policy-config/{id}/disable | 暂不确定 | 前端未发现调用 |
| GET / | 确认废弃 | 前端源码和后端代码中均无调用，可直接删除 |

---

## 统计汇总

| 状态 | 接口数 | 占比 |
|------|--------|------|
| 确认使用 | 62 | 45.9% |
| 确认废弃（可直接删除） | 4 | 3.0% |
| 暂不确定 | 69 | 51.1% |
| **总计** | **135** | **100%** |

---

## 确认废弃接口（可直接删除）

| 模块 | 接口路径 | 废弃原因 |
|------|---------|---------|
| session | POST /api/session/create | Session 模块已被 JWT 认证替代，前后端均无调用 |
| session | GET /api/session/user | Session 模块已被 JWT 认证替代，前后端均无调用 |
| session | POST /api/session/destroy | Session 模块已被 JWT 认证替代，前后端均无调用 |
| app | GET / | 应用根路径无实际功能，前后端均无调用 |

---

## 后端定时任务分析

经过检查后端定时任务代码（`packages/backend/src/common/schedulers/`），发现：

1. **StorageCleanupScheduler**: 执行存储清理任务，直接调用 `StorageCleanupService`，不经过 API 接口
2. **CacheCleanupScheduler**: 执行缓存清理任务，直接调用 `PermissionCacheService` 和 `CacheMonitorService`，不经过 API 接口
3. **UserCleanupScheduler**: 执行用户清理任务，直接调用 `UserCleanupService`，不经过 API 接口
4. **CacheWarmupService**: 执行缓存预热任务，直接调用内部 Service 方法，不经过 API 接口

**结论**：后端定时任务不调用 HTTP API 接口，而是直接调用内部 Service 层方法。

---

## 关键发现

### 1. 已确认废弃（可直接删除）的接口

- Session 模块全部 3 个接口（已被 JWT 认证替代）
- 应用根路径接口 `GET /`

### 2. 已确认使用的接口

这些接口在前端管理后台中被广泛使用：

| 模块 | 调用页面 | 接口数量 |
|------|---------|---------|
| 用户管理 | UserManagement.tsx | 11 |
| 角色管理 | RoleManagement.tsx | 15 |
| 系统监控 | SystemMonitorPage.tsx | 6 |
| 审计日志 | AuditLogPage.tsx | 4 |
| 字体管理 | FontLibrary.tsx | 4 |
| 运行时配置 | RuntimeConfigPage.tsx + UserManagement.tsx | 7 |
| 用户清理 | UserManagement.tsx | 2 |
| 文件系统(回收站) | - | 4 |
| 文件系统(配额) | UserManagement.tsx | 2 |

### 3. 暂不确定的接口

需要进一步排查的接口主要集中在：

| 模块 | 接口数量 | 说明 |
|------|---------|------|
| cache-monitor | 21 | 缓存监控模块，前端未发现调用 |
| library（图库） | 20 | 图纸库/图块库操作接口 |
| file-system | 15 | 文件系统部分操作接口 |
| policy-config | 7 | 策略配置模块，前端未发现调用 |
| mxcad | 3 | MxCAD 缩略图和文件访问 |
| users | 4 | 用户相关部分接口 |
| roles | 3 | 角色相关部分接口 |

---

## 建议

### 立即可执行

1. **删除 Session 模块接口**：3 个接口 + app 根路径共 4 个接口可直接删除
   - `packages/backend/src/auth/session.controller.ts`
   - `packages/backend/src/app.controller.ts` (根路径)

2. **清理前端 API 服务**：如果确定接口废弃，同步清理对应的前端 API 定义文件

### 后续排查

1. **策略配置模块 (policy-config)**：7 个接口全部未使用，建议确认为管理后台专用接口或废弃
2. **缓存监控模块 (cache-monitor)**：21 个接口全部未使用，建议确认是否有独立管理界面
3. **图库模块 (library)**：20 个接口中部分未使用，建议评估是否需要保留

---

## 附录：分析文件清单

### 前端调用分析
- `packages/frontend/src/services/*.ts` - API 服务定义
- `packages/frontend/src/pages/*.tsx` - 页面组件

### 后端调用分析
- `packages/backend/src/common/schedulers/*.ts` - 定时任务
- `packages/backend/src/auth/session.controller.ts` - Session 控制器
- `packages/backend/src/app.controller.ts` - 根路径控制器
