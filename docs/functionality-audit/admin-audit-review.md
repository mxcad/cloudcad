# Admin + Audit-Log 模块审查报告

> **审查日期**: 2026-05-08
> **分支**: `refactor/circular-deps`
> **范围**: `packages/backend/src/admin/`, `packages/backend/src/audit/`, `packages/frontend/src/pages/{SystemMonitorPage,AuditLogPage,RuntimeConfigPage}.tsx`
> **审查维度**: 代码质量、类型安全、前后端一致性、未使用代码、安全风险

---

## 1. 审查总览

| 维度 | 评级 | 说明 |
|------|------|------|
| 代码质量 | 🟡 良好 | 少量格式问题和未使用代码 |
| 类型安全 | 🟡 良好 | 1 处 `as unknown as` 已修复，2 处 `as EnumType` 为合理使用 |
| 前后端一致性 | 🟢 良好 | 枚举值已同步到前端 |
| 功能完整性 | 🟡 良好 | 存储清理前端为 stub 实现 |
| 安全风险 | 🟢 良好 | 无新发现的安全漏洞 |

---

## 2. 已修复问题（自动修复）

### 2.1 `admin.controller.ts` — 移除未使用的 imports 和服务

**问题**: 重构中移除权限缓存端点后，以下 imports 和注入变为未使用：
- `RolesGuard` — 与 `PermissionsGuard` 功能重叠
- `PermissionService`、`PermissionCacheService` — 原用于已移除的端点
- `CacheStatsResponseDto`、`CacheCleanupResponseDto`、`UserPermissionsResponseDto`、`UserCacheClearResponseDto` — 对应 DTO 也无引用

**修复**:
- 移除 `RolesGuard` import，`@UseGuards` 从三守卫简化为 `(JwtAuthGuard, PermissionsGuard)`
- 移除 `PermissionService`、`PermissionCacheService` import 及 constructor 参数
- 移除 4 个未使用的 DTO import

### 2.2 `AuditLogPage.tsx` — 补充缺失的枚举值

**问题**: 前端硬编码的枚举值与后端 `audit.enum.ts` 不一致：
- `AuditAction` 缺少 `PROJECT_CREATE`
- `ResourceType` 缺少 `SYSTEM`
- 对应的中文映射也缺失

**修复**:
- `AuditAction` 新增 `PROJECT_CREATE: 'PROJECT_CREATE'`
- `ACTION_NAME_MAP` 新增 `PROJECT_CREATE: '创建项目'`
- `ResourceType` 新增 `SYSTEM: 'SYSTEM'`
- `RESOURCE_TYPE_MAP` 新增 `SYSTEM: '系统'`

### 2.3 `RuntimeConfigPage.tsx` — 消除 `as unknown as` 类型断言

**问题**: `parseValue` 函数使用 `item.value as unknown as string | number | boolean` 绕过类型检查。

**修复**: 替换为运行时类型检查：
```typescript
const val = item.value;
if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
  return val;
}
return String(val);
```

---

## 3. 未修复问题（需人工决策）

### 3.1 `audit-log.controller.ts` — `as AuditAction` / `as ResourceType` 类型断言

**位置**: 第 81-82 行
```typescript
if (action) filters.action = action as AuditAction;
if (resourceType) filters.resourceType = resourceType as ResourceType;
```

**分析**: 查询参数为 `string` 类型，需要转换为枚举。这是合理的窄化断言（query string → enum），风险低。如需改进可添加运行时校验。

**严重度**: 🟢 低 — 可接受的使用场景

### 3.2 `audit-log.service.ts` — JSDoc 格式异常

**问题**: `findAll`、`findOne`、`getStatistics`、`cleanupOldLogs` 方法的 JSDoc 注释中存在过量空行，格式不统一。

**严重度**: 🟢 低 — 仅影响可读性，不影响功能

### 3.3 `SystemMonitorPage.tsx` — 存储清理功能未实现

**问题**: 存储清理的统计获取和执行均为 TODO stub，使用模拟数据：
```typescript
// TODO: Implement adminApi when backend endpoint is ready
setCleanupStats({ total: 0, expiryDate: new Date().toISOString(), delayDays: 30 });
setCleanupError('存储清理功能暂未实现');
```

后端 `admin.controller.ts` 已有 `POST /admin/storage/cleanup` 和 `GET /admin/storage/cleanup/stats` 端点，但前端未接入。

**严重度**: 🟡 中 — 功能缺口，需后续接入 API

### 3.4 `SystemMonitorPage.tsx` — 硬编码版本号

**问题**: 版本号硬编码为 `v1.0.0`，非动态获取。

**建议**: 从环境变量或 API 获取版本号。

**严重度**: 🟢 低

### 3.5 `systemmonitorPage.tsx` — `safeMessage` 函数冗余

**问题**: `safeMessage` 函数先检查 `typeof msg === 'string'`，又检查 `typeof msg === 'object'`，最后 fallback。但在 `ServiceCard` 组件调用处（第 283 行）仍使用了 `String(systemHealth?.storage.message || '检测中...')`，绕过了 `safeMessage`。

**严重度**: 🟢 低

### 3.6 `audit-log.service.ts` — `cleanupOldLogs` 的 `userId` 参数未验证

**问题**: `cleanupOldLogs(daysToKeep, userId)` 接受 `userId` 仅用于日志记录，默认值为 `'unknown'`。如果调用方未传递真实 userId，日志记录无意义。

**严重度**: 🟢 低 — 日志记录用途，不影响数据安全

---

## 4. 安全性审查

| 检查项 | 结果 |
|--------|------|
| 认证守卫 | ✅ 所有端点使用 `JwtAuthGuard` |
| 权限控制 | ✅ `@RequirePermissions([SystemPermission.SYSTEM_ADMIN])` 正确应用 |
| 输入验证 | ✅ 查询参数无直接拼接风险 |
| SQL 注入 | ✅ 使用 Prisma ORM 参数化查询 |
| XSS | ✅ 前端使用 React JSX 自动转义 |
| 敏感信息 | ✅ `RuntimeConfigPage` 敏感字段使用 `password` 类型输入框 |

---

## 5. 修复提交统计

| 文件 | 修改内容 |
|------|---------|
| `packages/backend/src/admin/admin.controller.ts` | 移除 5 个未使用 import、1 个冗余 Guard、2 个未使用服务参数 |
| `packages/frontend/src/pages/AuditLogPage.tsx` | 补充 `PROJECT_CREATE`、`SYSTEM` 枚举及中文映射 |
| `packages/frontend/src/pages/RuntimeConfigPage.tsx` | 消除 `as unknown as` 类型断言，替换为运行时类型检查 |

---

## 6. 建议后续行动

1. **接入存储清理 API** — `SystemMonitorPage` 需要导入 admin API SDK 并调用真实端点
2. **动态版本号** — 从构建变量或 API 获取版本
3. **统一 JSDoc 格式** — 修复 `audit-log.service.ts` 中多余空行
4. **考虑前端枚举统一管理** — `AuditLogPage.tsx` 中的枚举定义与后端 `audit.enum.ts` 重复，可考虑通过 API 类型生成共享
