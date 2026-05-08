# Admin / System Monitor — 功能审计

> **分支**: `main` (旧, 功能完整) vs `refactor/circular-deps` (新, 重构中)
> **审计日期**: 2026-05-08
> **范围**: `packages/backend/src/admin/`, `packages/frontend/src/pages/SystemMonitorPage.tsx`, `packages/frontend/src/pages/RuntimeConfigPage.tsx`

---

## 1. 后端 `admin.controller.ts`

### 1.1 端点逐项对比

| # | 端点 | main (旧) | refactor/circular-deps (新) | 判定 |
|---|------|-----------|---------------------------|------|
| 1 | `GET /admin/stats` | 占位返回 (只有 message + timestamp) | 占位返回 + TODO 注释 | 🟡 意图相同，均未实现 |
| 2 | `GET /admin/permissions/cache` | `cacheService.getStats()` 返回缓存命中率 | **<整条路由已删除>** | 🔴 意图不同 |
| 3 | `POST /admin/permissions/cache/cleanup` | `cacheService.cleanup()` 清理缓存 | **<整条路由已删除>** | 🔴 意图不同 |
| 4 | `DELETE /admin/permissions/cache/user/:userId` | `cacheService.clearUserCache(userId)` | **<整条路由已删除>** | 🔴 意图不同 |
| 5 | `GET /admin/permissions/user/:userId` | mock user + `permissionService.getUserPermissions()` | **<整条路由已删除>** | 🔴 意图不同 |
| 6 | `POST /admin/storage/cleanup` | `storageCleanupService.manualCleanup(delayDays)` | 保留，代码一致 | 🟢 意图相同 |
| 7 | `GET /admin/storage/cleanup/stats` | `storageCleanupService.getPendingCleanupStats()` | 保留，代码一致 | 🟢 意图相同 |

### 1.2 当前分支遗留问题

当前 `admin.controller.ts` **仍 import 但未使用**以下服务：
- `PermissionService` (line 33)
- `PermissionCacheService` (line 34)

以及对应的 DTO（也未使用）：
- `CacheStatsResponseDto` (line 39)
- `CacheCleanupResponseDto` (line 40)
- `UserPermissionsResponseDto` (line 41)
- `UserCacheClearResponseDto` (line 42)

这些未使用的 import 是重构过程中移除端点后残留的。

---

## 2. 后端 DTO `admin-response.dto.ts`

| DTO | main | refactor/circular-deps | 判定 |
|-----|------|----------------------|------|
| `AdminStatsResponseDto` | 一致 | 一致 | 🟢 |
| `CacheStatsDto` / `AdminCacheStatsDto` | 命名为 `CacheStatsDto` | 重命名为 `AdminCacheStatsDto` | 🟢 纯重命名 |
| `CacheStatsResponseDto` | 引用 `CacheStatsDto` | 引用 `AdminCacheStatsDto` | 🟢 |
| `CacheCleanupResponseDto` | 一致 | 一致 | 🟢 |
| `UserPermissionInfoDto` | 一致 | 一致 | 🟢 |
| `UserPermissionsResponseDto` | 一致 | 一致 | 🟢 |
| `UserCacheClearResponseDto` | 一致 | 一致 | 🟢 |

---

## 3. 前端 `SystemMonitorPage.tsx`

### 3.1 功能逐项对比

| 功能 | main (旧) | refactor/circular-deps (新) | 判定 |
|------|-----------|---------------------------|------|
| 健康检查获取 | `healthApi.getHealth()` | `healthControllerCheck()` (auto-generated SDK) | 🟢 意图相同 |
| 数据库状态卡片 | ✅ | ✅ | 🟢 |
| 存储服务状态卡片 | ✅ | ✅ | 🟢 |
| 应用服务卡片 (硬编码 up) | ✅ | ✅ | 🟢 |
| 系统信息区块 (名称/环境/刷新间隔/版本) | ✅ | ✅ | 🟢 |
| 30秒自动刷新 | ✅ | ✅ | 🟢 |
| 权限检查 (`SYSTEM_MONITOR`) | ✅ | ✅ | 🟢 |
| UI 布局/样式 | ✅ | ✅ | 🟢 |
| 存储清理统计 (`adminApi.getCleanupStats()`) | ✅ 调用后端 | ❌ TODO 桩，打印 console.log，设模拟数据 | 🔴 意图相同，**实现缺失** |
| 存储清理执行 (`adminApi.cleanupStorage()`) | ✅ 调用后端 | ❌ 返回 "存储清理功能暂未实现" | 🔴 意图相同，**实现缺失** |
| `safeMessage` 辅助函数 | 无 | 新增 | 🟡 新增防御性代码 |

### 3.2 🔴 NEEDS DECISION — `adminApi` 服务缺失

当前分支的 `SystemMonitorPage.tsx` 中 `fetchCleanupStats` 和 `handleCleanupStorage` 均标注了 TODO：
```typescript
// TODO: Implement adminApi when backend endpoint is ready
```

后端端点 `POST /admin/storage/cleanup` 和 `GET /admin/storage/cleanup/stats` **在当前分支中已经存在且实现完整**。问题是前端缺少对应的 API 客户端 (`adminApi`)。需要：
1. 确认 `@/api-sdk` 中是否已生成 admin 相关的 SDK 函数
2. 如果没有，需要重新生成 API types 或手动创建 `adminApi` 服务

---

## 4. 前端 `RuntimeConfigPage.tsx`

### 4.1 功能逐项对比

| 功能 | main (旧) | refactor/circular-deps (新) | 判定 |
|------|-----------|---------------------------|------|
| 获取所有配置 | `runtimeConfigApi.getAllConfigs()` | `runtimeConfigControllerGetAllConfigs()` (SDK) | 🟢 意图相同 |
| 更新配置 | `runtimeConfigApi.updateConfig(key, value)` | `runtimeConfigControllerUpdateConfig({path, body})` | 🟢 意图相同 |
| 重置配置 | `runtimeConfigApi.resetConfig(key)` | `runtimeConfigControllerResetConfig({path})` | 🟢 意图相同 |
| 按分类分组展示 | ✅ | ✅ | 🟢 |
| 分类图标映射 (8类) | ✅ | ✅ | 🟢 |
| 敏感字段隐藏/显示 | ✅ | ✅ | 🟢 |
| 配置单位显示 (GB/MB) | ✅ | ✅ | 🟢 |
| 权限检查 (`SYSTEM_CONFIG_WRITE`) | ✅ | ✅ | 🟢 |
| 修改标记/待保存计数 | ✅ | ✅ | 🟢 |
| 确认对话框 (重置) | ✅ `showConfirm` | ✅ `showConfirm` | 🟢 |
| Toast 通知 | ✅ `showToast` | ✅ `showToast` | 🟢 |
| 空状态处理 | ✅ | ✅ | 🟢 |
| boolean 类型 toggle 位置 | input-wrapper 内 | action-buttons 内 | 🟡 实现细节差异，**意图相同** |
| 类型来源 | `runtimeConfigApi.RuntimeConfigItem` | `RuntimeConfigResponseDto` (from `@/api-sdk`) | 🟢 意图相同 |

### 4.2 判定

**RuntimeConfigPage 功能完整性 = ✅ 100%**。所有功能意图保持一致，仅 API 调用方式和类型来源从手动维护的 `runtimeConfigApi` 迁移到了自动生成的 `@/api-sdk`。

---

## 5. 汇总

### 5.1 功能完整性矩阵

| 模块 | 端点/功能数 (main) | 保留 | 缺失 | 需决策 |
|------|-------------------|------|------|--------|
| Backend Admin Controller | 7 | 3 | 4 | 4 |
| Backend Admin DTO | 7 classes | 7 | 0 | 0 |
| Frontend SystemMonitorPage | 10 | 8 | 2 | 1 |
| Frontend RuntimeConfigPage | 12 | 12 | 0 | 0 |

### 5.2 🔴 NEEDS DECISION 清单

| ID | 描述 | 影响 |
|----|------|------|
| **ADMIN-01** | 后端 4 个权限缓存管理端点被移除 (`GET/POST/DELETE /admin/permissions/cache/*`, `GET /admin/permissions/user/:userId`) | 管理员无法通过 API 查看/清理权限缓存、查询用户权限 |
| **ADMIN-02** | 前端 `adminApi` 服务缺失导致 SystemMonitorPage 存储清理功能不可用 | 管理员无法在前端页面执行存储清理、查看待清理统计 |

### 5.3 后端 Controller 清理建议

当前 `admin.controller.ts` 有未使用的 import（`PermissionService`, `PermissionCacheService` 及 4 个 DTO）。无论 ADMIN-01 的决策结果如何，都应该：
- 如果决定**恢复**这 4 个端点：重新实现它们
- 如果决定**永久移除**这 4 个端点：清理未使用的 import

---

## 6. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-08 | 初始审计完成 |
